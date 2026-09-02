import type { Prisma, MeetingRequestType } from "@prisma/client";
import { appendAuditLog } from "../audit/auditLog.js";
import { getMeetingRoster } from "./quorum.js";

export class MeetingRequestError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

interface RequestThresholds {
  ogmPct: number; // 5% of capital (spec section 6)
  egmPct: number; // 10% of capital
  boardFraction: number; // 1/3 of sitting board members
  boardResponseDays: number; // Chairman's 10-day window before members may self-convene
  gaResponseDays: number; // board's 1-month window before shareholders may apply to GAFI
}

const DEFAULTS: RequestThresholds = { ogmPct: 5, egmPct: 10, boardFraction: 1 / 3, boardResponseDays: 10, gaResponseDays: 30 };

async function resolveRequestThresholds(tx: Prisma.TransactionClient, entityId: string): Promise<RequestThresholds> {
  const overrides = await tx.regulatoryRuleOverride.findMany({
    where: { entityId, status: "CUSTOM_OVERRIDE", rule: { ruleKey: { in: ["OGM_REQUEST_THRESHOLD_PCT", "EGM_REQUEST_THRESHOLD_PCT", "BOARD_REQUEST_FRACTION", "BOARD_RESPONSE_WINDOW_DAYS", "GA_RESPONSE_WINDOW_DAYS"] } } },
    include: { rule: true },
  });
  const thresholds = { ...DEFAULTS };
  for (const o of overrides) {
    const value = Number(o.value);
    if (Number.isNaN(value)) continue;
    if (o.rule.ruleKey === "OGM_REQUEST_THRESHOLD_PCT") thresholds.ogmPct = value;
    if (o.rule.ruleKey === "EGM_REQUEST_THRESHOLD_PCT") thresholds.egmPct = value;
    if (o.rule.ruleKey === "BOARD_REQUEST_FRACTION") thresholds.boardFraction = value;
    if (o.rule.ruleKey === "BOARD_RESPONSE_WINDOW_DAYS") thresholds.boardResponseDays = value;
    if (o.rule.ruleKey === "GA_RESPONSE_WINDOW_DAYS") thresholds.gaResponseDays = value;
  }
  return thresholds;
}

export interface ProposedAgendaEntry {
  title: string;
  description?: string;
}

export interface CreateMeetingRequestInput {
  type: MeetingRequestType;
  requestorCapacityIds: string[];
  actorUserId: string;
  // The initiator's own agenda — carried on the request from submission,
  // materialized into real (PROPOSED) AgendaItem rows once the Chairman
  // marks the request called and a Meeting exists to attach them to.
  proposedAgenda?: ProposedAgendaEntry[];
}

/**
 * Convocation-rights thresholds — spec section 6:
 * - Board: 1/3 of sitting members may request; Chairman has 10 days to
 *   issue the invitation before those members may convene it themselves
 *   (and must notify GAFI).
 * - OGM: the board must convene on request of the auditor or shareholders
 *   holding >= 5% of capital.
 * - EGM: shareholders holding >= 10% of capital may request; if the board
 *   doesn't respond within a month, they may apply to GAFI directly.
 */
