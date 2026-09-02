import type { Prisma, ResolutionType, GovernanceRole as PrismaGovernanceRole, RemunerationComponent, CommitteeType } from "@prisma/client";
import { DEFAULT_EFFECT_BASIS, EXECUTIVE_ROLES, type EffectBasis } from "@bord/shared";
import { appendAuditLog } from "../audit/auditLog.js";
import { seedAppointmentObligations } from "../regulatory/obligations.js";

/** Spec section 3: a committee chair must be non-executive. */
function assertChairEligible(role: PrismaGovernanceRole): void {
  if (EXECUTIVE_ROLES.includes(role)) {
    throw new Error(`cannot make this appointment committee chair — role ${role} is executive, and a committee chair must be non-executive`);
  }
}

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
  | {
      // Establishes/updates the entity's net-distributable-profit figure for
      // a fiscal year — the base the 10% board remuneration cap (spec
      // section 9, RegulatoryRule
      // BOARD_REMUNERATION_CAP_PCT_OF_NET_DISTRIBUTABLE_PROFIT) is computed
      // against. Recorded only once this reaches the terminal stage of its
      // approval chain (Audit Committee, then Board) — see passResolution.
      type: "FINANCIAL_STATEMENTS_APPROVAL";
      description: string;
      fiscalYear: number;
      netDistributableProfit: number;
    }
  | { type: "AOA_AMENDMENT" | "CAPITAL_CHANGE" | "DISSOLUTION" | "MERGER" | "MERGER_INCREASING_LIABILITY" | "PURPOSE_CHANGE"; description: string }
  | {
      // Onboarding bootstrap only — establishes a company's current
      // governance structure (from their actual legal documents) as the
      // baseline in one shot, instead of one BOARD_APPOINTMENT at a time.
      // Committee members must be drawn from boardAppointments' userIds
      // (a committee seat is held by a board capacity).
      type: "INITIAL_STRUCTURE";
      boardAppointments: { userId: string; role: PrismaGovernanceRole; startDate?: Date }[];
      gaMembers: { userId: string; sharePercentage: number; startDate?: Date }[];
      committees: {
        name: string;
        committeeType: CommitteeType;
        charterMandate: string;
        quorumRule: string;
        minIndependentCount: number;
        memberUserIds: string[];
        chairUserId?: string;
      }[];
    }
  | {
      // Approval-only — no structural table changes, just marks the record
      // approved at whichever stage this is. See resolveApprovalChain.
      type: "BUDGET_APPROVAL";
      description: string;
    };

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

/**
 * The sequence of approving bodies a resolution type must pass through
 * (e.g. Financial Statements: Audit Committee, then Board), configurable
 * per entity from their actual bylaws via the same RegulatoryRuleOverride
 * mechanism as every other bylaw-configurable rule in this codebase — not
 * two hardcoded special cases. Each entry is a CommitteeType name or the
 * literal "BOARD". Unconfigured types default to a single stage (today's
 * behavior, unchanged): resolveApprovalChain never causes an existing
 * resolution to auto-advance unless a chain longer than 1 is on record.
 */
async function resolveApprovalChain(tx: Prisma.TransactionClient, entityId: string, type: ResolutionType): Promise<string[]> {
  const ruleKey = `APPROVAL_CHAIN_${type}`;
  const override = await tx.regulatoryRuleOverride.findFirst({
    where: { entityId, rule: { ruleKey }, status: "CUSTOM_OVERRIDE" },
  });
  if (override) return override.value as unknown as string[];

  const rule = await tx.regulatoryRule.findUnique({ where: { ruleKey } });
  if (rule) return rule.currentValue as unknown as string[];

  return ["BOARD"];
}

/** Exported for the remuneration cap-reconciliation view (remuneration/routes.ts) — same rule resolution used to enforce the cap here. */
export async function resolveBoardRemunerationCapPct(tx: Prisma.TransactionClient, entityId: string): Promise<number> {
  const ruleKey = "BOARD_REMUNERATION_CAP_PCT_OF_NET_DISTRIBUTABLE_PROFIT";
  const override = await tx.regulatoryRuleOverride.findFirst({ where: { entityId, rule: { ruleKey }, status: "CUSTOM_OVERRIDE" } });
  if (override) return Number(override.value);

  const rule = await tx.regulatoryRule.findUnique({ where: { ruleKey } });
  if (rule) return Number(rule.currentValue);

  throw new Error(`no ${ruleKey} regulatory rule on file — cannot compute the board remuneration cap`);
}

/**
 * Spec section 9: aggregate board remuneration for a fiscal year may not
 * exceed a percentage (default 10%, AoA-overridable via the same
 * RegulatoryRuleOverride mechanism as every other bylaw-configurable rule)
 * of that year's approved net distributable profit. Only board-type
 * remuneration policies are capped this way — MD/executive remuneration is
 * a different pool with no such statutory ceiling in the spec.
 */
