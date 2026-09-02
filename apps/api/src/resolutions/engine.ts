import type { Prisma, ResolutionType, GovernanceRole as PrismaGovernanceRole, RemunerationComponent, CommitteeType } from "@prisma/client";
import { DEFAULT_EFFECT_BASIS, type EffectBasis } from "@bord/shared";
import { appendAuditLog } from "../audit/auditLog.js";

/**
 * Resolution Engine — PRD section 5.4 / spec section 4.
 *
 * This is the ONLY code path allowed to write Board, Committee(Membership),
 * or Capacity rows (PRD 5.2: "there should be no code path that writes to
 * Board, Committee, or Capacity tables except via resolution processing").
 * Every other module (registration, governance-structure builder, meetings)
 * calls into passResolution rather than touching those tables directly.
 */

export type ResolutionEffectPayload =
  | { type: "BOARD_APPOINTMENT"; userId: string; role: PrismaGovernanceRole; startDate?: Date }
  | { type: "BOARD_REMOVAL"; capacityId: string }
  | { type: "COMMITTEE_ASSIGNMENT"; committeeId: string; capacityId: string; isChair?: boolean; startDate?: Date }
  | {
      type: "MD_REMUNERATION" | "EXECUTIVE_REMUNERATION" | "GA_SET_BOARD_REMUNERATION";
      capacityId: string;
      policyId: string;
      component: RemunerationComponent;
      amount: number;
      effectiveDate?: Date;
    }
  | {
      type: "PROCEDURAL";
      // New committee (spec section 3: "Structure changes... require a
      // linked resolution"). Omit for a resolution with no structural effect.
      committee?: { name: string; committeeType: CommitteeType; charterMandate: string; quorumRule: string; minIndependentCount: number };
    }
  | { type: "AOA_AMENDMENT" | "CAPITAL_CHANGE"; description: string };

export interface CreateResolutionInput {
  entityId: string;
  agendaItemId: string;
  type: ResolutionType;
  title: string;
  description: string;
  // Decided up front: what this resolution does if it passes. Stored so the
  // voting engine's close-and-tally step can apply it without the caller
  // re-supplying it (and re-risking a mismatch between what was voted on
  // and what gets applied).
  proposedEffect?: ResolutionEffectPayload;
  requiredMajority: string;
  actorUserId: string;
}

async function resolveEffectBasis(tx: Prisma.TransactionClient, entityId: string, type: ResolutionType): Promise<EffectBasis> {
  const ruleKey = `EFFECT_BASIS_${type}`;
  const override = await tx.regulatoryRuleOverride.findFirst({
    where: { entityId, rule: { ruleKey }, status: "CUSTOM_OVERRIDE" },
  });
  if (override) return override.value as unknown as EffectBasis;

  const rule = await tx.regulatoryRule.findUnique({ where: { ruleKey } });
  if (rule) return rule.currentValue as unknown as EffectBasis;

  return DEFAULT_EFFECT_BASIS[type as keyof typeof DEFAULT_EFFECT_BASIS];
}

