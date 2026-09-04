import { getCapacity, conflictFlags } from "@/lib/mock-data";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const TYPE_LABEL: Record<string, string> = {
  consistent_split_votes: "Consistent split-voting bloc",
  independent_vs_representative_opposition: "Independent vs. representative opposition",
  mislabel_incident: "Possible independence mislabel",
  other_manipulation_signal: "Other signal",
};

/**
 * Conflict flags. Full-board visibility by explicit product decision
 * (FR-58/FR-59) -- every capacity at the company can see this page, not
 * just chairman/company_secretary/compliance_officer/system_admin, so the
 * banner below states that plainly rather than the page silently behaving
 * as if it were restricted.
 *
 * `mislabel_incident` renders in the neutral `flag` tone, never the
 * `violation` red: DESIGN-PRINCIPLES.md's Von Restorff entry on this exact
 * type -- findable, not alarming, since a false positive here is a public
 * allegation against a named director the instant it fires.
 */
export default function ConflictFlagsPage({ params }: { params: { capacity: string } }) {
  const capacity = getCapacity(params.capacity)!;
  const flags = conflictFlags.filter((f) => f.companyId === capacity.companyId);

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-extrabold text-ink-900">Governance conflict flags</h1>
      <Card className="mt-3 bg-brand-50">
        <p className="text-sm text-ink-700">
          Visible to every capacity at {capacity.companyName}, by explicit design decision --
          not restricted to compliance roles. Advisory only: no flag here blocks a vote,
          resolution, or capacity assignment.
        </p>
      </Card>

      <div className="mt-6 flex flex-col gap-4">
        {flags.map((flag) => {
          const isMislabel = flag.type === "mislabel_incident";
          return (
            <Card key={flag.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Badge tone={isMislabel ? "flag" : "neutral"} className="mb-2">
                    {TYPE_LABEL[flag.type]}
                  </Badge>
                  <p className="text-[15px] font-semibold text-ink-900">{flag.detectionNote}</p>
                </div>
                <Button size="sm" variant="secondary">
                  Review
                </Button>
              </div>

              {isMislabel && (
                <p className="mt-2 text-xs font-medium italic text-ink-500">
                  A lead worth investigating, not confirmed misconduct.
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {flag.relatedCapacityNames.map((name) => (
                  <span
                    key={name}
                    className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-semibold text-ink-700"
                  >
                    {name}
                  </span>
                ))}
                {flag.relatedResolutionTitles.map((title) => (
                  <span
                    key={title}
                    className="rounded-full border border-dashed border-ink-200 bg-white px-3 py-1 text-xs font-semibold text-ink-500"
                  >
                    {title}
                  </span>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
