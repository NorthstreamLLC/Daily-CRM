"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ActivityDay } from "@/lib/stats";
import { cn } from "@/components/ui";

type Kind = "leads" | "contacts" | "vip" | "deposits";

type OpenCell = { day: string; userId: string; kind: Kind };

type ActivityPlayer = {
  player_id: string;
  reference: string;
  handle: string;
  status: string;
  source: string | null;
  occurred_at: string;
};

const RANGES = [7, 14, 30, 90];

/**
 * A day per rep, newest first.
 *
 * Deliberately a table and not a stream of "Tuna contacted DerusXBT". At
 * thirteen reps a per-event feed is several hundred lines a day, which is a
 * thing you scroll past rather than read. The question being asked is "did
 * everyone work yesterday", and that is a shape, not a narrative.
 */
export function ActivityTable({
  rows,
  days,
  isAdmin,
}: {
  rows: ActivityDay[];
  days: number;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [rep, setRep] = useState<string>("");

  /* Which cell is open, and what came back. Fetched on click rather than sent
     with the page: thirteen reps times fourteen days times four kinds is
     hundreds of lists, nearly all of which nobody opens. */
  const [open, setOpen] = useState<OpenCell | null>(null);
  const [players, setPlayers] = useState<ActivityPlayer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleCell(day: string, userId: string, kind: Kind, count: number) {
    if (count === 0) return;

    // Clicking the open one closes it.
    if (open && open.day === day && open.userId === userId && open.kind === kind) {
      setOpen(null);
      setPlayers(null);
      return;
    }

    setOpen({ day, userId, kind });
    setPlayers(null);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/activity?day=${day}&user=${userId}&kind=${kind}`,
        { cache: "no-store" }
      );
      const body = await res.json();
      if (body.error) setError(body.error);
      else setPlayers(body.players as ActivityPlayer[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const reps = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) seen.set(r.userId, r.userName);
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [rows]);

  const visible = rep ? rows.filter((r) => r.userId === rep) : rows;

  /* Grouped by day so each date is a heading rather than repeating down a
     column. A manager reads this by day - "yesterday, who did what" - not by
     rep, and a repeated date on twelve consecutive rows is noise. */
  const byDay = useMemo(() => {
    const map = new Map<string, ActivityDay[]>();
    for (const r of visible) {
      const list = map.get(r.day) ?? [];
      list.push(r);
      map.set(r.day, list);
    }
    return Array.from(map, ([day, entries]) => ({
      day,
      entries: entries.sort((a, b) => b.total - a.total),
      leads: entries.reduce((n, e) => n + e.leads, 0),
      contacts: entries.reduce((n, e) => n + e.contacts, 0),
      vip: entries.reduce((n, e) => n + e.vipTransfers, 0),
      deposits: entries.reduce((n, e) => n + e.deposits, 0),
    }));
  }, [visible]);

  function setDays(next: number) {
    const sp = new URLSearchParams(params.toString());
    sp.set("days", String(next));
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  const pretty = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(iso + "T12:00:00Z"));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-control border border-line-strong p-0.5">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                "rounded px-3 py-1 text-small font-medium",
                d === days
                  ? "bg-accent text-white btn-on-accent"
                  : "text-ink-muted hover:bg-sunken hover:text-ink"
              )}
            >
              {d} days
            </button>
          ))}
        </div>

        {isAdmin && reps.length > 1 && (
          <select
            value={rep}
            onChange={(e) => setRep(e.target.value)}
            aria-label="Filter by rep"
            className="h-8 rounded-control border border-line-strong bg-surface px-2
                       text-small text-ink outline-none focus:border-accent"
          >
            <option value="">Everyone</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {byDay.length === 0 ? (
        <p className="rounded-card border border-line bg-surface px-4 py-10 text-center text-small text-ink-muted">
          Nothing logged in the last {days} days.
        </p>
      ) : (
        <div className="space-y-4">
          {byDay.map((d) => (
            <div
              key={d.day}
              className="overflow-hidden rounded-card border border-line-strong bg-surface shadow-card"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-sunken px-4 py-2">
                <h2 className="text-body font-semibold text-ink">{pretty(d.day)}</h2>
                <p className="text-caption text-ink-muted">
                  <span className="tabular font-medium text-ink">{d.leads}</span>{" "}
                  leads
                  <span className="mx-1.5 text-ink-subtle">·</span>
                  <span className="tabular font-medium text-ink">{d.contacts}</span>{" "}
                  daily tasks
                  <span className="mx-1.5 text-ink-subtle">·</span>
                  <span className="tabular font-medium text-ink">{d.vip}</span> VIP
                  <span className="mx-1.5 text-ink-subtle">·</span>
                  <span className="tabular font-medium text-ink">{d.deposits}</span>{" "}
                  deposits
                </p>
              </div>

              <table className="w-full min-w-[520px] text-left">
                <thead>
                  <tr className="border-b border-line">
                    <Th>Rep</Th>
                    {/* The team's own words. Ticking a row on Today IS
                        completing a daily task, so calling it a "contact"
                        here made people translate between the page they work
                        on and the page they are measured by. A lead is a new
                        person; a daily task is one tick, and the same person
                        can be worked every week for a year. */}
                    <Th align="right">New leads</Th>
                    <Th align="right">Daily tasks</Th>
                    <Th align="right">VIP transfers</Th>
                    <Th align="right">Deposits</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.entries.flatMap((e, i) => [
                    <tr
                      key={e.userId}
                      className={cn(
                        "border-b border-line last:border-0",
                        i % 2 === 1 && "bg-sunken/35"
                      )}
                    >
                      <td className="px-4 py-2 text-body font-medium text-ink">
                        {e.userName}
                      </td>
                      <Num
                        value={e.leads}
                        onClick={() => toggleCell(d.day, e.userId, "leads", e.leads)}
                        open={isOpen(open, d.day, e.userId, "leads")}
                      />
                      <Num
                        value={e.contacts}
                        onClick={() => toggleCell(d.day, e.userId, "contacts", e.contacts)}
                        open={isOpen(open, d.day, e.userId, "contacts")}
                      />
                      <Num
                        value={e.vipTransfers}
                        onClick={() => toggleCell(d.day, e.userId, "vip", e.vipTransfers)}
                        open={isOpen(open, d.day, e.userId, "vip")}
                      />
                      <Num
                        value={e.deposits}
                        onClick={() => toggleCell(d.day, e.userId, "deposits", e.deposits)}
                        open={isOpen(open, d.day, e.userId, "deposits")}
                      />
                    </tr>,
                    isOpen(open, d.day, e.userId) && (
                      <tr key={`${e.userId}-open`} className="bg-accent-soft/20">
                        <td colSpan={5} className="px-4 py-3">
                          {loading && (
                            <p className="text-small text-ink-muted">Loading…</p>
                          )}
                          {error && <p className="text-small text-danger">{error}</p>}
                          {players && players.length === 0 && (
                            <p className="text-small text-ink-muted">
                              Nothing to show.
                            </p>
                          )}
                          {players && players.length > 0 && (
                            <ul className="flex flex-wrap gap-x-4 gap-y-1">
                              {players.map((pl) => (
                                <li key={pl.player_id + pl.occurred_at}>
                                  {/* Straight to them in the Book. The point of
                                      opening a number is usually to go and look
                                      at one of the names inside it. */}
                                  <Link
                                    href={`/book?q=${encodeURIComponent(pl.reference)}`}
                                    className="text-small text-ink hover:text-accent hover:underline"
                                  >
                                    {pl.handle}
                                    <span className="tabular ml-1.5 text-caption text-ink-subtle">
                                      {pl.reference}
                                    </span>
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ),
                  ])}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <th
      className={cn(
        "px-4 py-2 text-label font-semibold uppercase tracking-wide text-ink-subtle",
        align === "right" && "text-right"
      )}
    >
      {children}
    </th>
  );
}

/** Is this cell - or any cell on this row - the open one? */
function isOpen(
  open: OpenCell | null,
  day: string,
  userId: string,
  kind?: Kind
): boolean {
  if (!open || open.day !== day || open.userId !== userId) return false;
  return kind === undefined || open.kind === kind;
}

/* A zero is greyed rather than bold, and is not clickable - opening it would
   show an empty list, which is a worse answer than the number already gave.
   Anything above zero is a button, because the question after "fourteen" is
   almost always "which fourteen". */
function Num({
  value,
  onClick,
  open,
}: {
  value: number;
  onClick: () => void;
  open: boolean;
}) {
  if (value === 0) {
    return (
      <td className="tabular px-4 py-2 text-right text-small text-ink-subtle">0</td>
    );
  }

  return (
    <td className="px-4 py-2 text-right">
      <button
        type="button"
        onClick={onClick}
        aria-expanded={open}
        className={cn(
          "tabular rounded px-2 py-0.5 text-small font-medium",
          open
            ? "bg-accent text-white btn-on-accent"
            : "text-ink hover:bg-accent-soft hover:text-accent"
        )}
      >
        {value}
      </button>
    </td>
  );
}
