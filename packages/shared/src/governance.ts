/** Effect basis — spec section 4 / PRD section 5.4. Determines which date makes a resolution's change effective. */
export type EffectBasis = "RESOLUTION_EFFECTIVE" | "AUTHORIZATION_EFFECTIVE";

/** Resolution lifecycle — PRD section 5.4 / spec section 4. */
export type ResolutionStatus = "DRAFT" | "PASSED" | "PENDING_AUTHORIZATION" | "RATIFIED" | "REJECTED" | "LAPSED";

export type ResolutionType =
  | "COMMITTEE_ASSIGNMENT"
  | "MD_REMUNERATION"
  | "EXECUTIVE_REMUNERATION"
  | "PROCEDURAL"
  | "BOARD_APPOINTMENT"
  | "BOARD_REMOVAL"
  | "GA_SET_BOARD_REMUNERATION"
  | "AOA_AMENDMENT"
  | "CAPITAL_CHANGE"
  | "INITIAL_STRUCTURE"
  | "BUDGET_APPROVAL"
  | "FINANCIAL_STATEMENTS_APPROVAL"
  | "DISSOLUTION"
  | "MERGER"
  | "MERGER_INCREASING_LIABILITY"
  | "PURPOSE_CHANGE";

/** Statutory default effect basis per resolution type — overridable per-entity via RegulatoryRule custom override (PRD 5.4, spec section 8). */
export const DEFAULT_EFFECT_BASIS: Record<ResolutionType, EffectBasis> = {
  COMMITTEE_ASSIGNMENT: "RESOLUTION_EFFECTIVE",
  MD_REMUNERATION: "RESOLUTION_EFFECTIVE",
  EXECUTIVE_REMUNERATION: "RESOLUTION_EFFECTIVE",
  PROCEDURAL: "RESOLUTION_EFFECTIVE",
  BOARD_APPOINTMENT: "AUTHORIZATION_EFFECTIVE",
  BOARD_REMOVAL: "AUTHORIZATION_EFFECTIVE",
  GA_SET_BOARD_REMUNERATION: "AUTHORIZATION_EFFECTIVE",
  AOA_AMENDMENT: "AUTHORIZATION_EFFECTIVE",
  CAPITAL_CHANGE: "AUTHORIZATION_EFFECTIVE",
  // Onboarding baseline is immediate, not subject to GAFI ratification —
  // it establishes the starting record, it doesn't change one.
  INITIAL_STRUCTURE: "RESOLUTION_EFFECTIVE",
  // Internal governance approvals — the regulatory filing obligation
  // itself (e.g. FRA annual disclosure) is tracked separately as a
  // RegulatoryObligation, not gated through GAFI authorization here.
  BUDGET_APPROVAL: "RESOLUTION_EFFECTIVE",
  FINANCIAL_STATEMENTS_APPROVAL: "RESOLUTION_EFFECTIVE",
  // EGM extraordinary matters — same GAFI-ratification-gated basis as AoA
  // amendment/capital change: internal record from the resolution date,
  // binding on third parties only from ratification.
  DISSOLUTION: "AUTHORIZATION_EFFECTIVE",
  MERGER: "AUTHORIZATION_EFFECTIVE",
  MERGER_INCREASING_LIABILITY: "AUTHORIZATION_EFFECTIVE",
  PURPOSE_CHANGE: "AUTHORIZATION_EFFECTIVE",
};

export type VoteValue = "FOR" | "AGAINST" | "ABSTAIN" | "RECUSED";

export type MeetingType = "BOARD" | "COMMITTEE" | "OGM" | "EGM";

export type AttendanceMode = "IN_PERSON" | "VIRTUAL" | "PROXY";

export type VerificationStatus = "PENDING" | "APPROVED" | "REJECTED";

export type PayoutStatus = "SCHEDULED" | "PAID" | "FAILED" | "REVERSED";
