import { ComplianceAlert } from "@/lib/types";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { AlertTriangleIcon, InfoIcon } from "./ui/Icons";
import { cn } from "@/lib/utils";

/**
 * Alerts feed row. DESIGN-PRINCIPLES.md, Von Restorff Effect: a `violation`
 * must visually break pattern from every `warning`, not just differ by a
 * label -- here that's a filled red left-bar + solid icon vs. a warning
 * amber outline, so severity-tiered scanning (the screen's whole purpose,
 * PRD FR-21) works at a glance before reading any text.
 */
export function AlertRow({ alert }: { alert: ComplianceAlert }) {
  const isViolation = alert.severity === "violation";
  return (
    <Card
      className={cn(
        "flex items-start gap-4 border-l-4 p-4",
        isViolation ? "border-l-violation-500" : "border-l-warning-500",
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          isViolation ? "bg-violation-50 text-violation-500" : "bg-warning-50 text-warning-500",
        )}
      >
        {isViolation ? <AlertTriangleIcon /> : <InfoIcon />}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Badge tone={isViolation ? "violation" : "warning"}>
            {isViolation ? "Violation" : "Warning"}
          </Badge>
          <Badge tone="neutral">{alert.confidence} confidence</Badge>
        </div>
        <p className="mt-2 text-[15px] font-semibold text-ink-900">{alert.title}</p>
        <p className="mt-1 text-sm text-ink-500">{alert.sourceCitation}</p>
      </div>
      {alert.status === "acknowledged" && <Badge tone="neutral">Acknowledged</Badge>}
    </Card>
  );
}
