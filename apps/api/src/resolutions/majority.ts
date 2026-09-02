import type { VoteValue } from "@prisma/client";

/**
 * Required-majority rules — spec section 6. OGM: absolute majority (50%+1)
 * of shares present. EGM: two-thirds, or three-quarters for capital
 * reduction/dissolution/merger/purpose-change, or unanimous for a merger
 * that increases shareholder liability. Board: simple majority of members
 * present and voting.
 */
export type MajorityRule = "BOARD_MAJORITY" | "ABSOLUTE_MAJORITY" | "TWO_THIRDS" | "THREE_QUARTERS" | "UNANIMOUS";

export const MAJORITY_RULES: MajorityRule[] = ["BOARD_MAJORITY", "ABSOLUTE_MAJORITY", "TWO_THIRDS", "THREE_QUARTERS", "UNANIMOUS"];

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
