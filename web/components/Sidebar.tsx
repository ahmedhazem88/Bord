"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  CalendarIcon,
  DocumentIcon,
  HomeIcon,
  PeopleIcon,
  SettingsIcon,
  ShieldIcon,
} from "./ui/Icons";

/**
 * Six top-level sections, matching ARCHITECTURE.md Section 2's navigation
 * model exactly. Deliberately not more: DESIGN-PRINCIPLES.md's Miller's Law
 * entry treats 6 as a hard ceiling for this list, so a future screen gets
 * nested under one of these rather than added as a 7th top-level item.
 */
const NAV = [
  { key: "home", label: "Home", icon: HomeIcon },
  { key: "meetings", label: "Meetings", icon: CalendarIcon },
  { key: "compliance", label: "Compliance", icon: ShieldIcon },
  { key: "documents", label: "Documents", icon: DocumentIcon },
  { key: "people", label: "People", icon: PeopleIcon },
  { key: "settings", label: "Settings", icon: SettingsIcon },
] as const;

export function Sidebar({ capacityId }: { capacityId: string }) {
  const pathname = usePathname();

  return (
    <nav className="hidden w-60 shrink-0 flex-col gap-1 border-r border-ink-100 bg-surface px-3 py-6 md:flex">
      <div className="mb-6 px-3">
        <span className="text-xl font-extrabold tracking-tight text-ink-900">bord</span>
      </div>
      {NAV.map(({ key, label, icon: Icon }) => {
        const href = `/${capacityId}/${key}`;
        const isActive = pathname?.startsWith(href) || (key === "home" && pathname === `/${capacityId}/home`);
        return (
          <Link
            key={key}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-control px-3 py-2.5 text-[15px] font-semibold transition-colors focus-ring",
              isActive ? "bg-brand-50 text-brand-700" : "text-ink-700 hover:bg-ink-50",
            )}
          >
            <Icon className={isActive ? "text-brand-600" : "text-ink-500"} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
