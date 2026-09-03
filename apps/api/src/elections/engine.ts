import type { GovernanceRole, Prisma } from "@prisma/client";
import { appendAuditLog } from "../audit/auditLog.js";
import { computeQuorum, getMeetingRoster, resolveQuorumRules } from "../meetings/quorum.js";
import { createResolution, passResolution } from "../resolutions/engine.js";

export class ElectionError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

export interface CreateElectionInput {
  entityId: string;
  meetingId: string;
  title: string;
  description?: string;
  seatsOpen: number;
  candidates: { userId: string; proposedRole: GovernanceRole }[];
  actorUserId: string;
}

/**
 * Cumulative voting for board elections (spec section 6, 2018 amendment).
 * Creates the election's agenda item (already CONFIRMED — set directly by
 * whoever holds agenda:set, same as the ordinary agenda-items endpoint)
 * plus the election and its candidate slate. Each GA member's total
 * cumulative budget (shares x seats open) isn't computed here — it's
 * checked per-allocation in castCumulativeVote, since it only matters
 * relative to what that voter has already allocated.
 */
export async function createElection(tx: Prisma.TransactionClient, input: CreateElectionInput) {
  const meeting = await tx.meeting.findUniqueOrThrow({ where: { id: input.meetingId } });
  if (meeting.type !== "OGM" && meeting.type !== "EGM") {
    throw new ElectionError("board elections are a GA (OGM/EGM) matter", 400);
  }
  if (input.seatsOpen < 1) {
    throw new ElectionError("seatsOpen must be at least 1", 400);
  }
  const distinctUserIds = new Set(input.candidates.map((c) => c.userId));
  if (distinctUserIds.size !== input.candidates.length) {
    throw new ElectionError("duplicate candidate in the slate", 400);
  }
  if (input.candidates.length < input.seatsOpen) {
    throw new ElectionError("fewer candidates than seats open", 400);
  }

  const maxOrder = await tx.agendaItem.aggregate({ where: { meetingId: input.meetingId }, _max: { order: true } });
  const agendaItem = await tx.agendaItem.create({
    data: {
      meetingId: input.meetingId,
      order: (maxOrder._max.order ?? -1) + 1,
      title: input.title,
      description: input.description,
      status: "CONFIRMED",
      reviewedByUserId: input.actorUserId,
      reviewedAt: new Date(),
    },
  });

  const election = await tx.boardElection.create({
    data: {
      entityId: input.entityId,
      agendaItemId: agendaItem.id,
      seatsOpen: input.seatsOpen,
      candidates: { create: input.candidates.map((c) => ({ userId: c.userId, proposedRole: c.proposedRole })) },
    },
    include: { candidates: true },
  });

  await appendAuditLog(tx, {
    entityId: input.entityId,
    actorUserId: input.actorUserId,
    action: "BOARD_ELECTION_CREATED",
    tableName: "BoardElection",
    recordId: election.id,
    afterData: { seatsOpen: input.seatsOpen, candidateCount: input.candidates.length },
  });

  return election;
}

export interface AllocateVoteInput {
  entityId: string;
  electionId: string;
  voterUserId: string;
  candidateId: string;
  votes: number;
  actorUserId: string;
}

/**
 * Sets (not increments) this voter's allocation to one candidate — callers
 * adjust by re-sending the new total for that candidate, same convention
 * as the ordinary vote-cast upsert. Rejected if it would push the voter's
 * total allocation across every candidate in this election over their
 * cumulative budget (shares x seats open).
 */
export async function castCumulativeVote(tx: Prisma.TransactionClient, input: AllocateVoteInput) {
  if (input.votes < 0) {
    throw new ElectionError("votes cannot be negative", 400);
  }
  const election = await tx.boardElection.findUniqueOrThrow({ where: { id: input.electionId }, include: { agendaItem: { include: { meeting: true } } } });
  if (election.status !== "OPEN") {
    throw new ElectionError(`election is already ${election.status}`, 409);
  }
  const candidate = await tx.boardElectionCandidate.findUniqueOrThrow({ where: { id: input.candidateId } });
  if (candidate.electionId !== election.id) {
    throw new ElectionError("candidate does not belong to this election", 400);
  }

  const voterCapacity = await tx.capacity.findFirst({
    where: { userId: input.voterUserId, entityId: input.entityId, role: "GA_MEMBER", active: true, verificationStatus: "APPROVED" },
  });
  if (!voterCapacity) {
    throw new ElectionError("you must hold an active GA member capacity to vote in a board election", 403);
  }
  // Same requirement as an ordinary resolution vote (resolutions/voting.ts)
  // — record attendance (in person, virtual, or via proxy) before voting.
  const attendance = await tx.meetingAttendance.findFirst({ where: { meetingId: election.agendaItem.meeting.id, capacityId: voterCapacity.id } });
  if (!attendance || attendance.mode === "ABSENT") {
    throw new ElectionError("record your attendance at this meeting before allocating cumulative votes", 409);
  }

  const budget = (voterCapacity.sharePercentage ? Number(voterCapacity.sharePercentage) : 0) * election.seatsOpen;
  const existingAllocations = await tx.cumulativeVoteAllocation.findMany({
    where: { electionId: election.id, voterCapacityId: voterCapacity.id },
  });
  const allocatedElsewhere = existingAllocations.filter((a) => a.candidateId !== input.candidateId).reduce((sum, a) => sum + a.votes, 0);
  if (allocatedElsewhere + input.votes > budget + 1e-9) {
    throw new ElectionError(
      `allocation exceeds your cumulative budget (${budget.toFixed(3)} = ${voterCapacity.sharePercentage ?? 0}% shares x ${election.seatsOpen} seats); ${allocatedElsewhere.toFixed(3)} already allocated to other candidates`,
      400,
    );
  }

  const allocation = await tx.cumulativeVoteAllocation.upsert({
    where: { candidateId_voterCapacityId: { candidateId: input.candidateId, voterCapacityId: voterCapacity.id } },
    create: { electionId: election.id, candidateId: input.candidateId, voterCapacityId: voterCapacity.id, votes: input.votes },
    update: { votes: input.votes },
  });

  await appendAuditLog(tx, {
    entityId: input.entityId,
    actorUserId: input.actorUserId,
    action: "CUMULATIVE_VOTE_ALLOCATED",
    tableName: "CumulativeVoteAllocation",
    recordId: allocation.id,
    afterData: { electionId: election.id, candidateId: input.candidateId, votes: input.votes },
  });

  return allocation;
}

