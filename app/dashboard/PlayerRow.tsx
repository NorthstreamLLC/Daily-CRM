"use client";

import { useState, useTransition } from "react";
import type { Player } from "@/lib/queries";
import { completeTask, changeStatus, saveNotes, saveRoobetUsername } from "./actions";
import { formatDate, relativeDays } from "@/lib/time";

export function PlayerRow({
  player,
  statuses,
  timezone,
  attemptsThreshold,
  showComplete = true,
}: {
  player: Player;
  statuses: { name: string }[];
  timezone: string;
  attemptsThreshold: number;
  showComplete?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [notes, setNotes] = useState(player.notes ?? "");
  const [roobet, setRoobet] = useState(player.roobet_username ?? "");
  const [open, setOpen] = useState(false);

  const due = relativeDays(player.next_followup_at, timezone);
  const overdue = due !== null && due.days > 0;
  const readyForDead =
    player.missing_roobet && player.followup_attempts >= attemptsThreshold;

  function complete() {
    setDone(true); // disappear immediately; the refresh confirms it
    startTransition(async () => {
      await completeTask(player.id);
    });
  }

  if (done) return null;

  return (
    <div
      className={`rounded-lg border bg-white shadow-sm transition ${
        overdue ? "border-red-200" : "border-slate-200"
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        {showComplete && (
          <button
            onClick={complete}
            disabled={pending}
            title="Log that you've contacted them"
            className="mt-0.5 h-6 w-6 shrink-0 rounded border-2 border-slate-300
                       transition hover:border-navy hover:bg-navy/5 disabled:opacity-40"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium text-slate-900">{player.handle}</span>
            <span className="text-xs text-slate-400">{player.reference}</span>
            {player.source && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {player.source}
              </span>
            )}
            {player.missing_roobet && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                No Roobet username
              </span>
            )}
            {readyForDead && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                {player.followup_attempts} attempts — consider Dead Lead
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-slate-600">{player.next_action}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>
              Last contact: {formatDate(player.last_contact_at, timezone)}
            </span>
            {due && (
              <span className={overdue ? "font-medium text-red-600" : ""}>
                Due: {due.label}
              </span>
            )}
            <button
              onClick={() => setOpen(!open)}
              className="underline underline-offset-2 hover:text-navy"
            >
              {open ? "Less" : "Edit"}
            </button>
          </div>
        </div>

        <select
          value={player.status}
          disabled={pending}
          onChange={(e) =>
            startTransition(async () => {
              await changeStatus(player.id, e.target.value);
            })
          }
          className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1.5
                     text-sm outline-none focus:border-navy"
        >
          {statuses.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3">
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Roobet username
            </label>
            <div className="mt-1 flex gap-2">
              <input
                value={roobet}
                onChange={(e) => setRoobet(e.target.value)}
                placeholder="Not signed up yet"
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm
                           outline-none focus:border-navy"
              />
              <button
                onClick={() =>
                  startTransition(async () => {
                    await saveRoobetUsername(player.id, roobet);
                  })
                }
                disabled={pending}
                className="rounded-md bg-navy px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Filling this in resets their follow-up attempts and takes them off the
              daily no-username list.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() =>
                startTransition(async () => {
                  await saveNotes(player.id, notes);
                })
              }
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm
                         outline-none focus:border-navy"
            />
          </div>
        </div>
      )}
    </div>
  );
}
