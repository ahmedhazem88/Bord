"use client";

import { useState } from "react";
import { AgendaItem, Meeting } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PillTabs } from "@/components/ui/PillTabs";
import { CheckIcon } from "@/components/ui/Icons";

const TOPIC_LABEL: Record<string, string> = {
  ordinary: "Ordinary business",
  related_party: "Related-party transaction",
  capital_change: "Capital change",
  dissolution_merger: "Dissolution / merger",
  remuneration: "Remuneration",
  other: "Other",
};

// Frequent-topics-first ordering (FR-46): this company's own most-used
// categories lead the taxonomy pill row, chunked to 4 groups rather than a
// flat list of every topic_key (DESIGN-PRINCIPLES.md, Hick's Law + Miller's Law).
const FREQUENT_TAXONOMY = [
  { key: "financial_reporting", label: "Financial reporting", count: 12 },
  { key: "related_party_transaction", label: "Related-party", count: 5 },
  { key: "committee_report_reception", label: "Committee reports", count: 4 },
  { key: "policy_approval", label: "Policy approval", count: 2 },
];

export function AgendaClient({
  meeting,
  items,
}: {
  meeting: Meeting;
  items: AgendaItem[];
}) {
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [taxonomyTab, setTaxonomyTab] = useState(FREQUENT_TAXONOMY[0].key);

  // Serial Position Effect: carried-over items lead the agenda (most likely
  // to get shortchanged mid-list), material vote items follow, routine
  // informational items close it out.
  const ordered = [...items].sort((a, b) => {
    const rank = (item: AgendaItem) =>
      item.carriedOverFromMeetingId ? 0 : item.disclosureSensitivity === "material" ? 1 : 2;
    return rank(a) - rank(b);
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <p className="text-sm font-semibold text-brand-600">Agenda builder</p>
        <h1 className="text-2xl font-extrabold text-ink-900">{meeting.title}</h1>
        <p className="mt-1 text-ink-500">
          {new Date(meeting.scheduledAt).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {ordered.map((item) => (
          <Card key={item.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {item.carriedOverFromMeetingId && <Badge tone="neutral">Carried over</Badge>}
                  <Badge tone={item.disclosureSensitivity === "material" ? "warning" : "neutral"}>
                    {TOPIC_LABEL[item.topicCategory]}
                  </Badge>
                  {item.requiresVote && <Badge tone="success">Requires vote</Badge>}
                </div>
                <p className="text-[15px] font-bold text-ink-900">{item.title}</p>
                <p className="mt-1 text-sm text-ink-500">Threshold: {item.votingThreshold}</p>
              </div>
            </div>

            {/* Discussion guide and conflict check render inline on the item
                itself, not on a separate compliance panel -- minimizing
                target distance to the point of decision (FR-40, FR-44). */}
            {item.discussionGuideExcerpt && (
              <div className="mt-4 rounded-control bg-surface-muted p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
                  Discussion guide
                </p>
                <p className="mt-1 text-sm text-ink-700">{item.discussionGuideExcerpt}</p>
              </div>
            )}

            {item.conflictCheckSummary && (
              <div className="mt-3 flex items-start justify-between gap-4 rounded-control border border-warning-100 bg-warning-50 p-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-warning-600">
                    Pre-vote conflict check &middot; advisory only
                  </p>
                  <p className="mt-1 text-sm text-ink-700">{item.conflictCheckSummary}</p>
                </div>
                {acknowledged[item.id] ? (
                  <Badge tone="success">
                    <CheckIcon width={12} height={12} /> Acknowledged
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setAcknowledged((prev) => ({ ...prev, [item.id]: true }))}
                  >
                    Acknowledge
                  </Button>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <p className="text-[15px] font-bold text-ink-900">Add an agenda item</p>
        <p className="mt-1 text-sm text-ink-500">
          Nile Leasing&apos;s own frequent topics surface first; start from scratch is always
          available too.
        </p>
        <div className="mt-4">
          <PillTabs tabs={FREQUENT_TAXONOMY} active={taxonomyTab} onChange={setTaxonomyTab} />
        </div>
        <div className="mt-4 flex items-center justify-between rounded-control border border-dashed border-ink-200 p-4">
          <p className="text-sm text-ink-500">
            Template: <span className="font-semibold text-ink-900">{FREQUENT_TAXONOMY.find((t) => t.key === taxonomyTab)?.label}</span>
          </p>
          <Button size="sm">Use template</Button>
        </div>
      </Card>
    </main>
  );
}