export interface ElectionTallyEntry {
  candidateId: string;
  userId: string;
  proposedRole: GovernanceRole;
  votes: number;
}

async function tallyElection(tx: Prisma.TransactionClient, electionId: string): Promise<ElectionTallyEntry[]> {
  const candidates = await tx.boardElectionCandidate.findMany({
    where: { electionId },
    include: { allocations: true },
    orderBy: { id: "asc" }, // stable tie-break: earliest-added candidate ranks first among equal vote totals
  });
  return candidates
    .map((c) => ({ candidateId: c.id, userId: c.userId, proposedRole: c.proposedRole, votes: c.allocations.reduce((sum, a) => sum + a.votes, 0) }))
    .sort((a, b) => b.votes - a.votes);
}

/**
 * Closes voting, requires quorum, and appoints the top `seatsOpen`
 * candidates by cumulative votes received — each becomes a real
 * BOARD_APPOINTMENT resolution (same Resolution Engine effect every other
 * appointment path uses), passed immediately since the cumulative tally
 * itself is the decision mechanism, not a separate FOR/AGAINST vote.
 */
export async function closeElection(tx: Prisma.TransactionClient, entityId: string, electionId: string, actorUserId: string) {
  const election = await tx.boardElection.findUniqueOrThrow({ where: { id: electionId }, include: { agendaItem: { include: { meeting: true } } } });
  if (election.status !== "OPEN") {
    throw new ElectionError(`election is already ${election.status}`, 409);
  }
  const meeting = election.agendaItem.meeting;

  const [roster, attendance, rules] = await Promise.all([
    getMeetingRoster(tx, entityId, meeting.type, meeting.committeeId),
    tx.meetingAttendance.findMany({ where: { meetingId: meeting.id }, select: { capacityId: true, mode: true } }),
    resolveQuorumRules(tx, entityId),
  ]);
  const quorum = computeQuorum(meeting.type, meeting.isSecondMeeting, roster, attendance, rules);
  if (!quorum.met) {
    throw new ElectionError(`cannot close the election — quorum is not met (${quorum.basis})`, 409);
  }

  const ranked = await tallyElection(tx, electionId);
  const winners = ranked.slice(0, election.seatsOpen);

  const appointed: { candidateId: string; resolutionId: string }[] = [];
  for (const winner of winners) {
    const resolution = await createResolution(tx, {
      entityId,
      agendaItemId: election.agendaItemId,
      type: "BOARD_APPOINTMENT",
      title: `Board election — appoint ${winner.proposedRole}`,
      description: `Elected by cumulative vote (${winner.votes.toFixed(3)} votes) for one of ${election.seatsOpen} open seat(s).`,
      requiredMajority: "CUMULATIVE_ELECTION",
      proposedEffect: { type: "BOARD_APPOINTMENT", userId: winner.userId, role: winner.proposedRole },
      actorUserId,
    });
    await passResolution(tx, resolution.id, actorUserId, { type: "BOARD_APPOINTMENT", userId: winner.userId, role: winner.proposedRole });
    await tx.boardElectionCandidate.update({ where: { id: winner.candidateId }, data: { elected: true, appointingResolutionId: resolution.id } });
    appointed.push({ candidateId: winner.candidateId, resolutionId: resolution.id });
  }

  const updated = await tx.boardElection.update({ where: { id: electionId }, data: { status: "CLOSED", closedAt: new Date() } });
  await appendAuditLog(tx, {
    entityId,
    actorUserId,
    action: "BOARD_ELECTION_CLOSED",
    tableName: "BoardElection",
    recordId: electionId,
    afterData: { tally: ranked, seatsOpen: election.seatsOpen, appointed },
  });

  return { election: updated, tally: ranked, appointed };
}
