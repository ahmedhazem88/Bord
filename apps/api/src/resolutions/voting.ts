import type { Prisma, VoteValue } from "@prisma/client";
import { BOARD_ROLES } from "@bord/shared";
import { appendAuditLog } from "../audit/auditLog.js";
import { computeQuorum, getMeetingRoster, resolveQuorumRules } from "../meetings/quorum.js";
import { tally, checkMajority, type MajorityRule } from "./majority.js";
import { passResolution, failResolutionVote, type ResolutionEffectPayload } from "./engine.js";

export class VotingError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

async function loadResolutionMeetingContext(tx: Prisma.TransactionClient, resolutionId: string) {
  const resolution = await tx.resolution.findUniqueOrThrow({
    where: { id: resolutionId },
    include: { agendaItem: { include: { meeting: true } } },
  });
  const meeting = resolution.agendaItem?.meeting;
  if (!meeting) {
    // Bootstrap-style resolutions (no convened meeting, e.g. onboarding
    // seed) don't go through the voting engine at all — they use the
    // direct /pass endpoint instead. See PRD 5.4 / spec section 13's open
    // item on written resolutions without a meeting.
    throw new VotingError("this resolution has no associated meeting to vote at", 400);
  }
  return { resolution, meeting };
}

/**
 * Resolves which Capacity (if any) the voting user holds that is eligible
 * to vote on this resolution's meeting, and the weight that vote carries —
 * spec section 6: board votes are one-member-one-vote, GA votes are
 * one-share-one-vote (Capacity.sharePercentage).
 */
async function resolveVoterCapacity(tx: Prisma.TransactionClient, entityId: string, userId: string, meetingType: string, committeeId: string | null) {
  const now = new Date();
  if (meetingType === "OGM" || meetingType === "EGM") {
    const capacity = await tx.capacity.findFirst({
      where: { userId, entityId, role: "GA_MEMBER", active: true, verificationStatus: "APPROVED", startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gt: now } }] },
    });
    if (!capacity) return null;
    return { capacityId: capacity.id, weight: capacity.sharePercentage ? Number(capacity.sharePercentage) : 1 };
  }

  if (meetingType === "COMMITTEE" && committeeId) {
    const capacity = await tx.capacity.findFirst({
      where: { userId, entityId, active: true, verificationStatus: "APPROVED" },
      include: { committeeMemberships: { where: { committeeId, endDate: null } } },
    });
    if (!capacity || capacity.committeeMemberships.length === 0) return null;
    return { capacityId: capacity.id, weight: 1 };
  }

  // BOARD
  const capacity = await tx.capacity.findFirst({
    where: { userId, entityId, role: { in: [...BOARD_ROLES] }, active: true, verificationStatus: "APPROVED", startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gt: now } }] },
  });
  if (!capacity) return null;
  return { capacityId: capacity.id, weight: 1 };
}

export interface CastVoteInput {
  resolutionId: string;
  voterUserId: string;
  value: VoteValue;
  recusalReason?: string;
  // Proxy-cast: vote on behalf of this GA member capacity, using an active
  // Proxy grant from them to the caller's own capacity for this meeting
  // (spec section 6). The resulting Vote is recorded against the GRANTOR's
  // capacity and weight — the caller is just the hand casting it.
  onBehalfOfCapacityId?: string;
  // Required to cast anything other than RECUSED once the voter has an
  // active declared interest naming something this agenda item is actually
  // about (spec section 9) — a soft, overridable default, unlike Art. 74's
  // hard exclusion below.
  interestOverrideReason?: string;
}

