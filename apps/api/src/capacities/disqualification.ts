import { BOARD_ROLES, type GovernanceRole } from "@bord/shared";

export interface DisqualificationInput {
  role: GovernanceRole;
  criminalRecordClear: boolean | null;
  publicSectorApprovalStatus: "not_applicable" | "required_pending" | "approved" | null;
  competingRoleApprovalStatus: "not_applicable" | "required_pending" | "approved" | null;
}

/**
 * Spec section 3 / Epic 2: disqualification checks block board-capacity
 * activation with NO override path available to the compliance officer
 * (escalation only, not self-override) — this function is the single place
 * that decision is made, so it can't be reimplemented ad hoc more leniently
 * elsewhere.
 */
export function evaluateDisqualification(input: DisqualificationInput): { blocksActivation: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (!BOARD_ROLES.includes(input.role)) {
    // Disqualification checks (theft/breach-of-trust/forgery/bankruptcy,
    // ministerial approval, competing-role approval) are board-capacity
    // gates specifically; other roles don't carry this check.
    return { blocksActivation: false, reasons };
  }

  if (input.criminalRecordClear !== true) {
    reasons.push("Criminal record check did not clear (theft, breach of trust, forgery, or bankruptcy-related conviction).");
  }
  if (input.publicSectorApprovalStatus === "required_pending") {
    reasons.push("Public-sector employee: ministerial approval is required and still pending.");
  }
  if (input.competingRoleApprovalStatus === "required_pending") {
    reasons.push("Competing technical/managerial post at another company: prior board approval is required and still pending.");
  }

  return { blocksActivation: reasons.length > 0, reasons };
}
