"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Player } from "@/lib/queries";
import { Badge, cn } from "@/components/ui";
import { AlertTriangle, Check, ChevronDown, MessageSquare } from "@/components/icons";
import { completeTask, undoCompleteTask } from "../actions";
import { PlayerDetail, StatusSelect, formatDate, type StatusOption } from "../shared";
import { relativeDays } from "@/lib/time";

/**
 * One row of the daily queue.
 *
 * Deliberately quiet. The section a row sits in already says whether it is
 * overdue, so the row itself does not repeat it in colour, a badge and a date
 * column - it carries the name, what to do, and the controls to do it.
 *
 * Completing a row removes it immediately and offers an undo. Waiting for a
 * round trip before anything moves is what made the spreadsheet feel like it
 * had ignored the click.
 */
export function TaskRow({
  player,
  statuses,
  timezone,
  attemptsThreshold,
  overdueHours,
  dayStartMs,
  showComplete = true,
}: {
  player: Player;
  statuses: StatusOption[];
  timezone: string;
  attemptsThreshold: number;
  overdueHours: number;
  /** Midnight this morning in the viewer's zone, for the "added today" tag. */
  dayStartMs: number;
  showComplete?: boolean;
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const due = relativeDays(player.next_followup_at, timezone);
  const hoursLate = player.next_followup_at
    ? (Date.now() - new Date(player.next_followup_at).getTime()) / 3_600_000
    : 0;
  const veryLate = hoursLate >= overdueHours;
  const readyForDead =
    player.missing_roobet && player.followup_attempts >= attemptsThreshold;
  const addedToday = new Date(player.assigned_at).getTime() >= dayStartMs;

  function complete() {
    setDone(true);
    start(async () => {
      const res = await completeTask(player.id);
      if (res?.error) setDone(false);
      // Ticking a row changes the counters above it. Refresh so the page never
      // shows a completed task alongside a stat that has not moved.
      else router.refresh();
    });
  }

  if (done) {
    return (
      <div
        role="status"
        className="flex items-center gap-3 rounded-card border border-line-heavy bg-surface
                   px-4 py-2.5 text-small text-ink-muted"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success-soft text-success">
          <Check size={12} />
        </span>
        <span>
          <span className="font-medium text-ink">{player.handle}</span> logged for today.
        </span>
        <button
          type="button"
          onClick={() => {
            setDone(false);
            start(async () => {
              await undoCompleteTask(player.id);
              router.refresh();
            });
          }}
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
        "overflow-hidden rounded-card border bg-surface transition-colors duration-fast",
        open ? "border-accent/60" : "border-line-heavy hover:border-ink-subtle"
      )}
    >
      <div
        className={cn(
          "grid gap-x-4 gap-y-2 px-3 py-3 sm:px-4",
          // Phone: the tick, then everything stacked beside it.
          "grid-cols-[auto_minmax(0,1fr)]",
          // Desktop: name, what to do, last contact, status, notes.
          "lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.15fr)_96px_180px_auto] lg:items-center"
        )}
      >
        {showComplete ? (
          <button
            type="button"
            onClick={complete}
            disabled={pending}
            aria-label={`Log contact with ${player.handle}`}
            title="Log that you've contacted them"
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md
                       border-2 border-line-strong text-transparent transition-colors
                       duration-fast hover:border-accent hover:bg-accent-soft
                       hover:text-accent disabled:opacity-40"
          >
            <Check size={14} />
          </button>
        ) : (
          <span className="h-[26px] w-[26px] shrink-0" aria-hidden="true" />
        )}

        {/* Identity. Reference, source and due date sit quietly underneath. */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-medium text-ink">{player.handle}</span>
            {addedToday && <Badge tone="accent">Added today</Badge>}
            {player.missing_roobet && (
              <Badge tone="warning">No username</Badge>
            )}
            {readyForDead && (
              <Badge tone="danger" icon={<AlertTriangle size={10} />}>
                {player.followup_attempts} attempts
              </Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-caption text-ink-subtle">
            <span className="tabular">{player.reference}</span>
            {player.source && ` · ${player.source}`}
            {due && (
              <span className={cn(veryLate && "font-medium text-danger")}>
                {" · "}
                {due.days > 0 ? `Due ${due.label.toLowerCase()}` : due.label}
              </span>
            )}
          </p>
        </div>

        {/* What to do. Hidden on phones, where the detail panel carries it. */}
        <p className="hidden min-w-0 truncate text-small text-ink-muted lg:block">
          {player.next_action}
        </p>

        <div className="hidden lg:block">
          <p className="text-caption text-ink-subtle">Last contact</p>
          <p className="tabular text-small text-ink">
            {formatDate(player.last_contact_at, timezone)}
          </p>
        </div>

        {/* Controls in one cell, so layout never depends on auto-placement. */}
        <div className="col-start-2 flex items-center gap-2 lg:col-start-auto">
          <div className="min-w-0 flex-1 lg:flex-none">
            <StatusSelect player={player} statuses={statuses} size="sm" />
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={
              open ? `Hide details for ${player.handle}` : `Notes and details for ${player.handle}`
            }
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control",
              "transition-colors duration-fast",
              open
                ? "bg-accent text-white btn-on-accent"
                : player.notes
                ? "text-accent hover:bg-accent-soft"
                : "text-ink-subtle hover:bg-sunken hover:text-ink"
            )}
          >
            {player.notes ? <MessageSquare size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>

        {/* Phone only: what the desktop columns carry. */}
        <p className="col-start-2 -mt-1 truncate text-caption text-ink-subtle lg:hidden">
          {player.next_action}
        </p>
      </div>

      {open && (
        <PlayerDetail player={player} timezone={timezone} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
