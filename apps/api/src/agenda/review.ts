import type { Prisma } from "@prisma/client";

/**
 * Agenda-item compliance review — checks a proposed or confirmed agenda
 * item's text against the entity's own governing documents (Articles of
 * Association, Bylaws, Shareholders' Agreements, other agreements,
 * covenants, warrants — GoverningDocument) and against applicable law
 * (RegulatoryRule, already the platform's single source of truth for
 * quorum %, term limits, notice periods, etc.), surfacing anything that
 * looks relevant for a human reviewer to check before the item goes on
 * the final agenda.
 *
 * CURRENT IMPLEMENTATION: deterministic term-overlap matching between the
 * agenda item's text and each document/rule's text — no external call, no
 * API key, works offline. This is intentionally not a language-model call:
 * nothing in this environment is configured with an LLM provider credential
 * for the *application* to call at runtime (Claude Code's own tooling
 * credentials are for this coding session, not something apps/api can use
 * from a deployed server). The function signature below is the seam a real
 * LLM-based semantic reviewer would sit behind if a provider key is ever
 * configured — swap the body, keep reviewAgendaItem's contract, and every
 * caller (agenda propose/set/re-review routes) keeps working unchanged.
 */

export interface ComplianceFlag {
  source: "GOVERNING_DOCUMENT" | "REGULATORY_RULE" | "INTEREST_DECLARATION";
  refId: string;
  documentType?: string;
  title: string;
  citation: string | null;
  excerpt: string;
  matchedTerms: string[];
  // INTEREST_DECLARATION flags only: whose declared interest this is, so
  // the Secretary/Chairman see it before the meeting starts (spec section
  // 9 / Epic 9), not discovered mid-vote.
  declaredByCapacityId?: string;
  declaredByRole?: string;
}

const STOPWORDS = new Set([
  "that",
  "this",
  "with",
  "from",
  "have",
  "will",
  "shall",
  "must",
  "into",
  "such",
  "than",
  "then",
  "when",
  "where",
  "which",
  "while",
  "about",
  "under",
  "over",
  "upon",
  "these",
  "those",
  "each",
  "shall",
  "your",
  "their",
  "there",
  "here",
]);

// A term must be long enough to be meaningful and not a stopword to count
// toward a match — this is deliberately conservative (favors precision:
// fewer, more relevant flags over a noisy list of coincidental overlaps).
function significantTerms(text: string): Set<string> {
  const terms = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return new Set(terms);
}

function excerptAround(content: string, term: string, radius = 90): string {
  const idx = content.toLowerCase().indexOf(term);
  if (idx === -1) return content.slice(0, radius * 2).trim();
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + term.length + radius);
  return `${start > 0 ? "…" : ""}${content.slice(start, end).trim()}${end < content.length ? "…" : ""}`;
}

// Require at least two shared significant terms before raising a flag — a
// single generic overlapping word (e.g. "resolution") isn't worth a
// reviewer's attention; two or more distinct terms overlapping is a real
// signal the agenda item touches that document/rule's subject matter.
const MIN_MATCHED_TERMS = 2;

export async function reviewAgendaItem(
  tx: Prisma.TransactionClient,
  entityId: string,
  title: string,
  description?: string | null,
): Promise<ComplianceFlag[]> {
  const itemTerms = significantTerms(`${title} ${description ?? ""}`);
  if (itemTerms.size === 0) return [];

  const [documents, rules, interestDeclarations] = await Promise.all([
    tx.governingDocument.findMany({ where: { entityId } }),
    // RegulatoryRule carries no entity-scoping RLS (it's the platform-wide
    // legal rule set, not per-tenant data) — readable from any tx.
    tx.regulatoryRule.findMany(),
    tx.interestDeclaration.findMany({ where: { capacity: { entityId }, active: true }, include: { capacity: { select: { id: true, role: true } } } }),
  ]);

  const flags: ComplianceFlag[] = [];

  for (const doc of documents) {
    const docTerms = significantTerms(doc.content);
    const matched = [...itemTerms].filter((t) => docTerms.has(t));
    if (matched.length < MIN_MATCHED_TERMS) continue;
    flags.push({
      source: "GOVERNING_DOCUMENT",
      refId: doc.id,
      documentType: doc.type,
      title: doc.title,
      citation: doc.citation,
      excerpt: excerptAround(doc.content, matched[0]!),
      matchedTerms: matched,
    });
  }

  for (const rule of rules) {
    const ruleText = `${rule.description} ${rule.ruleKey.replace(/_/g, " ")}`;
    const ruleTerms = significantTerms(ruleText);
    const matched = [...itemTerms].filter((t) => ruleTerms.has(t));
    if (matched.length < MIN_MATCHED_TERMS) continue;
    flags.push({
      source: "REGULATORY_RULE",
      refId: rule.id,
      title: rule.ruleKey.replace(/_/g, " "),
      citation: rule.legalCitation,
      excerpt: rule.description,
      matchedTerms: matched,
    });
  }

  // Interest registry (spec section 9): naming a declared related entity is
  // a direct signal, not a term-overlap heuristic — a plain case-insensitive
  // substring match on the declared name against the item's actual text.
  const itemText = `${title} ${description ?? ""}`.toLowerCase();
  for (const declaration of interestDeclarations) {
    if (!itemText.includes(declaration.relatedEntityName.toLowerCase())) continue;
    flags.push({
      source: "INTEREST_DECLARATION",
      refId: declaration.id,
      title: `Declared interest — ${declaration.relatedEntityName}`,
      citation: null,
      excerpt: declaration.natureOfInterest,
      matchedTerms: [declaration.relatedEntityName],
      declaredByCapacityId: declaration.capacityId,
      declaredByRole: declaration.capacity.role,
    });
  }

  return flags;
}
