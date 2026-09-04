"use client";

import { cn } from "@/lib/utils";

export interface PillTab {
  key: string;
  label: string;
  count?: number;
}

/**
 * Airbnb-style filter/tab bar: horizontally scrolling pills, one active at
 * a time. Used for the agenda taxonomy's category chunking (Miller's Law:
 * 4 categories, not a flat list of every topic_key) and for committee-scoped
 * filtering (Persona 4/11, FR-23).
 */
export function PillTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: PillTab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-ring",
              isActive
                ? "border-ink-900 bg-ink-900 text-white"
                : "border-ink-200 bg-white text-ink-700 hover:border-ink-900",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  isActive ? "bg-white/20" : "bg-ink-100",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
