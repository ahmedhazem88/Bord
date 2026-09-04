import { getCapacity, complianceAlerts } from "@/lib/mock-data";
import { AlertRow } from "@/components/AlertRow";

export default function AlertsPage({ params }: { params: { capacity: string } }) {
  const capacity = getCapacity(params.capacity)!;
  const alerts = complianceAlerts.filter((a) => a.companyId === capacity.companyId);
  const violations = alerts.filter((a) => a.severity === "violation");
  const warnings = alerts.filter((a) => a.severity === "warning");

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-extrabold text-ink-900">Compliance alerts</h1>
      <p className="mt-1 text-ink-500">
        Severity-tiered against {capacity.companyName}&apos;s loaded rules profile.
      </p>

      {violations.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-violation-500">
            Live violations &middot; must act now
          </h2>
          <div className="flex flex-col gap-3">
            {violations.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </div>
        </section>
      )}

      {warnings.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-warning-500">
            Forward warnings
          </h2>
          <div className="flex flex-col gap-3">
            {warnings.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
