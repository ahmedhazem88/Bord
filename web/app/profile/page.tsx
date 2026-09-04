import Link from "next/link";
import { currentPerson, selfDeclaredPositions } from "@/lib/mock-data";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { ArrowLeftIcon, CheckIcon } from "@/components/ui/Icons";

/**
 * Individual onboarding / profile hub (Journey I). Deliberately outside the
 * [capacity] route namespace -- a person's identity isn't a company context
 * (ARCHITECTURE.md Section 2). The four steps stay independently visible and
 * completable rather than gated behind one form, and the completeness ring
 * is the Zeigarnik Effect applied on purpose: the gap is what should pull a
 * time-poor Persona 2 back to finish bank details later (DESIGN-PRINCIPLES.md).
 */
export default function ProfilePage() {
  const steps = [
    { key: "account", label: "Personal & professional info", done: true, href: "/profile" },
    { key: "kyc", label: "KYC verification", done: true, href: "/profile" },
    {
      key: "positions",
      label: "Declared positions",
      done: true,
      href: "/profile",
      note: `${selfDeclaredPositions.length} self-declared position`,
    },
    { key: "bank", label: "Bank details", done: false, href: "/profile" },
  ];

  return (
    <main className="min-h-screen bg-surface-muted px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/capacity-switch"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-ink-500 hover:text-ink-900"
        >
          <ArrowLeftIcon width={16} height={16} /> Back to companies
        </Link>

        <Card className="mb-6 flex items-center gap-6">
          <ProgressRing value={currentPerson.profileCompleteness} label="complete" />
          <div>
            <p className="text-xl font-extrabold text-ink-900">{currentPerson.fullName}</p>
            <p className="mt-1 text-sm text-ink-500">
              3 of 4 onboarding steps done. Your profile stays usable in the meantime --
              finish bank details whenever you have a minute.
            </p>
            <Badge tone="verified" className="mt-3">
              <CheckIcon width={12} height={12} /> KYC verified
            </Badge>
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          {steps.map((step) => (
            <Card key={step.key} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={
                    step.done
                      ? "flex h-8 w-8 items-center justify-center rounded-full bg-success-50 text-success-500"
                      : "flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-ink-300 text-ink-300"
                  }
                >
                  {step.done && <CheckIcon width={16} height={16} />}
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-ink-900">{step.label}</p>
                  {step.note && <p className="text-sm text-ink-500">{step.note}</p>}
                </div>
              </div>
              {!step.done && (
                <Button size="sm" variant="secondary">
                  Complete
                </Button>
              )}
            </Card>
          ))}
        </div>

        <Card className="mt-6">
          <p className="text-[15px] font-bold text-ink-900">Declared positions</p>
          <p className="mt-1 text-sm text-ink-500">
            Positions you hold outside bord-tenant companies. Shown as self-declared until a
            real capacity record exists.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {selfDeclaredPositions.map((position) => (
              <div
                key={position.id}
                className="flex items-center justify-between rounded-control border border-ink-100 px-4 py-3"
              >
                <div>
                  <p className="text-[15px] font-semibold text-ink-900">
                    {position.roleTypeFreetext}
                  </p>
                  <p className="text-sm text-ink-500">{position.companyNameFreetext}</p>
                </div>
                <Badge tone="self-declared" dot>
                  Self-declared, unverified
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <div className="mt-6">
          <Link href="/profile/credits" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
            My credits wallet &rarr;
          </Link>
        </div>
      </div>
    </main>
  );
}
