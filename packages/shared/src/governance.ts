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
  | "CAPITAL_CHANGE";

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
};

export type VoteValue = "FOR" | "AGAINST" | "ABSTAIN" | "RECUSED";

export type MeetingType = "BOARD" | "COMMITTEE" | "OGM" | "EGM";

export type AttendanceMode = "IN_PERSON" | "VIRTUAL" | "PROXY";

export type VerificationStatus = "PENDING" | "APPROVED" | "REJECTED";

export type PayoutStatus = "SCHEDULED" | "PAID" | "FAILED" | "REVERSED";
