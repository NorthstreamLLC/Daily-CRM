"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReportRow } from "@/lib/admin";
import { cn } from "@/components/ui";
import { Search, X } from "@/components/icons";

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * EVERY WAGERER, searchable.
 *
 * Search happens here rather than on the server because the rows are already
 * loaded - the page fetches 500 and shows 100. Sending a round trip to filter
 * a list the browser is holding would be slower and would lose your place.
 *
 * Searching matches the Roobet username, the player's handle and the
 * reference, because you arrive here from three different directions: a name
 * from the affiliate panel, a name a rep used, or an MH-0042 from a message.
 */
export function WagererTable({
  rows,
  periodLabel,
  shown = 100,
}: {
  rows: ReportRow[];
  periodLabel: string;
  shown?: number;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.username.toLowerCase().includes(q) ||
        (r.handle ?? "").toLowerCase().includes(q) ||
        (r.reference ?? "").toLowerCase().includes(q) ||
        (r.ownerName ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const searching = query.trim().length > 0;
  const visible = searching ? filtered : filtered.slice(0, shown);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search username, player, rep or reference"
            aria-label="Search wagerers"
            className="h-9 w-full rounded-control border border-line-strong bg-surface pl-8 pr-8
                       text-body text-ink placeholder:text-ink-subtle outline-none
                       focus:border-accent"
            onKeyDown={(e) => {
              // Escape clears - the fastest way out of a filtered list.
              if (e.key === "Escape") setQuery("");
            }}
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center
                         justify-center rounded-full text-ink-subtle hover:bg-sunken hover:text-ink"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {searching && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="inline-flex h-9 items-center gap-1.5 rounded-control border
                       border-line-strong px-3 text-small font-medium text-ink-muted
                       hover:bg-sunken hover:text-ink"
          >
            <X size={12} />
            Clear — showing {filtered.length.toLocaleString()} of{" "}
            {rows.length.toLocaleString()}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-card border border-line bg-surface px-4 py-8 text-center text-small text-ink-muted">
          Nothing matches &ldquo;{query}&rdquo;.{" "}
          <button
            type="button"
            onClick={() => setQuery("")}
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Clear the search
          </button>
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line-strong bg-surface shadow-card no-scrollbar">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b-2 border-line-heavy bg-sunken">
                <Th className="w-10">#</Th>
                <Th>Roobet username</Th>
                <Th>Player</Th>
                <Th>Rep</Th>
                <Th>Status</Th>
                <Th align="right">{periodLabel}</Th>
                <Th align="right">All time</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr
                  key={r.username}
                  className={cn(
                    "border-b border-line-heavy last:border-0",
                    i % 2 === 1 && "bg-sunken/40"
                  )}
                >
                  <td className="tabular px-4 py-2 text-caption text-ink-subtle">
                    {i + 1}
                  </td>
                  <td className="px-4 py-2 text-body font-medium text-ink">
                    {r.playerId ? (
                      <Link
                        href={`/book?player=${r.playerId}`}
                        className="text-accent underline-offset-2 hover:underline"
                      >
                        {r.username}
                      </Link>
                    ) : (
                      r.username
                    )}
                  </td>
                  <td className="px-4 py-2 text-small text-ink-muted">
                    {r.handle ?? "—"}
                    {r.reference && (
                      <span className="tabular ml-2 text-caption text-ink-subtle">
                        {r.reference}
                      </span>
                    )}
                  </td>
                  {/* An unclaimed row is a statement of fact, not a task.
                      Assigning happens in the Book, so this says so plainly
                      rather than looking like a link that does nothing. */}
                  <td className="px-4 py-2 text-small">
                    {r.ownerName ? (
                      <span className="text-ink-muted">{r.ownerName}</span>
                    ) : (
                      <span className="text-ink-subtle">No rep</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-small text-ink-muted">
                    {r.status ?? "—"}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right text-body font-semibold text-ink">
                    {money(r.wagered)}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right text-body text-ink-subtle">
                    {money(r.allTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!searching && filtered.length > shown && (
            <p className="border-t border-line-strong px-4 py-2.5 text-small text-ink-muted">
              Showing the top {shown} of {filtered.length.toLocaleString()}. Search to
              find one, or export the CSV for every row.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align,
  className,
}: {
  children: React.ReactNode;
  align?: "right";
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-2 text-label font-semibold uppercase tracking-wide text-ink-subtle",
        align === "right" && "text-right",
        className
      )}
    >
      {children}
    </th>
  );
}