/** Applies a resolution's structural effect and returns a snapshot describing how to revert it. */
async function applyEffect(
  tx: Prisma.TransactionClient,
  entityId: string,
  resolutionId: string,
  resolutionDate: Date,
  payload: ResolutionEffectPayload,
): Promise<Prisma.InputJsonValue> {
  switch (payload.type) {
    case "BOARD_APPOINTMENT": {
      const capacity = await tx.capacity.create({
        data: {
          userId: payload.userId,
          entityId,
          role: payload.role,
          startDate: payload.startDate ?? resolutionDate,
          appointingResolutionId: resolutionId,
          verificationStatus: "PENDING",
          active: false, // activation still gated on verification + disqualification checks (Epic 2)
        },
      });
      return { kind: "BOARD_APPOINTMENT", capacityId: capacity.id };
    }
    case "BOARD_REMOVAL": {
      const capacity = await tx.capacity.findUniqueOrThrow({ where: { id: payload.capacityId } });
      await tx.capacity.update({ where: { id: payload.capacityId }, data: { endDate: resolutionDate, active: false } });
      return { kind: "BOARD_REMOVAL", capacityId: payload.capacityId, priorEndDate: capacity.endDate, priorActive: capacity.active };
    }
    case "COMMITTEE_ASSIGNMENT": {
      const membership = await tx.committeeMembership.create({
        data: {
          committeeId: payload.committeeId,
          capacityId: payload.capacityId,
          isChair: payload.isChair ?? false,
          startDate: payload.startDate ?? resolutionDate,
          appointingResolutionId: resolutionId,
        },
      });
      return { kind: "COMMITTEE_ASSIGNMENT", membershipId: membership.id };
    }
    case "MD_REMUNERATION":
    case "EXECUTIVE_REMUNERATION":
    case "GA_SET_BOARD_REMUNERATION": {
      const record = await tx.remunerationRecord.create({
        data: {
          capacityId: payload.capacityId,
          policyId: payload.policyId,
          component: payload.component,
          amount: payload.amount,
          approvingResolutionId: resolutionId,
          effectiveDate: payload.effectiveDate ?? resolutionDate,
        },
      });
      return { kind: "REMUNERATION_RECORD", remunerationRecordId: record.id };
    }
    case "AOA_AMENDMENT":
    case "CAPITAL_CHANGE":
      // No dedicated structural table yet for AoA text / capital ledger —
      // recorded on the resolution itself; entity-record mutation is a
      // follow-up once the AoA/capital data model is built.
      return { kind: "NOT_YET_STRUCTURAL", note: payload.description };
    case "PROCEDURAL": {
      if (!payload.committee) return { kind: "NONE" };
      const committee = await tx.committee.create({
        data: {
          entityId,
          name: payload.committee.name,
          type: payload.committee.committeeType,
          charterMandate: payload.committee.charterMandate,
          quorumRule: payload.committee.quorumRule,
          minIndependentCount: payload.committee.minIndependentCount,
          foundingResolutionId: resolutionId,
        },
      });
      return { kind: "COMMITTEE_FOUNDED", committeeId: committee.id };
    }
  }
}

async function revertEffect(tx: Prisma.TransactionClient, snapshot: Record<string, unknown>): Promise<void> {
  switch (snapshot.kind) {
    case "BOARD_APPOINTMENT":
      // Preserve the row for history (PRD 5.5 immutable audit trail) —
      // deactivate rather than delete.
      await tx.capacity.update({ where: { id: snapshot.capacityId as string }, data: { active: false, endDate: new Date() } });
      return;
    case "BOARD_REMOVAL":
      await tx.capacity.update({
        where: { id: snapshot.capacityId as string },
        data: { endDate: snapshot.priorEndDate as Date | null, active: snapshot.priorActive as boolean },
      });
      return;
    case "COMMITTEE_ASSIGNMENT":
      await tx.committeeMembership.update({ where: { id: snapshot.membershipId as string }, data: { endDate: new Date() } });
      return;
    case "REMUNERATION_RECORD":
      // Remuneration records feed payout scheduling, which is itself gated
      // on resolution status (Epic 8 AC) — no payouts exist yet to reverse
      // when a resolution is still only pending authorization.
      return;
    case "COMMITTEE_FOUNDED":
      await tx.committee.update({ where: { id: snapshot.committeeId as string }, data: { dissolvedAt: new Date() } });
      return;
    case "NOT_YET_STRUCTURAL":
    case "NONE":
      return;
  }
}