export async function createMeetingRequest(tx: Prisma.TransactionClient, entityId: string, input: CreateMeetingRequestInput) {
  const thresholds = await resolveRequestThresholds(tx, entityId);
  const now = new Date();

  if (input.type === "BOARD") {
    const roster = await getMeetingRoster(tx, entityId, "BOARD", null);
    const rosterIds = new Set(roster.map((r) => r.capacityId));
    const matching = input.requestorCapacityIds.filter((id) => rosterIds.has(id));
    if (matching.length === 0) {
      throw new MeetingRequestError("none of the listed capacities are active board members at this entity", 400);
    }
    const fraction = roster.length > 0 ? matching.length / roster.length : 0;
    const responseDeadline = new Date(now.getTime() + thresholds.boardResponseDays * 24 * 60 * 60 * 1000);

    const request = await tx.meetingRequest.create({
      data: {
        entityId,
        type: "BOARD",
        requestorCapacityIds: matching,
        capitalOrMemberPct: fraction * 100,
        thresholdMet: fraction >= thresholds.boardFraction,
        responseDeadline,
        proposedAgenda: (input.proposedAgenda as unknown as Prisma.InputJsonValue) ?? undefined,
      },
    });
    await appendAuditLog(tx, {
      entityId,
      actorUserId: input.actorUserId,
      action: "MEETING_REQUEST_SUBMITTED",
      tableName: "MeetingRequest",
      recordId: request.id,
      afterData: { type: "BOARD", memberFraction: fraction, thresholdMet: request.thresholdMet, responseDeadline },
    });
    return request;
  }

  // OGM only: the auditor's request alone obliges the board to convene,
  // regardless of capital held (Companies Law Art. 61 para. 3) — checked
  // before the GA-member capital-percentage path below, since an auditor
  // capacity won't appear in the GA_MEMBER roster at all.
  if (input.type === "OGM") {
    const auditorCapacities = await tx.capacity.findMany({
      where: { id: { in: input.requestorCapacityIds }, entityId, role: "AUDITOR", active: true, verificationStatus: "APPROVED" },
      select: { id: true },
    });
    if (auditorCapacities.length > 0) {
      const responseDeadline = new Date(now.getTime() + thresholds.gaResponseDays * 24 * 60 * 60 * 1000);
      const request = await tx.meetingRequest.create({
        data: {
          entityId,
          type: "OGM",
          requestorCapacityIds: auditorCapacities.map((c) => c.id),
          capitalOrMemberPct: null,
          thresholdMet: true,
          responseDeadline,
          proposedAgenda: (input.proposedAgenda as unknown as Prisma.InputJsonValue) ?? undefined,
        },
      });
      await appendAuditLog(tx, {
        entityId,
        actorUserId: input.actorUserId,
        action: "MEETING_REQUEST_SUBMITTED",
        tableName: "MeetingRequest",
        recordId: request.id,
        afterData: { type: "OGM", requestedBy: "AUDITOR", thresholdMet: true, responseDeadline },
      });
      return request;
    }
  }

  // OGM / EGM — capital-percentage threshold.
  const roster = await getMeetingRoster(tx, entityId, input.type, null);
  const matching = roster.filter((r) => input.requestorCapacityIds.includes(r.capacityId));
  if (matching.length === 0) {
    throw new MeetingRequestError("none of the listed capacities are active GA members at this entity", 400);
  }
  const pct = matching.reduce((sum, r) => sum + (r.sharePercentage ?? 0), 0);
  const requiredPct = input.type === "OGM" ? thresholds.ogmPct : thresholds.egmPct;
  const responseDeadline = new Date(now.getTime() + thresholds.gaResponseDays * 24 * 60 * 60 * 1000);

  const request = await tx.meetingRequest.create({
    data: {
      entityId,
      type: input.type,
      requestorCapacityIds: matching.map((m) => m.capacityId),
      capitalOrMemberPct: pct,
      thresholdMet: pct >= requiredPct,
      responseDeadline,
      proposedAgenda: (input.proposedAgenda as unknown as Prisma.InputJsonValue) ?? undefined,
    },
  });
  await appendAuditLog(tx, {
    entityId,
    actorUserId: input.actorUserId,
    action: "MEETING_REQUEST_SUBMITTED",
    tableName: "MeetingRequest",
    recordId: request.id,
    afterData: { type: input.type, capitalPct: pct, requiredPct, thresholdMet: request.thresholdMet, responseDeadline },
  });
  return request;
}

/** Chairman (or whoever schedules) responds by convening the requested meeting. */
export async function markMeetingRequestCalled(tx: Prisma.TransactionClient, requestId: string, actorUserId: string, meetingId: string) {
  const request = await tx.meetingRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (request.status !== "PENDING") {
    throw new MeetingRequestError(`request is already ${request.status}`, 409);
  }
  const updated = await tx.meetingRequest.update({
    where: { id: requestId },
    data: { status: "BOARD_CALLED", chairmanRespondedAt: new Date(), resultingMeetingId: meetingId },
  });
  await appendAuditLog(tx, {
    entityId: request.entityId,
    actorUserId,
    action: "MEETING_REQUEST_CALLED",
    tableName: "MeetingRequest",
    recordId: requestId,
    afterData: { meetingId },
  });
  return updated;
}

/**
 * The response window lapsed with no meeting called: for a board request,
 * the requesting members may now convene it themselves (and must notify
 * GAFI); for OGM/EGM, the requesting shareholders may apply to GAFI to
 * convene it directly. Both are external, out-of-platform acts — this just
 * records that the window closed unanswered.
 */
export async function escalateMeetingRequest(tx: Prisma.TransactionClient, requestId: string, actorUserId: string) {
  const request = await tx.meetingRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (request.status !== "PENDING") {
    throw new MeetingRequestError(`request is already ${request.status}`, 409);
  }
  if (new Date() < request.responseDeadline) {
    throw new MeetingRequestError(`response window has not lapsed yet (deadline ${request.responseDeadline.toISOString()})`, 409);
  }
  if (!request.thresholdMet) {
    throw new MeetingRequestError("the statutory threshold was never met for this request — nothing to escalate", 409);
  }

  const nextStatus = request.type === "BOARD" ? "ESCALATED_TO_GAFI" : "ESCALATED_TO_REGULATOR";
  const updated = await tx.meetingRequest.update({ where: { id: requestId }, data: { status: nextStatus } });
  await appendAuditLog(tx, {
    entityId: request.entityId,
    actorUserId,
    action: "MEETING_REQUEST_ESCALATED",
    tableName: "MeetingRequest",
    recordId: requestId,
    afterData: { status: nextStatus },
  });
  return updated;
}
