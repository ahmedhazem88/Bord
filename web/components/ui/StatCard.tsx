import { cn } from "@/lib/utils";
import { Card } from "./Card";

export function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "violation" | "warning" | "success";
}) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-sm font-medium text-ink-500">{label}</span>
      <span
        className={cn(
          "text-2xl font-extrabold",
          tone === "default" && "text-ink-900",
          tone === "violation" && "text-violation-500",
          tone === "warning" && "text-warning-500",
          tone === "success" && "text-success-500",
        )}
      >
        {value}
      </span>
    </Card>
  );
}
