"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Player } from "@/lib/queries";
import { Badge, Select, Textarea, Input, Button, cn } from "@/components/ui";
import { AlertTriangle, Check, MessageSquare, History, X } from "@/components/icons";
import { changeStatus, updatePlayerField } from "./actions";
import { formatDate, formatDateTime, relativeDays } from "@/lib/time";

export type StatusOption = { name: string };

/* ------------------------------------------------------------ Status select */

export function StatusSelect({
  player,
  statuses,
  size = "md",
  onChanged,
}: {
  player: Player;
  statuses: StatusOption[];
  size?: "sm" | "md";
  onChanged?: (status: string) => void;
}) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(player.status);

  return (
    <Select
      value={value}
      disabled={pending}
      aria-label={`Status for ${player.handle}`}
      className={cn(size === "sm" && "h-8 text-small", "min-w-0")}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next); // reflect the choice immediately; the refresh confirms it
        start(async () => {
          await changeStatus(player.id, next);
          onChanged?.(next);
        });
      }}
    >
      {statuses.map((s) => (
        <option key={s.name} value={s.name}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}

/* -------------------------------------------------------------- Flag badges */

export function PlayerFlags({
  player,
  attemptsThreshold,
}: {
  player: Player;
  attemptsThreshold: number;
}) {
  const readyForDead =
    player.missing_roobet && player.followup_attempts >= attemptsThreshold;

  return (
    <>
      {player.missing_roobet && (
        <Badge tone="warning">No Roobet username</Badge>
      )}
      {readyForDead && (
        <Badge tone="danger" icon={<AlertTriangle size={11} />}>
          {player.followup_attempts} attempts
        </Badge>
      )}
      {player.first_deposit_at && <Badge tone="success">Deposited</Badge>}
    </>
  );
}

/* ------------------------------------------------------- Autosaving field */

/**
 * A text field that saves when you leave it, and says so.
 *
 * Autosave without feedback is unnerving - you cannot tell whether your work
 * was kept. This shows a brief confirmation and, importantly, only writes when
 * the value actually changed.
 */
export function AutoSaveField({
  player,
  field,
  label,
  placeholder,
  multiline = false,
  hint,
}: {
  player: Player;
  field: "handle" | "source" | "roobet_username" | "notes";
  label: string;
  placeholder?: string;
  multiline?: boolean;
  hint?: string;
}) {
  const initial = (player[field] as string | null) ?? "";
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lastSaved = useRef(initial);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  function commit() {
    if (value === lastSaved.current) return;
    start(async () => {
      const res = await updatePlayerField(player.id, field, value);
      if (res?.error) {
        setError(res.error);
        setValue(lastSaved.current); // put back what was actually stored
      } else {
        setError(null);
        lastSaved.current = value;
        setSaved(true);
      }
    });
  }

  const id = `${field}-${player.id}`;
  const Control = multiline ? Textarea : Input;

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <label htmlFor={id} className="text-label font-medium text-ink-muted">
          {label}
        </label>
        {pending && <span className="text-caption text-ink-subtle">Saving…</span>}
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-caption text-success">
            <Check size={11} /> Saved
          </span>
        )}
      </div>
      <Control
        id={id}
        value={value}
        rows={multiline ? 3 : undefined}
        placeholder={placeholder}
        onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) =>
          setValue(e.target.value)
        }
        onBlur={commit}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (!multiline && e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setValue(lastSaved.current);
            (e.target as HTMLElement).blur();
          }
        }}
      />
      {hint && !error && <p className="mt-1 text-caption text-ink-subtle">{hint}</p>}
      {error && <p className="mt-1 text-caption text-danger">{error}</p>}
    </div>
  );
}

/* ----------------------------------------------------------- Detail panel */

const EVENT_LABEL: Record<string, string> = {
  player_created: "Added to book",
  task_completed: "Contacted",
  status_change: "Status changed",
  note_added: "Note updated",
  outreach: "Outreach",
  vip_fasttrack_checkin: "VIP check-in",
  vip_team_checkin: "VIP team check-in",
  import: "Imported",
};

export type TimelineEvent = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  occurred_at: string;
};

