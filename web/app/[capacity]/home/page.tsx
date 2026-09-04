import Link from "next/link";
import { getCapacity, meetings, complianceAlerts, agendaItems } from "@/lib/mock-data";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AlertTriangleIcon, CalendarIcon, CheckIcon } from "@/components/ui/Icons";

/**
 * Home dashboard. DESIGN-PRINCIPLES.md decisions applied directly:
 * - Doherty Threshold: stat cards (cheap) render before anything that would
 *   need a slower fetch in a real backend -- here that's simulated by
 *   keeping this a server component with no client-side loading waterfall.
 * - Serial Position Effect: the single most time-critical item leads the
 *   action-card list; a "you're caught up" state closes it.
 * - Law of Proximity: action-needed items are grouped separately from the
 *   summary stat row, not interleaved with it.
 */
export default function HomePage({ params }: { params: { capacity: string } }) {
  const capacity = getCapacity(params.capacity)!;
  const companyMeetings = meetings.filter((m) => m.companyId === capacity.companyId);
  const companyAlerts = complianceAlerts.filter(
    (a) => a.companyId === capacity.companyId && a.status === "open",
  );
  const openViolations = companyAlerts.filter((a) => a.severity === "violation");
  const pendingVotes = agendaItems.filter(
    (i) => i.requiresVote && companyMeetings.some((m) => m.id === i.meetingId),
  );

  const hasAnythingToAct = companyMeetings.length > 0 || companyAlerts.length > 0;

  return (
    <main className="px-6 py-8">
      <h1 className="text-2xl font-extrabold text-ink-900">
        Good to see you, welcome back
      </h1>
      <p className="mt-1 text-ink-500">{capacity.companyName} &middot; {capacity.roleLabel}</p>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Upcoming meetings" value={String(companyMeetings.length)} />
        <StatCard label="Pending votes" value={String(pendingVotes.length)} />
        <StatCard
          label="Compliance alerts"
          value={String(companyAlerts.length)}
          tone={openViolations.length > 0 ? "violation" : "default"}
        />
        <StatCard label="Board snapshot" value="5 of 5 present" tone="success" />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold text-ink-900">Needs your attention</h2>

      {!hasAnythingToAct && (
        <Card className="flex items-center gap-3 bg-success-50">
          <CheckIcon className="text-success-500" />
          <p className="text-[15px] font-semibold text-ink-900">
            You&apos;re caught up here -- nothing needs action right now.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {openViolations[0] && (
          <Card className="flex items-center justify-between border-l-4 border-l-violation-500">
            <div className="flex items-center gap-3">
              <AlertTriangleIcon className="text-violation-500" />
              <div>
                <Badge tone="violation" className="mb-1">Violation</Badge>
                <p className="text-[15px] font-semibold text-ink-900">{openViolations[0].title}</p>
              </div>
            </div>
            <Link href={`/${params.capacity}/compliance/alerts`}>
              <Button size="sm" variant="secondary">Review</Button>
            </Link>
          </Card>
        )}

        {companyMeetings.map((meeting) => (
          <Card key={meeting.id} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CalendarIcon className="text-ink-500" />
              <div>
                <p className="text-[15px] font-semibold text-ink-900">{meeting.title}</p>
                <p className="text-sm text-ink-500">
                  {new Date(meeting.scheduledAt).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                  {" · "}
                  {pendingVotes.length} item{pendingVotes.length === 1 ? "" : "s"} to vote on
                </p>
              </div>
            </div>
            <Link href={`/${params.capacity}/meetings/${meeting.id}/agenda`}>
              <Button size="sm">Review agenda</Button>
            </Link>
          </Card>
        ))}

        {companyAlerts.slice(openViolations.length ? 1 : 0).map((alert) => (
          <Card key={alert.id} className="flex items-center justify-between border-l-4 border-l-warning-500">
            <div>
              <Badge tone="warning" className="mb-1">Warning</Badge>
              <p className="text-[15px] font-semibold text-ink-900">{alert.title}</p>
            </div>
            <Link href={`/${params.capacity}/compliance/alerts`}>
              <Button size="sm" variant="secondary">View</Button>
            </Link>
          </Card>
        ))}
      </div>
    </main>
  );
}
