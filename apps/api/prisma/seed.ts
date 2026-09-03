import { PrismaClient } from "@prisma/client";
import { DEFAULT_EFFECT_BASIS, type ResolutionType } from "@bord/shared";

const prisma = new PrismaClient();

/**
 * Seeds the statutory-default RegulatoryRule rows (spec section 8 / PRD
 * Epic 7) so every rule this platform enforces has a citation and version
 * on record from day one, not just a hardcoded constant. Effect-basis rules
 * mirror @bord/shared's DEFAULT_EFFECT_BASIS so the Resolution Engine's
 * fallback and this table never drift silently.
 */
async function main() {
  const effectBasisRules = Object.entries(DEFAULT_EFFECT_BASIS) as [ResolutionType, string][];
  for (const [type, basis] of effectBasisRules) {
    await prisma.regulatoryRule.upsert({
      where: { ruleKey: `EFFECT_BASIS_${type}` },
      create: {
        ruleKey: `EFFECT_BASIS_${type}`,
        description: `Effect basis for ${type} resolutions`,
        currentValue: basis,
        legalCitation: "PRD section 5.4 / MVP spec section 4",
      },
      update: {},
    });
  }

  const rules: { ruleKey: string; description: string; currentValue: unknown; legalCitation: string }[] = [
    { ruleKey: "OGM_NOTICE_PERIOD_DAYS", description: "Minimum OGM/EGM notice period", currentValue: 21, legalCitation: "Executive Regulations Art. 202 para. 3, as amended by Ministerial Decree 94/2017" },
    { ruleKey: "BOARD_GENDER_QUOTA_PCT", description: "Minimum female board representation (percentage, subject to a 2-member floor)", currentValue: 25, legalCitation: "FRA board-composition circulars (see spec section 3)" },
    { ruleKey: "BOARD_MEETING_MAX_GAP_DAYS", description: "Maximum gap between board meetings", currentValue: 90, legalCitation: "Executive Regulations Art. 203" },
    { ruleKey: "GAFI_RATIFICATION_WINDOW_DAYS", description: "Window to submit OGM/EGM documentation to GAFI for ratification", currentValue: 30, legalCitation: "Companies Law Art. 75 / Executive Regulations Art. 214" },
    { ruleKey: "FRA_MINUTES_SUBMISSION_DAYS", description: "Window to submit GA/board minutes to the FRA", currentValue: 10, legalCitation: "FRA Decree 100/2020" },
    { ruleKey: "AUDITOR_MAX_TENURE_YEARS", description: "Maximum consecutive auditor tenure", currentValue: 6, legalCitation: "FRA auditor-rotation rules (see spec section 6)" },
    { ruleKey: "BOARD_REMUNERATION_CAP_PCT_OF_NET_DISTRIBUTABLE_PROFIT", description: "Aggregate board remuneration cap, after reserves and minimum dividend, absent an AoA override", currentValue: 10, legalCitation: "Egyptian jurisprudence on board remuneration (see spec section 9)" },
    // Approval chains — resolveApprovalChain in resolutions/engine.ts reads
    // these the same way it reads any other bylaw-configurable rule. A
    // chain entry is a CommitteeType name or the literal "BOARD"; the last
    // entry is the terminal stage.
    { ruleKey: "APPROVAL_CHAIN_BUDGET_APPROVAL", description: "Approving bodies for annual budget approval, in order", currentValue: ["AUDIT", "BOARD"], legalCitation: "Corporate governance practice: budget review by the Audit Committee precedes Board approval" },
    { ruleKey: "APPROVAL_CHAIN_FINANCIAL_STATEMENTS_APPROVAL", description: "Approving bodies for financial statements approval, in order", currentValue: ["AUDIT", "BOARD"], legalCitation: "Corporate governance practice: financial statements review by the Audit Committee precedes Board approval" },
  ];

  for (const rule of rules) {
    await prisma.regulatoryRule.upsert({
      where: { ruleKey: rule.ruleKey },
      create: { ...rule, currentValue: rule.currentValue as never },
      update: {},
    });
  }

  console.log(`Seeded ${effectBasisRules.length + rules.length} regulatory rules.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
