"use client";

import { useState } from "react";
import Link from "next/link";
import { AgendaItem, Meeting } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ArrowLeftIcon, CheckIcon, MicIcon, PhoneOffIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

type VoteValue = "for" | "against" | "abstain" | "recused";

/**
 * Meeting room (live). Full-screen takeover, not nested navigation
 * (ARCHITECTURE.md Section 2) -- the fixed inset-0 overlay below covers the
 * sidebar/topbar it's technically still mounted under. DESIGN-PRINCIPLES.md
 * decisions applied directly here:
 * - Fitt's Law + Doherty Threshold: vote buttons are the single largest,
 *   closest target on screen, and confirming feels instant -- this is the
 *   one screen where perceived latency has evidentiary stakes (the vote's
 *   server timestamp feeds the audit-hash-chain, ARCHITECTURE.md Section 8).
 * - Law of Proximity: the vote panel sits directly under the agenda item
 *   being discussed, not in a separate fixed panel shared across items.
 * - Peak-End Rule: this is bord's named peak moment (ARCHITECTURE.md
 *   Section 2); the roll-call fallback stays reachable but doesn't compete
 *   visually with the primary path.
 */
export function RoomClient({
  meeting,
  items,
  capacityPath,
}: {
  meeting: Meeting;
  items: AgendaItem[];
  capacityPath: string;
}) {
  const votable = items.filter((i) => i.requiresVote);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pendingVote, setPendingVote] = useState<VoteValue | null>(null);
  const [cast, setCast] = useState<Record<string, VoteValue>>({});
  const [rollCall, setRollCall] = useState(false);

  const activeItem = votable[activeIndex];
  const isCast = activeItem && cast[activeItem.id];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-900 text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <Link
          href={`/${capacityPath}/home`}
          className="flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white"
        >
          <ArrowLeftIcon width={16} height={16} /> Leave
        </Link>
        <div className="text-center">
          <p className="text-sm font-bold">{meeting.title}</p>
          <p className="text-xs text-white/50">Live</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold">
          <span className="h-2 w-2 rounded-full bg-success-500" />
          Quorum {meeting.quorumPresent}/{meeting.quorumRequired}
        </div>
      </header>

      {rollCall && (
        <div className="bg-warning-500 px-6 py-2 text-center text-sm font-semibold text-white">
          Manual roll-call mode -- video unavailable, quorum captured manually.{" "}
          <button className="underline" onClick={() => setRollCall(false)}>
            Video restored
          </button>
        </div>
      )}

      <main className="flex flex-1 flex-col items-center justify-center px-6">
        {!activeItem ? (
          <p className="text-white/60">No voting items on this agenda.</p>
        ) : (
          <div className="w-full max-w-xl">
            <div className="mb-6 flex items-center justify-center gap-2">
              {votable.map((item, i) => (
                <span
                  key={item.id}
                  className={cn(
                    "h-1.5 w-8 rounded-full",
                    i === activeIndex ? "bg-brand-500" : cast[item.id] ? "bg-white/40" : "bg-white/15",
                  )}
                />
              ))}
            </div>

            <p className="text-center text-xs font-bold uppercase tracking-wide text-white/50">
              Agenda item {activeIndex + 1} of {votable.length}
            </p>
            <h1 className="mt-2 text-center text-2xl font-extrabold">{activeItem.title}</h1>
            <p className="mt-2 text-center text-white/60">{activeItem.votingThreshold}</p>

            <div className="mt-10">
              {isCast ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-500">
                    <CheckIcon width={28} height={28} />
                  </div>
                  <p className="font-bold">Vote recorded: {cast[activeItem.id]}</p>
                  {activeIndex < votable.length - 1 && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setActiveIndex((i) => i + 1);
                        setPendingVote(null);
                      }}
                    >
                      Next item
                    </Button>
                  )}
                </div>
              ) : pendingVote ? (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-center text-sm text-white/70">
                    Confirm with your authenticator code to cast: <b>{pendingVote}</b>
                  </p>
                  <input
                    autoFocus
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    className="h-14 w-48 rounded-control bg-white/10 text-center text-xl font-bold tracking-[0.4em] text-white placeholder:text-white/30 focus-ring"
                  />
                  <div className="flex gap-3">
                    <Button variant="ghost" className="text-white" onClick={() => setPendingVote(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="lg"
                      onClick={() => {
                        setCast((prev) => ({ ...prev, [activeItem.id]: pendingVote }));
                        setPendingVote(null);
                      }}
                    >
                      Confirm vote
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <Button size="lg" onClick={() => setPendingVote("for")}>
                    For
                  </Button>
                  <Button
                    size="lg"
                    variant="danger"
                    onClick={() => setPendingVote("against")}
                  >
                    Against
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    onClick={() => setPendingVote("abstain")}
                  >
                    Abstain
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    onClick={() => setPendingVote("recused")}
                  >
                    Recuse
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="flex items-center justify-between border-t border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <MicIcon />
          </button>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            onClick={() => setRollCall(true)}
            title="Video SDK unavailable -- switch to manual roll-call"
          >
            <PhoneOffIcon />
          </button>
        </div>
        {!rollCall && (
          <button
            className="text-xs font-semibold text-white/40 hover:text-white/70"
            onClick={() => setRollCall(true)}
          >
            Video trouble? Switch to manual roll-call
          </button>
        )}
      </footer>
    </div>
  );
}