/**
 * The expanded editor for one player: every field, plus the full history.
 *
 * Used by both the queue and the Book, so a player is edited the same way
 * wherever you happen to find them.
 */
export function PlayerDetail({
  player,
  timezone,
  onClose,
}: {
  player: Player;
  timezone: string;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<"details" | "history">("details");
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadHistory() {
    setTab("history");
    if (events) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/timeline/${player.id}`, { cache: "no-store" });
      setEvents(res.ok ? await res.json() : []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-line bg-sunken/60">
      <div className="flex items-center gap-1 border-b border-line px-3 pt-2">
        <TabButton active={tab === "details"} onClick={() => setTab("details")}>
          <MessageSquare size={13} /> Details &amp; notes
        </TabButton>
        <TabButton active={tab === "history"} onClick={loadHistory}>
          <History size={13} /> History
        </TabButton>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="ml-auto mb-1 inline-flex h-7 w-7 items-center justify-center
                       rounded-control text-ink-subtle hover:bg-sunken hover:text-ink"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {tab === "details" ? (
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <AutoSaveField
            player={player}
            field="roobet_username"
            label="Roobet username"
            placeholder="Not signed up yet"
            hint="Filling this in stops them resurfacing every day and resets attempts."
          />
          <AutoSaveField
            player={player}
            field="handle"
            label="Player handle"
            placeholder="their username"
          />
          <div className="sm:col-span-2">
            <AutoSaveField
              player={player}
              field="notes"
              label="Notes"
              multiline
              placeholder="What was said, what they need, anything worth remembering."
            />
          </div>
          <dl className="sm:col-span-2 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line pt-3 text-small sm:grid-cols-4">
            <Meta label="Reference" value={player.reference} />
            <Meta label="Source" value={player.source ?? "—"} />
            <Meta label="Added" value={formatDate(player.assigned_at, timezone)} />
            <Meta
              label="Attempts"
              value={player.followup_attempts ? String(player.followup_attempts) : "0"}
            />
          </dl>
        </div>
      ) : (
        <div className="p-4">
          {loading && <p className="text-small text-ink-muted">Loading history…</p>}
          {!loading && events && events.length === 0 && (
            <p className="text-small text-ink-muted">
              Nothing recorded yet beyond adding them.
            </p>
          )}
          {!loading && events && events.length > 0 && (
            <ol className="space-y-0">
              {events.map((e, i) => (
                <li key={e.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
                    {i < events.length - 1 && <span className="w-px flex-1 bg-line" />}
                  </div>
                  <div className="pb-3">
                    <p className="text-small text-ink">
                      {EVENT_LABEL[e.event_type] ?? e.event_type}
                      {e.from_status && e.to_status && (
                        <span className="text-ink-muted">
                          {" "}
                          — {e.from_status} → {e.to_status}
                        </span>
                      )}
                      {!e.from_status && e.to_status && (
                        <span className="text-ink-muted"> — {e.to_status}</span>
                      )}
                    </p>
                    <p className="text-caption text-ink-subtle">
                      {formatDateTime(e.occurred_at, timezone)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      className={cn(
        "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-small font-medium",
        "transition-colors duration-fast",
        active
          ? "border-accent text-accent"
          : "border-transparent text-ink-muted hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-ink-subtle">{label}</dt>
      <dd className="text-small text-ink">{value}</dd>
    </div>
  );
}

/* ---------------------------------------------------------------- Due label */

export function DueLabel({
  player,
  timezone,
  overdueHours,
}: {
  player: Player;
  timezone: string;
  overdueHours: number;
}) {
  const due = relativeDays(player.next_followup_at, timezone);
  if (!due) return <span className="text-ink-subtle">—</span>;

  const hoursLate = player.next_followup_at
    ? (Date.now() - new Date(player.next_followup_at).getTime()) / 3_600_000
    : 0;
  const veryLate = hoursLate >= overdueHours;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-small",
        veryLate ? "font-medium text-danger" : due.days > 0 ? "text-warning" : "text-ink-muted"
      )}
    >
      {veryLate && <AlertTriangle size={12} />}
      {due.label}
    </span>
  );
}

export { formatDate };
export { Button };
