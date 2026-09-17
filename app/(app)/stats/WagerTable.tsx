"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/components/ui";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { CopyHandle } from "../CopyHandle";

/**
 * The wager table, paged.
 *
 * It used to render the top 25 and say "the export has every row", which is a
 * reasonable thing to say and a useless thing to do: seeing the 26th player
 * meant downloading a spreadsheet. Now that the table also lists players who
 * have gone quiet, the tail is where the useful names are - the ones who
 * deposited and stopped sit at the bottom by definition, because they are
 * sorted by money and they have none this month.
 *
 * Paged in the browser rather than the URL. Every row is already on the page -
 * the report fetches the whole book in one call - so a page turn is a slice of
 * an array, not a round trip to the server and back through eight other
 * queries that have not changed.
 *
 * Deliberately the same control as the wager trend table on the admin page:
 * count on the left, arrows and "2 / 3" on the right. Two pagers that behave
 * differently in one app is a small tax paid on every single use.
 */

const PER_PAGE = 25;

/** Structural, not imported from lib/admin.
 *
 *  lib/admin reaches next/headers, and a client component that pulls a VALUE
 *  across that line fails at `next build` while passing `tsc` cleanly - which
 *  has cost this project a deploy already. A local shape cannot do that, and
 *  CycleRow satisfies it structurally, so the compiler still checks the call. */
type Row = {
  username: string;
  monthWagered: number;
  cycleWagered: number;
  playerId: string | null;
  reference: string | null;
  handle: string | null;
  status: string | null;
  allTime: number;
  neverWagered: boolean;
};

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function WagerTable({
  rows,
  monthLabel,
  cycleLabel,
  owner,
}: {
  rows: Row[];
  monthLabel: string;
  /** "16 Aug – 15 Sep", written out so the column says which days it covers. */
  cycleLabel: string;
  /* Carried onto the Book link when an admin is viewing someone else's stats,
     so the link lands in THEIR book rather than the admin's own.

     A string, not a function that builds the href. Props cross the server to
     client boundary by serialisation, and a function does not survive that -
     it fails at run time, not at type check. */
  owner?: string;
}) {
  const [page, setPage] = useState(1);

  const flagged = rows.filter((r) => r.neverWagered).length;

  const bookHref = (reference: string) =>
    `/book?${new URLSearchParams({
      q: reference,
      ...(owner ? { owner } : {}),
    }).toString()}`;

  const pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const from = (current - 1) * PER_PAGE;
  const shown = rows.slice(from, from + PER_PAGE);

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      {/* Said above the table as well as on the row. With paging, a count the
          reader has to go looking for is a count they will not find - and
          these sort to the top precisely so they are on the first page. */}
      {flagged > 0 && (
        <p className="border-b border-line bg-danger-soft px-4 py-2.5 text-small text-ink">
          <span className="font-medium">
            {flagged} player{flagged === 1 ? " is" : "s are"} marked as playing but
            {flagged === 1 ? " has" : " have"} never wagered.
          </span>{" "}
          Check the Roobet username on their profile — or whether they really signed
          up on your code. Listed first below.
        </p>
      )}

      {/* Six columns is more than a phone has room for. Scrolling the table
          sideways beats squeezing a dollar figure onto two lines or dropping a
          column nobody asked to lose. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-left">
          <thead>
            <tr className="border-b border-line bg-sunken">
              <Th>Player</Th>
              <Th>Roobet username</Th>
              <Th>Status</Th>
              <Th align="right">{monthLabel}</Th>
              <Th align="right">
                Leaderboard
                <span className="block font-normal normal-case tracking-normal text-ink-subtle">
                  {cycleLabel}
                </span>
              </Th>
              <Th align="right">All time</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              /* Has history, nothing in either window. Marked rather than left
                 to be inferred from two zeroes - this is the retargeting
                 signal, and it is the whole reason the row is here at all. */
              const quiet =
                r.monthWagered === 0 && r.cycleWagered === 0 && r.allTime > 0;

              return (
                <tr key={r.username} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-ink">{r.handle ?? "—"}</span>
                    {/* The reference is the way back to the record. This table
                        can tell you someone wagered $110,000 and until now the
                        only route to their profile was retyping a code you
                        were already looking at. */}
                    {r.reference && (
                      <Link
                        href={bookHref(r.reference)}
                        title={`Open ${r.handle ?? r.username} in the Book`}
                        className="tabular ml-2 text-caption text-accent underline-offset-2 hover:underline"
                      >
                        {r.reference}
                      </Link>
                    )}
                  </td>
                  {/* Its own column, click-to-copy. This is the name that gets
                      pasted into Roobet's panel and the name a rep recognises;
                      the handle is a Discord name they may never have read. */}
                  <td className="px-4 py-2.5">
                    <CopyHandle
                      handle={r.username}
                      tone="accent"
                      label={`Copy the Roobet username ${r.username}`}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-small text-ink-muted">
                    {r.status}
                    {/* THE CONTRADICTION, said out loud.

                        Marked as playing and Roobet has never reported them.
                        A player may tell a rep they are wagering to unlock a
                        bonus when they are not, or may have signed up without
                        the rep's code - either way the rep keeps working a
                        relationship on money that is not there. This is the
                        only row on the page worth interrupting for, so it
                        gets the stronger colour and sorts to the top. */}
                    {r.neverWagered && (
                      <span
                        className="ml-2 rounded-full bg-danger-soft px-1.5 py-0.5 text-caption font-medium text-danger"
                        title="Marked as playing, but Roobet has never reported this username. Check the Roobet username on their profile, or whether they actually signed up on your code."
                      >
                        not wagered
                      </span>
                    )}
                    {quiet && (
                      <span
                        className="ml-2 rounded-full bg-warning-soft px-1.5 py-0.5 text-caption font-medium text-warning"
                        title="Has wagered before, but nothing this month or this cycle."
                      >
                        quiet
                      </span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "tabular px-4 py-2.5 text-right text-body font-medium",
                      r.monthWagered > 0 ? "text-ink" : "text-ink-subtle"
                    )}
                  >
                    {money(r.monthWagered)}
                  </td>
                  <td
                    className={cn(
                      "tabular px-4 py-2.5 text-right text-body",
                      r.cycleWagered > 0 ? "text-ink" : "text-ink-subtle"
                    )}
                  >
                    {money(r.cycleWagered)}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right text-body text-ink-muted">
                    {money(r.allTime)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2">
          <span className="tabular text-caption text-ink-subtle">
            {from + 1}–{Math.min(from + PER_PAGE, rows.length)} of {rows.length} players
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(current - 1)}
              disabled={current === 1}
              aria-label="Previous page"
              className="inline-flex h-7 w-7 items-center justify-center rounded-control
                         text-ink-muted hover:bg-sunken hover:text-ink disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="tabular px-1 text-caption text-ink-muted">
              {current} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(current + 1)}
              disabled={current === pageCount}
              aria-label="Next page"
              className="inline-flex h-7 w-7 items-center justify-center rounded-control
                         text-ink-muted hover:bg-sunken hover:text-ink disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </span>
        </div>
      )}

      <p className="border-t border-line px-4 py-2.5 text-small text-ink-muted">
        Everyone with wager history is listed, plus anyone marked as playing who
        has none. <span className="text-warning">Quiet</span> means they have
        wagered before but not in either window — worth a message.{" "}
        <span className="text-danger">Not wagered</span> means Roobet has never
        reported them at all.
      </p>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2.5 text-label font-medium uppercase tracking-wide text-ink-subtle",
        align === "right" && "text-right"
      )}
    >
      {children}
    </th>
  );
}
