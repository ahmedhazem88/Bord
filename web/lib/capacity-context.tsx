"use client";

import { createContext, useContext } from "react";
import { Capacity } from "./types";
import { getCapacity } from "./mock-data";

/**
 * Active-capacity context. ARCHITECTURE.md Section 2 / PRD.md Section 13
 * (Identity & auth edge case): switching capacity must re-scope the entire
 * sidebar and must not leak the previous company's cached data into the new
 * context. Concretely here: the [capacity] layout keys its content subtree
 * on the capacity id (see app/[capacity]/layout.tsx), which forces a full
 * remount of every screen below it on switch, rather than letting client
 * state quietly persist across a company boundary.
 */
const CapacityContext = createContext<Capacity | null>(null);

export function CapacityProvider({
  capacityId,
  children,
}: {
  capacityId: string;
  children: React.ReactNode;
}) {
  const capacity = getCapacity(capacityId) ?? null;
  return <CapacityContext.Provider value={capacity}>{children}</CapacityContext.Provider>;
}

export function useActiveCapacity(): Capacity {
  const capacity = useContext(CapacityContext);
  if (!capacity) {
    throw new Error("useActiveCapacity must be used within a CapacityProvider");
  }
  return capacity;
}