export async function createResolution(tx: Prisma.TransactionClient, input: CreateResolutionInput) {
  const effectBasis = await resolveEffectBasis(tx, input.entityId, input.type);
  const resolution = await tx.resolution.create({
    data: {
      entityId: input.entityId,
      agendaItemId: input.agendaItemId,
      type: input.type,
      title: input.title,
      description: input.description,
      requiredMajority: input.requiredMajority,
      effectBasis,
      status: "DRAFT",
      proposedEffect: (input.proposedEffect ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  await appendAuditLog(tx, {
    entityId: input.entityId,
    actorUserId: input.actorUserId,
    action: "RESOLUTION_CREATED",
    tableName: "Resolution",
    recordId: resolution.id,
    afterData: { type: input.type, title: input.title, effectBasis },
  });
  return resolution;
}

/**
 * Marks a resolution PASSED (the vote having met its required majority —
 * tallying itself is the Meeting/Voting module's job, Epic 5) and applies
 * its structural effect. Resolution-effective resolutions are immediately
 * final; authorization-effective ones move to PENDING_AUTHORIZATION and wait
 * on GAFI ratification / Commercial Registry annotation (PRD 5.4).
 */
export async function passResolution(
  tx: Prisma.TransactionClient,
  resolutionId: string,
  actorUserId: string,
  effectPayload: ResolutionEffectPayload,
) {
  const resolution = await tx.resolution.findUniqueOrThrow({ where: { id: resolutionId } });
  if (resolution.status !== "DRAFT") {
    throw new Error(`resolution ${resolutionId} is not in DRAFT status (currently ${resolution.status})`);
  }

  const resolutionDate = new Date();
  const snapshot = await applyEffect(tx, resolution.entityId, resolutionId, resolutionDate, effectPayload);

  const nextStatus = resolution.effectBasis === "AUTHORIZATION_EFFECTIVE" ? "PENDING_AUTHORIZATION" : "PASSED";

  const updated = await tx.resolution.update({
    where: { id: resolutionId },
    data: { status: nextStatus, resolutionDate, preResolutionSnapshot: snapshot },
  });

  await appendAuditLog(tx, {
    entityId: resolution.entityId,
    actorUserId,
    action: "RESOLUTION_PASSED",
    tableName: "Resolution",
    recordId: resolutionId,
    beforeData: { status: resolution.status },
    afterData: { status: nextStatus, effectBasis: resolution.effectBasis },
  });

  return updated;
}

/** GAFI ratification (or Commercial Registry annotation) recorded — the change becomes binding on third parties (PRD 5.4). */
export async function ratifyResolution(tx: Prisma.TransactionClient, resolutionId: string, actorUserId: string, authorizationDate: Date = new Date()) {
  const resolution = await tx.resolution.findUniqueOrThrow({ where: { id: resolutionId } });
  if (resolution.status !== "PENDING_AUTHORIZATION") {
    throw new Error(`resolution ${resolutionId} is not PENDING_AUTHORIZATION (currently ${resolution.status})`);
  }

  const updated = await tx.resolution.update({
    where: { id: resolutionId },
    data: { status: "RATIFIED", authorizationDate },
  });

  await appendAuditLog(tx, {
    entityId: resolution.entityId,
    actorUserId,
    action: "RESOLUTION_RATIFIED",
    tableName: "Resolution",
    recordId: resolutionId,
    beforeData: { status: "PENDING_AUTHORIZATION" },
    afterData: { status: "RATIFIED", authorizationDate },
  });

  return updated;
}

/**
 * GAFI declined ratification, or the one-month window lapsed without
 * submission (PRD 5.4 / Epic 4 AC): automatically rolls the structure back
 * to its pre-resolution state and logs the reversal with cause, with no
 * manual intervention required.
 */
export async function rejectOrLapseResolution(
  tx: Prisma.TransactionClient,
  resolutionId: string,
  outcome: "REJECTED" | "LAPSED",
  reason: string,
  actorUserId: string | null,
) {
  const resolution = await tx.resolution.findUniqueOrThrow({ where: { id: resolutionId } });
  if (resolution.status !== "PENDING_AUTHORIZATION") {
    throw new Error(`resolution ${resolutionId} is not PENDING_AUTHORIZATION (currently ${resolution.status})`);
  }

  if (resolution.preResolutionSnapshot) {
    await revertEffect(tx, resolution.preResolutionSnapshot as Record<string, unknown>);
  }

  const updated = await tx.resolution.update({
    where: { id: resolutionId },
    data: { status: outcome, rollbackReason: reason },
  });

  await appendAuditLog(tx, {
    entityId: resolution.entityId,
    actorUserId,
    action: `RESOLUTION_${outcome}`,
    tableName: "Resolution",
    recordId: resolutionId,
    beforeData: { status: "PENDING_AUTHORIZATION" },
    afterData: { status: outcome, reason },
  });

  return updated;
}

/**
 * The vote was tallied and did not reach its required majority — a
 * different rejection point than rejectOrLapseResolution's (that one is
 * for a PENDING_AUTHORIZATION resolution GAFI later declines; this one is
 * for a resolution that never passed its own meeting in the first place).
 * Still DRAFT, so no structural effect was ever applied — nothing to roll back.
 */
export async function failResolutionVote(tx: Prisma.TransactionClient, resolutionId: string, actorUserId: string, tallySummary: unknown) {
  const resolution = await tx.resolution.findUniqueOrThrow({ where: { id: resolutionId } });
  if (resolution.status !== "DRAFT") {
    throw new Error(`resolution ${resolutionId} is not DRAFT (currently ${resolution.status})`);
  }

  const updated = await tx.resolution.update({
    where: { id: resolutionId },
    data: { status: "REJECTED", rollbackReason: "Did not reach the required majority at the meeting." },
  });

  await appendAuditLog(tx, {
    entityId: resolution.entityId,
    actorUserId,
    action: "RESOLUTION_VOTE_FAILED",
    tableName: "Resolution",
    recordId: resolutionId,
    afterData: { status: "REJECTED", tally: tallySummary },
  });

  return updated;
}
