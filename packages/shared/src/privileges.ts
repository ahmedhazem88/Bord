import type { GovernanceRole } from "./roles.js";

/**
 * Single source of truth for the roles → privileges matrix (spec section 12).
 * Every API endpoint checks against this table rather than re-implementing
 * authorization ad hoc per feature (PRD section 9.3).
 */
export type Action =
  | "meeting:schedule"
  | "agenda:set"
  | "agenda:propose"
  | "vote:board_resolution"
  | "vote:ga_resolution"
  | "document:view_confidential_board"
  | "committee:appoint_remove_direct"
  | "committee:appoint_remove_via_board_resolution"
  | "minutes:sign"
  | "verification:upload_own"
  | "verification:upload_entity_level"
  | "meeting:request_board"
  | "meeting:request_ga"
  | "interest:declare_update"
  | "interest:declare_self_only"
  | "proxy:grant_revoke"
  | "vote:abstain_recused"
  | "remuneration:set_board_via_ga"
  | "remuneration:set_executive_via_board";

export type Scope = "full" | "own" | "entity" | "committee_scoped" | "invitation_scoped" | "self_interest_only" | "propose_only";

export interface PrivilegeGrant {
  action: Action;
  role: GovernanceRole;
  scope: Scope;
}

/** Flattened from the section-12 matrix. Roles not listed for an action have no grant. */
export const PRIVILEGE_MATRIX: PrivilegeGrant[] = [
  { action: "meeting:schedule", role: "CHAIRMAN", scope: "full" },
  { action: "meeting:schedule", role: "MANAGING_DIRECTOR", scope: "full" },
  { action: "meeting:schedule", role: "CORPORATE_SECRETARY", scope: "full" },

  { action: "agenda:set", role: "CHAIRMAN", scope: "full" },
  { action: "agenda:set", role: "MANAGING_DIRECTOR", scope: "full" },
  { action: "agenda:set", role: "CORPORATE_SECRETARY", scope: "full" },
  { action: "agenda:propose", role: "NON_EXECUTIVE_BOARD_MEMBER", scope: "propose_only" },
  { action: "agenda:propose", role: "EXECUTIVE_BOARD_MEMBER", scope: "propose_only" },
  { action: "agenda:propose", role: "INDEPENDENT_BOARD_MEMBER", scope: "propose_only" },
  { action: "agenda:propose", role: "COMMITTEE_MEMBER", scope: "propose_only" },
  { action: "agenda:propose", role: "COMMITTEE_CHAIR", scope: "propose_only" },

  { action: "vote:board_resolution", role: "CHAIRMAN", scope: "full" },
  { action: "vote:board_resolution", role: "MANAGING_DIRECTOR", scope: "full" },
  { action: "vote:board_resolution", role: "VICE_CHAIRMAN", scope: "full" },
  { action: "vote:board_resolution", role: "EXECUTIVE_BOARD_MEMBER", scope: "full" },
  { action: "vote:board_resolution", role: "NON_EXECUTIVE_BOARD_MEMBER", scope: "full" },
  { action: "vote:board_resolution", role: "INDEPENDENT_BOARD_MEMBER", scope: "full" },

  { action: "vote:ga_resolution", role: "GA_MEMBER", scope: "full" },

  { action: "document:view_confidential_board", role: "CHAIRMAN", scope: "full" },
  { action: "document:view_confidential_board", role: "MANAGING_DIRECTOR", scope: "full" },
  { action: "document:view_confidential_board", role: "CORPORATE_SECRETARY", scope: "full" },
  { action: "document:view_confidential_board", role: "VICE_CHAIRMAN", scope: "full" },
  { action: "document:view_confidential_board", role: "EXECUTIVE_BOARD_MEMBER", scope: "full" },
  { action: "document:view_confidential_board", role: "NON_EXECUTIVE_BOARD_MEMBER", scope: "full" },
  { action: "document:view_confidential_board", role: "INDEPENDENT_BOARD_MEMBER", scope: "full" },
  { action: "document:view_confidential_board", role: "COMMITTEE_MEMBER", scope: "committee_scoped" },
  { action: "document:view_confidential_board", role: "COMMITTEE_CHAIR", scope: "committee_scoped" },
  { action: "document:view_confidential_board", role: "ADVISOR", scope: "invitation_scoped" },

  { action: "committee:appoint_remove_direct", role: "CHAIRMAN", scope: "full" },
  { action: "committee:appoint_remove_via_board_resolution", role: "NON_EXECUTIVE_BOARD_MEMBER", scope: "full" },
  { action: "committee:appoint_remove_via_board_resolution", role: "EXECUTIVE_BOARD_MEMBER", scope: "full" },
  { action: "committee:appoint_remove_via_board_resolution", role: "INDEPENDENT_BOARD_MEMBER", scope: "full" },

  { action: "minutes:sign", role: "CHAIRMAN", scope: "full" },
  { action: "minutes:sign", role: "CORPORATE_SECRETARY", scope: "full" },

  { action: "verification:upload_own", role: "CHAIRMAN", scope: "own" },
  { action: "verification:upload_own", role: "MANAGING_DIRECTOR", scope: "own" },
  { action: "verification:upload_own", role: "NON_EXECUTIVE_BOARD_MEMBER", scope: "own" },
  { action: "verification:upload_own", role: "EXECUTIVE_BOARD_MEMBER", scope: "own" },
  { action: "verification:upload_own", role: "INDEPENDENT_BOARD_MEMBER", scope: "own" },
  { action: "verification:upload_own", role: "COMMITTEE_MEMBER", scope: "own" },
  { action: "verification:upload_own", role: "GA_MEMBER", scope: "own" },
  { action: "verification:upload_own", role: "ADVISOR", scope: "own" },
  { action: "verification:upload_entity_level", role: "CORPORATE_SECRETARY", scope: "entity" },

  { action: "meeting:request_board", role: "CHAIRMAN", scope: "full" },
  { action: "meeting:request_board", role: "MANAGING_DIRECTOR", scope: "full" },
  { action: "meeting:request_board", role: "NON_EXECUTIVE_BOARD_MEMBER", scope: "full" },
  { action: "meeting:request_board", role: "EXECUTIVE_BOARD_MEMBER", scope: "full" },
  { action: "meeting:request_board", role: "INDEPENDENT_BOARD_MEMBER", scope: "full" },
  { action: "meeting:request_ga", role: "GA_MEMBER", scope: "full" },

  { action: "interest:declare_update", role: "CHAIRMAN", scope: "full" },
  { action: "interest:declare_update", role: "MANAGING_DIRECTOR", scope: "full" },
  { action: "interest:declare_update", role: "CORPORATE_SECRETARY", scope: "full" },
  { action: "interest:declare_update", role: "NON_EXECUTIVE_BOARD_MEMBER", scope: "full" },
  { action: "interest:declare_update", role: "EXECUTIVE_BOARD_MEMBER", scope: "full" },
  { action: "interest:declare_update", role: "INDEPENDENT_BOARD_MEMBER", scope: "full" },
  { action: "interest:declare_update", role: "COMMITTEE_MEMBER", scope: "full" },
  { action: "interest:declare_self_only", role: "GA_MEMBER", scope: "self_interest_only" },

  { action: "proxy:grant_revoke", role: "GA_MEMBER", scope: "full" },

  { action: "vote:abstain_recused", role: "CHAIRMAN", scope: "full" },
  { action: "vote:abstain_recused", role: "MANAGING_DIRECTOR", scope: "full" },
  { action: "vote:abstain_recused", role: "NON_EXECUTIVE_BOARD_MEMBER", scope: "full" },
  { action: "vote:abstain_recused", role: "EXECUTIVE_BOARD_MEMBER", scope: "full" },
  { action: "vote:abstain_recused", role: "INDEPENDENT_BOARD_MEMBER", scope: "full" },
  { action: "vote:abstain_recused", role: "GA_MEMBER", scope: "full" },

  { action: "remuneration:set_board_via_ga", role: "GA_MEMBER", scope: "full" },
  { action: "remuneration:set_executive_via_board", role: "CHAIRMAN", scope: "full" },
  { action: "remuneration:set_executive_via_board", role: "NON_EXECUTIVE_BOARD_MEMBER", scope: "full" },
  { action: "remuneration:set_executive_via_board", role: "EXECUTIVE_BOARD_MEMBER", scope: "full" },
  { action: "remuneration:set_executive_via_board", role: "INDEPENDENT_BOARD_MEMBER", scope: "full" },
];

export function grantsFor(role: GovernanceRole, action: Action): PrivilegeGrant[] {
  return PRIVILEGE_MATRIX.filter((g) => g.role === role && g.action === action);
}

export function can(role: GovernanceRole, action: Action): boolean {
  return grantsFor(role, action).length > 0;
}

/** Payout scheduling/execution is explicitly outside this table — a compliance/finance function, not a governance-role privilege (spec section 12 footnote). It is authorized separately in the remuneration module against COMPLIANCE_OFFICER. */