export async function castVote(tx: Prisma.TransactionClient, input: CastVoteInput) {
  const { resolution, meeting } = await loadResolutionMeetingContext(tx, input.resolutionId);

  if (resolution.status !== "DRAFT") {
    throw new VotingError(`voting is closed — resolution is ${resolution.status}, not open for votes`, 409);
  }

  const granteeCapacity = await resolveVoterCapacity(tx, resolution.entityId, input.voterUserId, meeting.type, meeting.committeeId);
  if (!granteeCapacity) {
    throw new VotingError("you do not hold a capacity entitled to vote at this meeting", 403);
  }

  let voter = granteeCapacity;
  // Art. 74 checks the person whose remuneration/discharge is actually at
  // stake — for a proxy-cast vote that's the grantor, not the capacity
  // physically casting it.
  let art74CheckUserId = input.voterUserId;
  let proxyId: string | undefined;

  if (input.onBehalfOfCapacityId) {
    const proxy = await tx.proxy.findFirst({
      where: {
        meetingId: meeting.id,
        grantorCapacityId: input.onBehalfOfCapacityId,
        granteeCapacityId: granteeCapacity.capacityId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (!proxy) {
      throw new VotingError("no active proxy grant from that capacity to you for this meeting", 403);
    }
    const grantorCapacity = await tx.capacity.findUniqueOrThrow({ where: { id: input.onBehalfOfCapacityId } });
    voter = { capacityId: grantorCapacity.id, weight: grantorCapacity.sharePercentage ? Number(grantorCapacity.sharePercentage) : 1 };
    art74CheckUserId = grantorCapacity.userId;
    proxyId = proxy.id;
  }

  const [roster, attendance, rules] = await Promise.all([
    getMeetingRoster(tx, resolution.entityId, meeting.type, meeting.committeeId),
    tx.meetingAttendance.findMany({ where: { meetingId: meeting.id }, select: { capacityId: true, mode: true } }),
    resolveQuorumRules(tx, resolution.entityId),
  ]);
  const quorum = computeQuorum(meeting.type, meeting.isSecondMeeting, roster, attendance, rules);
  if (!quorum.met) {
    throw new VotingError(`voting is blocked — quorum is not met (${quorum.basis})`, 409);
  }

  // For a proxy-cast vote, this checks the GRANTOR's attendance — set to
  // PROXY mode automatically when the proxy was granted (meetings/routes.ts).
  const isAttending = attendance.some((a) => a.capacityId === voter.capacityId && a.mode !== "ABSENT");
  if (!isAttending) {
    throw new VotingError("record your attendance before voting", 409);
  }

  // Art. 74 hard exclusion: a board member holding shares cannot vote on
  // the GA resolution setting their own remuneration — enforced regardless
  // of what value they requested, not a self-declared recusal.
  let value = input.value;
  let excludedByLaw = false;
  let recusalReason = input.recusalReason;
  if (resolution.type === "GA_SET_BOARD_REMUNERATION") {
    const now = new Date();
    const boardCapacity = await tx.capacity.findFirst({
      where: { userId: art74CheckUserId, entityId: resolution.entityId, role: { in: [...BOARD_ROLES] }, active: true, startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gt: now } }] },
    });
    if (boardCapacity) {
      excludedByLaw = true;
      value = "RECUSED";
      recusalReason = `Art. 74 hard exclusion — holds a board capacity (${boardCapacity.role}) at this entity; requested vote was ${input.value}.`;
    }
  }

  // Interest registry (spec section 9): defaults to Recused, not a hard
  // exclusion — Art. 74 above already forced it if that applies, so this
  // only matters when it didn't.
  let interestOverrideApplied = false;
  if (!excludedByLaw) {
    const declarations = await tx.interestDeclaration.findMany({ where: { capacityId: voter.capacityId, active: true } });
    const itemText = `${resolution.agendaItem?.title ?? ""} ${resolution.agendaItem?.description ?? ""} ${resolution.title} ${resolution.description}`.toLowerCase();
    const matched = declarations.find((d) => itemText.includes(d.relatedEntityName.toLowerCase()));
    if (matched) {
      if (input.interestOverrideReason) {
        interestOverrideApplied = true;
      } else {
        value = "RECUSED";
        recusalReason = `Declared-interest default recusal — ${matched.relatedEntityName} (${matched.natureOfInterest}); requested vote was ${input.value}. Pass interestOverrideReason to vote anyway.`;
      }
    }
  }

  const vote = await tx.vote.upsert({
    where: { resolutionId_voterCapacityId: { resolutionId: resolution.id, voterCapacityId: voter.capacityId } },
    create: { resolutionId: resolution.id, voterCapacityId: voter.capacityId, proxyId, value, excludedByLaw, recusalReason, weight: voter.weight },
    update: { value, excludedByLaw, recusalReason, weight: voter.weight, proxyId, timestamp: new Date() },
  });

  await appendAuditLog(tx, {
    entityId: resolution.entityId,
    actorUserId: input.voterUserId,
    action: interestOverrideApplied ? "VOTE_CAST_DESPITE_DECLARED_INTEREST" : "VOTE_CAST",
    tableName: "Vote",
    recordId: vote.id,
    afterData: {
      resolutionId: resolution.id,
      value,
      excludedByLaw,
      weight: voter.weight,
      castAsProxyFor: input.onBehalfOfCapacityId,
      ...(interestOverrideApplied ? { interestOverrideReason: input.interestOverrideReason } : {}),
    },
  });

  return vote;
}

