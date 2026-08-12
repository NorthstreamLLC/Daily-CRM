"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Player } from "@/lib/queries";
import { Badge, Select, Textarea, Input, Button, cn } from "@/components/ui";
import { AlertTriangle, Check, MessageSquare, History, X } from "@/components/icons";
import {
  changeStatus,
  refreshPlayerWager,
  reverseFirstDeposit,
  setVipWatch,
  updatePlayerField,
} from "./actions";
import { formatDate, formatDateTime, relativeDays } from "@/lib/time";

export type StatusOption = { name: string };

/* ------------------------------------------------------------ Status select */

/** Colour by stage, so a long book can be scanned without reading every word. */
const STATUS_TONE: Record<string, string> = {
  "Initial Contact": "border-line-strong",
  "VIP Transferred": "border-accent/50 bg-accent-soft/50 text-accent",
  "First Deposit": "border-success/40 bg-success-soft/60 text-success",
  Active: "border-success/40 bg-success-soft/60 text-success",
  "Reactivation Queue": "border-warning/40 bg-warning-soft/60 text-warning",
  "Potential Lead": "border-line-strong",
  "Dead Lead": "border-line-strong bg-sunken text-ink-subtle",
};

export function StatusSelect({
  player,
  statuses,
  size = "md",
  disabled = false,
  onChanged,
}: {
  player: Player;
  statuses: StatusOption[];
  size?: "sm" | "md";
  disabled?: boolean;
  onChanged?: (status: string) => void;
}) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(player.status);
  const router = useRouter();

  // The server may have changed it (the wager sync moves players to Active),
  // so follow the incoming value rather than trusting local state forever.
  useEffect(() => setValue(player.status), [player.status]);

  return (
    <Select
      value={value}
      disabled={pending || disabled}
      aria-label={`Status for ${player.handle}`}
      className={cn(
        size === "sm" && "h-8 text-small",
        "min-w-0 font-medium",
        STATUS_TONE[value] ?? "border-line-strong"
      )}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next); // reflect the choice immediately; the refresh confirms it
        start(async () => {
          await changeStatus(player.id, next);
          /* Without this the row updates but the stat cards, the queue and the
             calendar keep yesterday's numbers until a manual reload - the page
             quietly disagreeing with itself. */
          router.refresh();
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
  const [note, setNote] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
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
        // Saving a Roobet username reports what it matched on the codes.
        setWarning(res?.warning ?? null);
        setNote(
          res?.message && res.message !== "Saved." ? res.message.replace(/^Saved\.\s*/, "") : null
        );
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
      {hint && !error && !note && !warning && (
        <p className="mt-1 text-caption text-ink-subtle">{hint}</p>
      )}
      {error && <p className="mt-1 text-caption text-danger">{error}</p>}
      {note && (
        <p className="mt-1 inline-flex items-start gap-1 text-caption font-medium text-success">
          <Check size={11} className="mt-0.5 shrink-0" />
          {note}
        </p>
      )}
      {warning && (
        <p className="mt-1 inline-flex items-start gap-1 text-caption text-warning">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          {warning}
        </p>
      )}
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
          <dl className="sm:col-span-2 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line pt-3 text-small sm:grid-cols-5">
            <Meta label="Reference" value={player.reference} />
            <Meta label="Source" value={player.source ?? "—"} />
            <Meta label="Added" value={formatDate(player.assigned_at, timezone)} />
            <Meta
              label="Attempts"
              value={player.followup_attempts ? String(player.followup_attempts) : "0"}
            />
            <Meta
              label="Wagered"
              value={
                player.weighted_wager && Number(player.weighted_wager) > 0
                  ? `$${Number(player.weighted_wager).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}`
                  : "—"
              }
            />
          </dl>

          <div className="sm:col-span-2">
            <PlayerCorrections player={player} />
          </div>
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

/**
 * Two corrections that need a deliberate action rather than a side effect.
 *
 * Re-checking wager matters after a backfill - the ledger gains history the
 * player does not have yet. Reversing a deposit matters because the stamp is
 * permanent by design, so undoing a mistake has to be explicit.
 */
function PlayerCorrections({ player }: { player: Player }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ message?: string; warning?: string; error?: string } | null>(
    null
  );
  const [confirming, setConfirming] = useState(false);
  const [watching, setWatching] = useState(false);
  const router = useRouter();

  return (
    <div className="border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Any player can be watched, not only ones detection has flagged -
            that is the whole point of a manual list. */}
        <Button
          size="sm"
          loading={pending}
          onClick={() =>
            start(async () => {
              const next = !watching;
              const res = await setVipWatch(player.id, next);
              setResult(res);
              if (!res.error) {
                setWatching(next);
                router.refresh();
              }
            })
          }
        >
          {watching ? "Stop watching" : "Watch for drop-off"}
        </Button>

        {player.roobet_username?.trim() && (
          <Button
            size="sm"
            loading={pending}
            onClick={() =>
              start(async () => setResult(await refreshPlayerWager(player.id)))
            }
          >
            Re-check wager
          </Button>
        )}

        {player.first_deposit_at &&
          (confirming ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-caption text-ink-muted">
                Remove this deposit from the numbers?
              </span>
              <Button
                size="sm"
                variant="danger"
                loading={pending}
                onClick={() =>
                  start(async () => {
                    setResult(await reverseFirstDeposit(player.id));
                    setConfirming(false);
                  })
                }
              >
                Yes, it was a mistake
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              Not actually a deposit
            </Button>
          ))}
      </div>

      {result?.message && (
        <p className="mt-2 inline-flex items-center gap-1 text-caption text-success">
          <Check size={11} /> {result.message}
        </p>
      )}
      {result?.warning && (
        <p className="mt-2 inline-flex items-center gap-1 text-caption text-warning">
          <AlertTriangle size={11} /> {result.warning}
        </p>
      )}
      {result?.error && (
        <p className="mt-2 text-caption text-danger">{result.error}</p>
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
