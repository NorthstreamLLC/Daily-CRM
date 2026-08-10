"use client";

import { useState, useTransition } from "react";
import type { Player } from "@/lib/queries";
import { cn } from "@/components/ui";
import { Check, ChevronDown, MessageSquare } from "@/components/icons";
import { completeTask, undoCompleteTask } from "../actions";
import {
  DueLabel,
  PlayerDetail,
  PlayerFlags,
  StatusSelect,
  formatDate,
  type StatusOption,
} from "../shared";

/**
 * One row of the daily queue.
 *
 * The row is laid out as real columns on desktop so the eye can scan straight
 * down Last contact or Due, and stacks into a card on a phone. Completing a row
 * removes it optimistically and offers an undo, because the alternative -
 * waiting for a round trip before anything moves - is what made the spreadsheet
 * feel like it had ignored the click.
 */
export function TaskRow({
  player,
  statuses,
  timezone,
  attemptsThreshold,
  overdueHours,
  showComplete = true,
}: {
  player: Player;
  statuses: StatusOption[];
  timezone: string;
  attemptsThreshold: number;
  overdueHours: number;
  showComplete?: boolean;
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);

  const hoursLate = player.next_followup_at
    ? (Date.now() - new Date(player.next_followup_at).getTime()) / 3_600_000
    : 0;
  const veryLate = hoursLate >= overdueHours;

  function complete() {
    setDone(true);
    start(async () => {
      const res = await completeTask(player.id);
      if (res?.error) setDone(false);
    });
  }

  function undo() {
    setDone(false);
    start(async () => {
      await undoCompleteTask(player.id);
    });
  }

  if (done) {
    return (
      <div
        className="flex items-center gap-3 rounded-card border border-line bg-surface
                   px-4 py-2.5 text-small text-ink-muted shadow-card"
        role="status"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success-soft text-success">
          <Check size={12} />
        </span>
        <span>
          <span className="font-medium text-ink">{player.handle}</span> logged for today.
        </span>
        <button
          type="button"
          onClick={undo}
          className="ml-auto rounded-control px-2 py-1 text-small font-medium text-accent
                     underline-offset-2 hover:underline"
        >
          Undo
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border bg-surface shadow-card transition-colors duration-fast",
        veryLate ? "border-danger/35" : "border-line"
      )}
    >
      <div
        className={cn(
          "grid gap-x-4 gap-y-2.5 px-3 py-3 sm:px-4",
          // Phone: two columns - the tick, then everything stacked beside it.
          "grid-cols-[auto_minmax(0,1fr)]",
          // Desktop: real columns, so the eye can scan straight down Due.
          "lg:grid-cols-[auto_minmax(0,1.25fr)_minmax(0,1.35fr)_100px_112px_auto] lg:items-center"
        )}
      >
        {showComplete ? (
          <button
            type="button"
            onClick={complete}
            disabled={pending}
            aria-label={`Log contact with ${player.handle}`}
            title="Log that you've contacted them"
            className="group flex h-7 w-7 shrink-0 items-center justify-center rounded-md
                       border-2 border-line-strong text-transparent transition-colors
                       duration-fast hover:border-accent hover:bg-accent-soft
                       hover:text-accent disabled:opacity-40"
          >
            <Check size={14} />
          </button>
        ) : (
          <span className="h-7 w-7 shrink-0" aria-hidden="true" />
        )}

        {/* Player */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="truncate font-medium text-ink">{player.handle}</span>
            <span className="tabular text-caption text-ink-subtle">{player.reference}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {player.source && (
              <span className="text-caption text-ink-subtle">{player.source}</span>
            )}
            <PlayerFlags player={player} attemptsThreshold={attemptsThreshold} />
          </div>
        </div>

        {/* Next action - hidden on small screens, where the badges carry it */}
        <p className="hidden min-w-0 text-small text-ink-muted lg:block">
          {player.next_action}
        </p>

        {/* Last contact */}
        <div className="hidden lg:block">
          <p className="text-caption text-ink-subtle">Last contact</p>
          <p className="text-small text-ink">
            {formatDate(player.last_contact_at, timezone)}
          </p>
        </div>

        {/* Due */}
        <div className="hidden lg:block">
          <p className="text-caption text-ink-subtle">Due</p>
          <DueLabel player={player} timezone={timezone} overdueHours={overdueHours} />
        </div>

        {/* Controls - one cell, so the layout never depends on auto-placement */}
        <div className="col-start-2 flex items-center gap-2 lg:col-start-auto">
          <div className="min-w-0 flex-1 lg:w-[168px] lg:flex-none">
            <StatusSelect player={player} statuses={statuses} size="sm" />
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? `Hide details for ${player.handle}` : `Notes and details for ${player.handle}`}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1 rounded-control px-2",
              "text-small font-medium transition-colors duration-fast",
              open
                ? "bg-accent-soft text-accent"
                : player.notes
                ? "text-accent hover:bg-accent-soft"
                : "text-ink-muted hover:bg-sunken hover:text-ink"
            )}
          >
            {player.notes ? <MessageSquare size={14} /> : <ChevronDown size={14} />}
            <span className="hidden sm:inline">{open ? "Less" : "Notes"}</span>
          </button>
        </div>

        {/* Phone only: the detail the desktop columns carry */}
        <p className="col-start-2 -mt-1 text-caption text-ink-subtle lg:hidden">
          {player.next_action} · Last contact{" "}
          {formatDate(player.last_contact_at, timezone)}
        </p>
      </div>

      {open && <PlayerDetail player={player} timezone={timezone} onClose={() => setOpen(false)} />}
    </div>
  );
}
