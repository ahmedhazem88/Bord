import Link from "next/link";
import { Capacity } from "@/lib/types";
import { Avatar } from "./ui/Avatar";
import { BellIcon, ChevronDownIcon } from "./ui/Icons";

/**
 * Always-visible capacity/tenant switcher (ARCHITECTURE.md Section 2), the
 * one navigation control DESIGN-PRINCIPLES.md's Jakob's Law entry treats as
 * a workspace switcher: same top-right pattern as Slack/Notion, since a
 * portfolio director (Persona 2/6) already has that muscle memory from
 * other multi-tenant SaaS tools.
 */
export function TopBar({ capacity, personName }: { capacity: Capacity; personName: string }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-ink-100 bg-surface px-6">
      <Link
        href="/capacity-switch"
        className="flex items-center gap-3 rounded-control px-2 py-1.5 transition-colors hover:bg-ink-50 focus-ring"
      >
        <div className="flex flex-col items-start leading-tight">
          <span className="text-sm font-bold text-ink-900">{capacity.companyName}</span>
          <span className="text-xs text-ink-500">
            {capacity.roleLabel}
            {capacity.isCommitteeScoped ? ` · ${capacity.committeeName}` : ""}
          </span>
        </div>
        <ChevronDownIcon className="text-ink-500" width={16} height={16} />
      </Link>

      <div className="flex items-center gap-4">
        <button aria-label="Notifications" className="relative rounded-full p-2 text-ink-700 hover:bg-ink-50 focus-ring">
          <BellIcon />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-violation-500" />
        </button>
        <Link href="/profile" className="focus-ring rounded-full">
          <Avatar name={personName} size="sm" />
        </Link>
      </div>
    </header>
  );
}
