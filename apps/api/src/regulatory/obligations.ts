import type { GovernanceRole, Prisma } from "@prisma/client";
import { appendAuditLog } from "../audit/auditLog.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Actually seeds/creates RegulatoryObligation rows at the real events the
 * spec ties each one to — the gap the audit found: the data model, the
 * escalation math (compliance/alerts.ts), and the auto-regeneration-on-
 * completion logic (regulatory/routes.ts) were all real, but nothing ever
 * called tx.regulatoryObligation.create, so no entity ever actually had a
 * calendar. Three call sites, matching the natural trigger for each type:
 * entity onboarding (purely time-based recurring obligations),
 * minutes-finalization (FRA/GAFI submission deadlines), and board/auditor
 * appointment (term limits, interest re-declaration, auditor rotation).
 */

/** Onboarding-time: obligations that recur on a fixed calendar cadence, independent of any later event. */
export async function seedStandingObligations(tx: Prisma.TransactionClient, entityId: string, fromDate: Date): Promise<void> {
  await tx.regulatoryObligation.createMany({
    data: [
      {
        entityId,
        type: "BOARD_MEETING_CADENCE",
        frequencyDays: 90,
        triggerPoint: "Board must meet at least once every 3 months regardless of any request (Executive Regulations Art. 203).",
        nextDueAt: new Date(fromDate.getTime() + 90 * DAY_MS),
        responsibleRole: "CHAIRMAN",
      },
      {
        entityId,
        type: "OGM_ANNUAL",
        frequencyDays: 365,
        // This build has no fiscal-year-end field yet, so the first due date
        // is a 1-year-from-onboarding placeholder — recompute against the
        // entity's actual fiscal year-end once that's tracked.
        triggerPoint: "OGM at least once a year, within 3 months of fiscal year-end (Companies Law Art. 61 para. 1).",
        nextDueAt: new Date(fromDate.getTime() + 365 * DAY_MS),
        responsibleRole: "CHAIRMAN",
      },
      {
        entityId,
        type: "FRA_ANNUAL_DISCLOSURE",
        frequencyDays: 365,
        triggerPoint: "FRA annual disclosure — same fiscal-year-end caveat as OGM_ANNUAL.",
        nextDueAt: new Date(fromDate.getTime() + 365 * DAY_MS),
        responsibleRole: "COMPLIANCE_OFFICER",
      },
    ],
  });
}

/**
 * Minutes-finalization-time: the FRA/GAFI submission clocks start running
 * the moment minutes go FINAL (dual-signed), not before.
 */
export async function seedMinutesSubmissionObligations(
  tx: Prisma.TransactionClient,
  entityId: string,
  meetingType: string,
  finalizedAt: Date,
): Promise<void> {
  await tx.regulatoryObligation.create({
    data: {
      entityId,
      type: "FRA_MINUTES_SUBMISSION",
      frequencyDays: null, // one-off per meeting, not recurring
      triggerPoint: "10 days from minutes finalization.",
      nextDueAt: new Date(finalizedAt.getTime() + 10 * DAY_MS),
      responsibleRole: "COMPLIANCE_OFFICER",
    },
  });
  if (meetingType === "OGM" || meetingType === "EGM") {
    await tx.regulatoryObligation.create({
      data: {
        entityId,
        type: "GAFI_RATIFICATION",
        frequencyDays: null,
        triggerPoint: "Submit within 1 month of the meeting date; resolutions bind third parties only once ratified (Companies Law Art. 75).",
        nextDueAt: new Date(finalizedAt.getTime() + 30 * DAY_MS),
        responsibleRole: "COMPLIANCE_OFFICER",
      },
    });
  }
}

/**
 * Appointment-time: term limits and interest re-declaration for a board
 * seat, or the rotation clock for an auditor. Term/rotation lengths aren't
 * pinned down by an exact day-count in the spec text available here —
 * *confirm with counsel* the entity's actual AoA-set board term and the
 * applicable auditor-rotation rule before relying on these defaults.
 */
export async function seedAppointmentObligations(
  tx: Prisma.TransactionClient,
  entityId: string,
  role: GovernanceRole,
  appointedAt: Date,
): Promise<void> {
  if (role === "AUDITOR") {
    await tx.regulatoryObligation.create({
      data: {
        entityId,
        type: "AUDITOR_ROTATION",
        frequencyDays: 1825, // 5 years — common rotation period; confirm with counsel for this entity's regime
        triggerPoint: "Auditor rotation — confirm the applicable period with counsel; not pinned to a specific article here.",
        nextDueAt: new Date(appointedAt.getTime() + 1825 * DAY_MS),
        responsibleRole: "COMPLIANCE_OFFICER",
      },
    });
    return;
  }

  const BOARD_ROLES: GovernanceRole[] = ["CHAIRMAN", "VICE_CHAIRMAN", "MANAGING_DIRECTOR", "EXECUTIVE_BOARD_MEMBER", "NON_EXECUTIVE_BOARD_MEMBER", "INDEPENDENT_BOARD_MEMBER"];
  if (!BOARD_ROLES.includes(role)) return;

  await tx.regulatoryObligation.create({
    data: {
      entityId,
      type: "TERM_LIMIT",
      frequencyDays: 1095, // 3 years — standard JSC board term (Companies Law Art. 89); confirm against this entity's AoA
      triggerPoint: "Board member term — confirm the exact AoA-set term with counsel.",
      nextDueAt: new Date(appointedAt.getTime() + 1095 * DAY_MS),
      responsibleRole: "CORPORATE_SECRETARY",
    },
  });
  await tx.regulatoryObligation.create({
    data: {
      entityId,
      type: "INTEREST_DECLARATION_RECONFIRMATION",
      frequencyDays: 365,
      triggerPoint: "Prompted at appointment and annually thereafter (spec section 9 / Epic 9).",
      nextDueAt: new Date(appointedAt.getTime() + 365 * DAY_MS),
      responsibleRole: role,
    },
  });
}

/**
 * No job scheduler exists in this build (compliance/routes.ts is explicit
 * about that), so a missed deadline can't be caught the instant it's
 * missed — but it doesn't have to stay silently dropped either. Called on
 * every read of an entity's obligations (the list and alerts endpoints):
 * anything past nextDueAt that isn't already OVERDUE or COMPLETED gets
 * persisted as OVERDUE and appended to the audit log as a distinct
 * compliance event, exactly once at the transition, not on every read.
 */
export async function syncOverdueObligations(tx: Prisma.TransactionClient, entityId: string): Promise<void> {
  const newlyOverdue = await tx.regulatoryObligation.findMany({
    where: { entityId, nextDueAt: { lt: new Date() }, status: { notIn: ["OVERDUE", "COMPLETED"] } },
  });
  for (const obligation of newlyOverdue) {
    await tx.regulatoryObligation.update({ where: { id: obligation.id }, data: { status: "OVERDUE" } });
    await appendAuditLog(tx, {
      entityId,
      actorUserId: null,
      action: "REGULATORY_OBLIGATION_OVERDUE",
      tableName: "RegulatoryObligation",
      recordId: obligation.id,
      beforeData: { status: obligation.status, nextDueAt: obligation.nextDueAt },
      afterData: { status: "OVERDUE", type: obligation.type },
    });
  }
}
