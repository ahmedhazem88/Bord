export type EscalationLevel = "OVERDUE" | "DUE_3D" | "DUE_14D" | "DUE_30D" | "OK";

/** Escalating reminder thresholds — spec section 7 (30/14/3 days out). */
export function escalationLevel(nextDueAt: Date, now: Date = new Date()): EscalationLevel {
  const daysUntilDue = Math.ceil((nextDueAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (daysUntilDue < 0) return "OVERDUE";
  if (daysUntilDue <= 3) return "DUE_3D";
  if (daysUntilDue <= 14) return "DUE_14D";
  if (daysUntilDue <= 30) return "DUE_30D";
  return "OK";
}

const LEVEL_ORDER: Record<EscalationLevel, number> = { OVERDUE: 0, DUE_3D: 1, DUE_14D: 2, DUE_30D: 3, OK: 4 };

export function compareByUrgency(a: { level: EscalationLevel }, b: { level: EscalationLevel }): number {
  return LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
}