export async function getResolutionTally(tx: Prisma.TransactionClient, resolutionId: string) {
  const { resolution, meeting } = await loadResolutionMeetingContext(tx, resolutionId);
  const votes = await tx.vote.findMany({ where: { resolutionId } });
  const result = tally(votes.map((v) => ({ value: v.value, weight: v.weight, excludedByLaw: v.excludedByLaw })));
  const majorityCheck = checkMajority(resolution.requiredMajority as MajorityRule, result);

  const [roster, attendance, rules] = await Promise.all([
    getMeetingRoster(tx, resolution.entityId, meeting.type, meeting.committeeId),
    tx.meetingAttendance.findMany({ where: { meetingId: meeting.id }, select: { capacityId: true, mode: true } }),
    resolveQuorumRules(tx, resolution.entityId),
  ]);
  const quorum = computeQuorum(meeting.type, meeting.isSecondMeeting, roster, attendance, rules);

  return { tally: result, requiredMajority: resolution.requiredMajority, wouldPass: majorityCheck.passed, requiredWeight: majorityCheck.requiredWeight, quorum };
}

/**
 * Chairman/Secretary closes voting on a resolution: tallies the votes cast,
 * checks them against the required majority, and either applies the
 * resolution's proposedEffect (passResolution — same engine every other
 * path uses) or marks it REJECTED. Blocked if quorum has been lost since
 * voting began.
 */
export async function closeVotingAndTally(tx: Prisma.TransactionClient, resolutionId: string, actorUserId: string) {
  const { resolution, meeting } = await loadResolutionMeetingContext(tx, resolutionId);
  if (resolution.status !== "DRAFT") {
    throw new VotingError(`resolution is already ${resolution.status}`, 409);
  }

  const [roster, attendance, rules] = await Promise.all([
    getMeetingRoster(tx, resolution.entityId, meeting.type, meeting.committeeId),
    tx.meetingAttendance.findMany({ where: { meetingId: meeting.id }, select: { capacityId: true, mode: true } }),
    resolveQuorumRules(tx, resolution.entityId),
  ]);
  const quorum = computeQuorum(meeting.type, meeting.isSecondMeeting, roster, attendance, rules);
  if (!quorum.met) {
    throw new VotingError(`cannot close voting — quorum is not met (${quorum.basis})`, 409);
  }

  const votes = await tx.vote.findMany({ where: { resolutionId } });
  const tallyResult = tally(votes.map((v) => ({ value: v.value, weight: v.weight, excludedByLaw: v.excludedByLaw })));
  const majorityCheck = checkMajority(resolution.requiredMajority as MajorityRule, tallyResult);

  if (!majorityCheck.passed) {
    const failed = await failResolutionVote(tx, resolutionId, actorUserId, tallyResult);
    return { outcome: "REJECTED" as const, resolution: failed, tally: tallyResult };
  }

  const effect = (resolution.proposedEffect as ResolutionEffectPayload | null) ?? { type: "PROCEDURAL" as const };
  const passed = await passResolution(tx, resolutionId, actorUserId, effect);
  return { outcome: "PASSED" as const, resolution: passed, tally: tallyResult };
}
