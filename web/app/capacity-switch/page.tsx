import Link from "next/link";
import { capacities, currentPerson } from "@/lib/mock-data";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";

/**
 * Capacity switcher. PRD Persona 2 (Karim): 3-4 boards + committee seats,
 * so this list stays well under Miller's-Law's ~7 chunks at realistic
 * scale; DESIGN-PRINCIPLES.md's Hick's Law entry flags that once a
 * portfolio director's capacity count grows past that, this should group
 * or add search rather than stay a flat list -- not yet needed at 3.
 */
export default function CapacitySwitchPage() {
  return (
    <main className="min-h-screen bg-surface-muted px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <Avatar name={currentPerson.fullName} size="lg" />
          <div>
            <p className="text-lg font-bold text-ink-900">{currentPerson.fullName}</p>
            <p className="text-sm text-ink-500">Choose a company to continue</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {capacities.map((capacity) => (
            <Link key={capacity.id} href={`/${capacity.id}/home`}>
              <Card interactive className="flex items-center justify-between">
                <div>
                  <p className="text-[15px] font-bold text-ink-900">{capacity.companyName}</p>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {capacity.roleLabel}
                    {capacity.isCommitteeScoped ? ` · ${capacity.committeeName}` : ""}
                  </p>
                </div>
                {capacity.isCommitteeScoped && <Badge tone="neutral">Committee-scoped</Badge>}
              </Card>
            </Link>
          ))}
        </div>

        <div className="mt-6 border-t border-ink-100 pt-6">
          <Link
            href="/profile"
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            My profile &amp; credits &rarr;
          </Link>
        </div>
      </div>
    </main>
  );
}
