import type { ResolutionType, VoteValue } from "@prisma/client";

/**
 * Required-majority rules — spec section 6. OGM: absolute majority (50%+1)
 * of shares present. EGM: two-thirds, or three-quarters for capital
 * reduction/dissolution/merger/purpose-change, or unanimous for a merger
 * that increases shareholder liability. Board: simple majority of members
 * present and voting.
 */
export type MajorityRule = "BOARD_MAJORITY" | "ABSOLUTE_MAJORITY" | "TWO_THIRDS" | "THREE_QUARTERS" | "UNANIMOUS";

export const MAJORITY_RULES: MajorityRule[] = ["BOARD_MAJORITY", "ABSOLUTE_MAJORITY", "TWO_THIRDS", "THREE_QUARTERS", "UNANIMOUS"];

/**
 * The majority a resolution type requires is a legal fact, not a caller
 * choice — previously any majority could be set on any resolution type
 * (e.g. a capital-reduction resolution passed by simple board majority).
 * INITIAL_STRUCTURE has no entry: it's never voted on, only ever created
 * through the onboarding bootstrap path (governance/routes.ts), which
 * supplies its own non-voting requiredMajority value directly.
 */
export function requiredMajorityForType(type: Exclude<ResolutionType, "INITIAL_STRUCTURE">): MajorityRule {
  switch (type) {
    case "BOARD_APPOINTMENT":
    case "BOARD_REMOVAL":
    case "COMMITTEE_ASSIGNMENT":
    case "MD_REMUNERATION":
    case "EXECUTIVE_REMUNERATION":
    case "PROCEDURAL":
    case "BUDGET_APPROVAL":
    case "FINANCIAL_STATEMENTS_APPROVAL":
      return "BOARD_MAJORITY";
    case "GA_SET_BOARD_REMUNERATION":
      // Ordinary OGM item — absolute majority (50%+1) of shares present.
      return "ABSOLUTE_MAJORITY";
    case "AOA_AMENDMENT":
      // Ordinary EGM item — two-thirds of shares represented. A change of
      // company purpose is an AoA amendment too, but the spec sets it a
      // higher bar — use PURPOSE_CHANGE for that specific case instead.
      return "TWO_THIRDS";
    case "CAPITAL_CHANGE":
    case "DISSOLUTION":
    case "MERGER":
    case "PURPOSE_CHANGE":
      return "THREE_QUARTERS";
    case "MERGER_INCREASING_LIABILITY":
      return "UNANIMOUS";
  }
}

export interface CastVoteInput {
  value: VoteValue;
  weight: number;
  excludedByLaw: boolean;
}

export interface TallyResult {
  forWeight: number;
  againstWeight: number;
  abstainWeight: number;
  recusedWeight: number;
  presentWeight: number; // for + against + abstain — the denominator for majority checks
  voteCount: number;
}

export function tally(votes: CastVoteInput[]): TallyResult {
  let forWeight = 0;
  let againstWeight = 0;
  let abstainWeight = 0;
  let recusedWeight = 0;

  for (const v of votes) {
    if (v.excludedByLaw || v.value === "RECUSED") {
      recusedWeight += v.weight;
      continue;
    }
    if (v.value === "FOR") forWeight += v.weight;
    else if (v.value === "AGAINST") againstWeight += v.weight;
    else if (v.value === "ABSTAIN") abstainWeight += v.weight;
  }

  return {
    forWeight,
    againstWeight,
    abstainWeight,
    recusedWeight,
    presentWeight: forWeight + againstWeight + abstainWeight,
    voteCount: votes.length,
  };
}

export function checkMajority(rule: MajorityRule, result: TallyResult): { passed: boolean; requiredWeight: number } {
  switch (rule) {
    case "BOARD_MAJORITY":
      return { passed: result.forWeight > result.againstWeight, requiredWeight: result.againstWeight + Number.EPSILON };
    case "ABSOLUTE_MAJORITY": {
      const required = result.presentWeight / 2;
      return { passed: result.forWeight > required, requiredWeight: required };
    }
    case "TWO_THIRDS": {
      const required = (result.presentWeight * 2) / 3;
      return { passed: result.forWeight >= required && result.presentWeight > 0, requiredWeight: required };
    }
    case "THREE_QUARTERS": {
      const required = (result.presentWeight * 3) / 4;
      return { passed: result.forWeight >= required && result.presentWeight > 0, requiredWeight: required };
    }
    case "UNANIMOUS":
      return { passed: result.presentWeight > 0 && result.forWeight === result.presentWeight, requiredWeight: result.presentWeight };
  }
}
