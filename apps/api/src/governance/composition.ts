import { BOARD_ROLES, EXECUTIVE_ROLES, INDEPENDENT_ROLES, NON_EXECUTIVE_ROLES, type GovernanceRole } from "@bord/shared";

const MANDATORY_COMMITTEE_TYPES = ["AUDIT", "RISK", "REMUNERATION_AND_NOMINATION", "GOVERNANCE"] as const;

export interface CommitteeMemberSnapshot {
  role: GovernanceRole;
  isChair: boolean;
}

export interface CommitteeSnapshot {
  id: string;
  name: string;
  type: (typeof MANDATORY_COMMITTEE_TYPES)[number] | "CUSTOM";
  minIndependentCount: number;
  members: CommitteeMemberSnapshot[];
}

/**
 * Epic 3 spec section 3: Audit/Risk/Remuneration & Nomination/Governance
 * committees are mandatory (custom committees may exist alongside them);
 * every committee needs a non-executive chair and its declared minimum of
 * independent members actually seated.
 */
export function validateCommitteeComposition(committees: CommitteeSnapshot[]): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const type of MANDATORY_COMMITTEE_TYPES) {
    if (!committees.some((c) => c.type === type)) {
      violations.push(`Entity has no ${type.replace(/_/g, " ")} committee — Audit, Risk, Remuneration & Nomination, and Governance committees are mandatory.`);
    }
  }

  for (const c of committees) {
    const chairs = c.members.filter((m) => m.isChair);
    if (chairs.length === 0) {
      violations.push(`Committee "${c.name}" has no chair.`);
    } else if (chairs.some((m) => EXECUTIVE_ROLES.includes(m.role))) {
      violations.push(`Committee "${c.name}"'s chair must be non-executive.`);
    }

    const independentCount = c.members.filter((m) => INDEPENDENT_ROLES.includes(m.role)).length;
    if (independentCount < c.minIndependentCount) {
      violations.push(`Committee "${c.name}" requires at least ${c.minIndependentCount} independent member(s); currently has ${independentCount}.`);
    }
  }

  return { valid: violations.length === 0, violations };
}

export interface BoardMemberSnapshot {
  capacityId: string;
  userId: string;
  role: GovernanceRole;
  gender: "MALE" | "FEMALE" | null;
}

export interface CompositionCheckOptions {
  chairMdSeparationExceptionApproved: boolean;
}

/**
 * Epic 3 AC: block finalizing a board structure that violates a composition
 * rule, with a clear explanation of which rule failed — spec section 3.
 * Returns every violated rule, not just the first, so the UI can show the
 * full list at once.
 */
export function validateBoardComposition(members: BoardMemberSnapshot[], options: CompositionCheckOptions): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  const boardMembers = members.filter((m) => BOARD_ROLES.includes(m.role));
  const chairman = members.find((m) => m.role === "CHAIRMAN");
  const md = members.find((m) => m.role === "MANAGING_DIRECTOR");

  if (boardMembers.length < 3) {
    violations.push(`Board must have at least 3 members including the chairman (Companies Law Art. 60); currently has ${boardMembers.length}.`);
  }
  if (!chairman) {
    violations.push("Board has no chairman.");
  }

  const nonExecutiveCount = boardMembers.filter((m) => NON_EXECUTIVE_ROLES.includes(m.role) || m.role === "CHAIRMAN").length;
  const executiveCount = boardMembers.filter((m) => EXECUTIVE_ROLES.includes(m.role)).length;
  if (boardMembers.length > 0 && nonExecutiveCount <= executiveCount) {
    violations.push(
      `Majority of the board must be non-executive; currently ${nonExecutiveCount} non-executive vs ${executiveCount} executive out of ${boardMembers.length}.`,
    );
  }

  const independentCount = boardMembers.filter((m) => INDEPENDENT_ROLES.includes(m.role)).length;
  const nonExecutiveOnlyCount = boardMembers.filter((m) => NON_EXECUTIVE_ROLES.includes(m.role)).length;
  if (nonExecutiveOnlyCount > 0 && independentCount * 2 < nonExecutiveOnlyCount) {
    violations.push(
      `At least half of non-executive members must be independent; currently ${independentCount} independent out of ${nonExecutiveOnlyCount} non-executive.`,
    );
  }

  // Compared by userId, not capacityId — Chairman and MD are always distinct
  // Capacity rows (one per role) even when the same person holds both, so a
  // capacityId comparison could never catch this.
  if (chairman && md && chairman.userId === md.userId && !options.chairMdSeparationExceptionApproved) {
    violations.push("Chairman and Managing Director must be different people, unless the entity has an FRA-disclosed exception on file.");
  }

  // Spec section 3: "25% of members or a minimum of two, whichever the
  // entity's size makes applicable" — read as the greater of the two floors
  // (a small board still needs its 2; a large board's 25% naturally exceeds
  // 2), capped at the board's actual size.
  const femaleCount = boardMembers.filter((m) => m.gender === "FEMALE").length;
  const requiredFemale = boardMembers.length > 0 ? Math.min(boardMembers.length, Math.max(2, Math.ceil(boardMembers.length * 0.25))) : 0;
  if (boardMembers.length > 0 && femaleCount < requiredFemale) {
    violations.push(
      `Board must include women at 25% of members or a minimum of 2, whichever applies; requires ${requiredFemale}, currently has ${femaleCount} of ${boardMembers.length}.`,
    );
  }

  return { valid: violations.length === 0, violations };
}