async function assertWithinBoardRemunerationCap(
  tx: Prisma.TransactionClient,
  entityId: string,
  policyId: string,
  amount: number,
  effectiveDate: Date,
): Promise<void> {
  const policy = await tx.remunerationPolicy.findUniqueOrThrow({ where: { id: policyId } });
  if (policy.type !== "BOARD") return;

  const fiscalYear = effectiveDate.getUTCFullYear();
  const statement = await tx.financialStatement.findUnique({ where: { entityId_fiscalYear: { entityId, fiscalYear } } });
  if (!statement) {
    throw new Error(
      `cannot approve board remuneration effective in FY${fiscalYear}: no approved financial statement is on file for that year — the board remuneration cap can't be computed until FINANCIAL_STATEMENTS_APPROVAL has passed for FY${fiscalYear}`,
    );
  }

  const capPct = await resolveBoardRemunerationCapPct(tx, entityId);
  const cap = Number(statement.netDistributableProfit) * (capPct / 100);

  const yearStart = new Date(Date.UTC(fiscalYear, 0, 1));
  const yearEnd = new Date(Date.UTC(fiscalYear + 1, 0, 1));
  const existing = await tx.remunerationRecord.findMany({
    where: { policy: { entityId, type: "BOARD" }, effectiveDate: { gte: yearStart, lt: yearEnd } },
    select: { amount: true },
  });
  const alreadyCommitted = existing.reduce((sum, r) => sum + Number(r.amount), 0);

  if (alreadyCommitted + amount > cap) {
    throw new Error(
      `board remuneration of ${amount} for FY${fiscalYear} would exceed the ${capPct}% net-distributable-profit cap (cap ${cap.toFixed(2)}, already committed ${alreadyCommitted.toFixed(2)}, net distributable profit ${statement.netDistributableProfit})`,
    );
  }
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
      await seedAppointmentObligations(tx, entityId, payload.role, resolutionDate);
      return { kind: "BOARD_APPOINTMENT", capacityId: capacity.id };
    }
    case "BOARD_REMOVAL": {
      const capacity = await tx.capacity.findUniqueOrThrow({ where: { id: payload.capacityId } });
      await tx.capacity.update({ where: { id: payload.capacityId }, data: { endDate: resolutionDate, active: false } });
      return { kind: "BOARD_REMOVAL", capacityId: payload.capacityId, priorEndDate: capacity.endDate, priorActive: capacity.active };
    }
    case "COMMITTEE_ASSIGNMENT": {
      if (payload.isChair) {
        const capacity = await tx.capacity.findUniqueOrThrow({ where: { id: payload.capacityId }, select: { role: true } });
        assertChairEligible(capacity.role);
      }
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
      const effectiveDate = payload.effectiveDate ?? resolutionDate;
      await assertWithinBoardRemunerationCap(tx, entityId, payload.policyId, payload.amount, effectiveDate);
      const record = await tx.remunerationRecord.create({
        data: {
          capacityId: payload.capacityId,
          policyId: payload.policyId,
          component: payload.component,
          amount: payload.amount,
          approvingResolutionId: resolutionId,
          effectiveDate,
        },
      });
      return { kind: "REMUNERATION_RECORD", remunerationRecordId: record.id };
    }
    case "AOA_AMENDMENT":
    case "CAPITAL_CHANGE":
    case "DISSOLUTION":
    case "MERGER":
    case "MERGER_INCREASING_LIABILITY":
    case "PURPOSE_CHANGE":
      // No dedicated structural table yet for AoA text / capital ledger /
      // entity lifecycle state — recorded on the resolution itself; entity-
      // record mutation is a follow-up once that data model is built.
      return { kind: "NOT_YET_STRUCTURAL", note: payload.description };
    case "BUDGET_APPROVAL":
      // No Capacity/Committee effect — approval itself is the record. The
      // interesting behavior (advancing to the next chain stage instead of
      // finalizing) lives in passResolution, not here.
      return { kind: "NONE" };
    case "FINANCIAL_STATEMENTS_APPROVAL":
      // Recording the FinancialStatement row happens in passResolution,
      // gated on this being the terminal chain stage — not here, since
      // applyEffect runs at every intermediate stage too (Audit Committee,
      // then Board) and only the terminal pass is the actual approval.
      return { kind: "NONE" };
    case "INITIAL_STRUCTURE": {
      const capacityIdByUserId = new Map<string, string>();
      const roleByUserId = new Map<string, PrismaGovernanceRole>();
      const capacityIds: string[] = [];

      for (const appt of payload.boardAppointments) {
        const capacity = await tx.capacity.create({
          data: {
            userId: appt.userId,
            entityId,
            role: appt.role,
            startDate: appt.startDate ?? resolutionDate,
            appointingResolutionId: resolutionId,
            // Onboarding baseline stands in for the Epic 2 verification
            // review, same rationale as the bootstrap path it replaces:
            // there's no Compliance Officer yet to have done that review.
            verificationStatus: "APPROVED",
            active: true,
          },
        });
        capacityIdByUserId.set(appt.userId, capacity.id);
        roleByUserId.set(appt.userId, appt.role);
        capacityIds.push(capacity.id);
        await seedAppointmentObligations(tx, entityId, appt.role, resolutionDate);
      }

      for (const member of payload.gaMembers) {
        const capacity = await tx.capacity.create({
          data: {
            userId: member.userId,
            entityId,
            role: "GA_MEMBER",
            startDate: member.startDate ?? resolutionDate,
            sharePercentage: member.sharePercentage,
            appointingResolutionId: resolutionId,
            verificationStatus: "APPROVED",
            active: true,
          },
        });
        capacityIds.push(capacity.id);
      }

      const committeeIds: string[] = [];
      const membershipIds: string[] = [];
      for (const c of payload.committees) {
        if (c.chairUserId) {
          const chairRole = roleByUserId.get(c.chairUserId);
          if (chairRole) assertChairEligible(chairRole);
        }
        const committee = await tx.committee.create({
          data: {
            entityId,
            name: c.name,
            type: c.committeeType,
            charterMandate: c.charterMandate,
            quorumRule: c.quorumRule,
            minIndependentCount: c.minIndependentCount,
            foundingResolutionId: resolutionId,
          },
        });
        committeeIds.push(committee.id);
        for (const memberUserId of c.memberUserIds) {
          const capacityId = capacityIdByUserId.get(memberUserId);
          if (!capacityId) continue; // committee seats are held by board capacities created above
          const membership = await tx.committeeMembership.create({
            data: {
              committeeId: committee.id,
              capacityId,
              isChair: memberUserId === c.chairUserId,
              startDate: resolutionDate,
              appointingResolutionId: resolutionId,
            },
          });
          membershipIds.push(membership.id);
        }
      }

      return { kind: "INITIAL_STRUCTURE", capacityIds, committeeIds, membershipIds };
    }
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
    case "INITIAL_STRUCTURE": {
      const capacityIds = snapshot.capacityIds as string[];
      const committeeIds = snapshot.committeeIds as string[];
      for (const id of capacityIds) {
        await tx.capacity.update({ where: { id }, data: { active: false, endDate: new Date() } });
      }
      for (const id of committeeIds) {
        await tx.committee.update({ where: { id }, data: { dissolvedAt: new Date() } });
      }
      return;
    }
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

  // Multi-stage approval chain: this stage genuinely passed at its own
  // body's own meeting (status above reflects that truthfully), but if it
  // isn't the chain's terminal stage the matter isn't done — spawn the
  // next stage now so it's ready for the Secretary to put on the next
  // body's agenda, rather than treating this pass as final.
  const chain = await resolveApprovalChain(tx, resolution.entityId, resolution.type);
  const isTerminalStage = resolution.chainStage >= chain.length;

  // Only the terminal stage's pass is the actual approval (e.g. Board,
  // after Audit Committee) — recording the figure at an intermediate stage
  // would let a not-yet-Board-approved number drive the remuneration cap.
  if (isTerminalStage && effectPayload.type === "FINANCIAL_STATEMENTS_APPROVAL") {
    const statement = await tx.financialStatement.upsert({
      where: { entityId_fiscalYear: { entityId: resolution.entityId, fiscalYear: effectPayload.fiscalYear } },
      create: {
        entityId: resolution.entityId,
        fiscalYear: effectPayload.fiscalYear,
        netDistributableProfit: effectPayload.netDistributableProfit,
        approvingResolutionId: resolutionId,
      },
      update: { netDistributableProfit: effectPayload.netDistributableProfit, approvingResolutionId: resolutionId },
    });
    await appendAuditLog(tx, {
      entityId: resolution.entityId,
      actorUserId,
      action: "FINANCIAL_STATEMENT_RECORDED",
      tableName: "FinancialStatement",
      recordId: statement.id,
      afterData: { fiscalYear: effectPayload.fiscalYear, netDistributableProfit: effectPayload.netDistributableProfit },
    });
  }

  if (!isTerminalStage) {
    const next = await tx.resolution.create({
      data: {
        entityId: resolution.entityId,
        type: resolution.type,
        title: resolution.title,
        description: resolution.description,
        requiredMajority: resolution.requiredMajority,
        effectBasis: resolution.effectBasis,
        status: "DRAFT",
        chainStage: resolution.chainStage + 1,
        precedingResolutionId: resolution.id,
        proposedEffect: (resolution.proposedEffect ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    await appendAuditLog(tx, {
      entityId: resolution.entityId,
      actorUserId,
      action: "RESOLUTION_CHAIN_ADVANCED",
      tableName: "Resolution",
      recordId: next.id,
      afterData: { precedingResolutionId: resolution.id, chainStage: next.chainStage, nextBody: chain[resolution.chainStage] },
    });
  }

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
