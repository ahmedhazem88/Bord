import type { ReactNode } from "react";

/** Restrained status language per PRD section 4 — a dot + short label, never a heavy traffic-light UI. Reserve "blocking" for things genuinely blocking (e.g. quorum lost mid-vote). */
export function StatusLabel({ label, blocking = false }: { label: string; blocking?: boolean }) {
  return (
    <span className={`status-label${blocking ? " status-blocking" : ""}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

export function Callout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="callout">
      <span className="callout-label">{label}</span>
      {children}
    </div>
  );
}
