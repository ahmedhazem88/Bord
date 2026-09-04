import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

type BadgeTone =
  | "verified"
  | "self-declared"
  | "violation"
  | "warning"
  | "flag"
  | "success"
  | "neutral";

const toneClasses: Record<BadgeTone, string> = {
  // Real Capacity-backed independence/position data
  verified: "bg-brand-500 text-white",
  // SelfDeclaredPosition data -- AGENTS.md guardrail: must never be less
  // prominent than the verified badge. Same size/weight/boldness, a
  // distinct pattern (outlined + dot) rather than a paler fill, so it
  // reads as "different meaning," not "less important."
  "self-declared": "bg-white text-ink-900 border-2 border-ink-900",
  violation: "bg-violation-500 text-white",
  warning: "bg-warning-500 text-white",
  // GovernanceConflictFlag mislabel_incident: findable, not alarming --
  // deliberately not the violation red (DESIGN-PRINCIPLES.md, Von Restorff)
  flag: "bg-flag-100 text-flag-600",
  success: "bg-success-50 text-success-500",
  neutral: "bg-ink-100 text-ink-700",
};

export function Badge({
  tone = "neutral",
  className,
  dot,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "self-declared" ? "bg-ink-900" : "bg-current",
          )}
        />
      )}
      {props.children}
    </span>
  );
}
