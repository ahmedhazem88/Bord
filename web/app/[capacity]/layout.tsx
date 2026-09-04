import { notFound } from "next/navigation";
import { getCapacity, currentPerson } from "@/lib/mock-data";
import { CapacityProvider } from "@/lib/capacity-context";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

export default function CapacityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { capacity: string };
}) {
  const capacity = getCapacity(params.capacity);
  if (!capacity) notFound();

  return (
    <CapacityProvider capacityId={params.capacity}>
      <div className="flex min-h-screen">
        <Sidebar capacityId={params.capacity} />
        {/*
          Keyed on capacity id: switching capacity forces a full remount of
          everything below, rather than letting client-side state from the
          previous company's context quietly survive the switch (PRD.md
          Section 13, capacity-switch context-leakage edge case).
        */}
        <div key={params.capacity} className="flex min-h-screen flex-1 flex-col">
          <TopBar capacity={capacity} personName={currentPerson.fullName} />
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </CapacityProvider>
  );
}
