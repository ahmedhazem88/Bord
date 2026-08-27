/**
 * Governance roles — spec section 2 (User Types & Capacities).
 * PlatformAdmin is operator-side only and never holds a Capacity at an entity.
 */
export const GOVERNANCE_ROLES = [
  "CHAIRMAN",
  "VICE_CHAIRMAN",
  "MANAGING_DIRECTOR",
  "CORPORATE_SECRETARY",
  "EXECUTIVE_BOARD_MEMBER",
  "NON_EXECUTIVE_BOARD_MEMBER",
  "INDEPENDENT_BOARD_MEMBER",
  "COMMITTEE_MEMBER",
  "COMMITTEE_CHAIR",
  "ADVISOR",
  "GA_MEMBER",
  "COMPLIANCE_OFFICER",
] as const;
export type GovernanceRole = (typeof GOVERNANCE_ROLES)[number];

export const PLATFORM_ROLE = "PLATFORM_ADMIN" as const;

/** Roles that count as "board member" for board-level rules (quorum, composition, voting). */
export const BOARD_ROLES: GovernanceRole[] = [
  "CHAIRMAN",
  "VICE_CHAIRMAN",
  "MANAGING_DIRECTOR",
  "EXECUTIVE_BOARD_MEMBER",
  "NON_EXECUTIVE_BOARD_MEMBER",
  "INDEPENDENT_BOARD_MEMBER",
];

/** Roles counted as non-executive for composition rules. */
export const NON_EXECUTIVE_ROLES: GovernanceRole[] = [
  "VICE_CHAIRMAN",
  "NON_EXECUTIVE_BOARD_MEMBER",
  "INDEPENDENT_BOARD_MEMBER",
];

export const INDEPENDENT_ROLES: GovernanceRole[] = ["INDEPENDENT_BOARD_MEMBER"];

export const EXECUTIVE_ROLES: GovernanceRole[] = ["MANAGING_DIRECTOR", "EXECUTIVE_BOARD_MEMBER"];

/** Roles requiring a stronger MFA factor (hardware key / authenticator app, never SMS) — spec section 9.2. */
export const STRONG_MFA_ROLES: (GovernanceRole | typeof PLATFORM_ROLE)[] = [
  "CHAIRMAN",
  "COMPLIANCE_OFFICER",
  PLATFORM_ROLE,
];
