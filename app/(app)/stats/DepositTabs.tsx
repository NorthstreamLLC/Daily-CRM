"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, cn } from "@/components/ui";
import { CopyHandle } from "../CopyHandle";

/**
 * WHO DEPOSITED, in either window.
 *
 * Two tabs because there are two calendars in this business and they disagree
 * for half of every month. The calendar month is what the company reports on;
 * the leaderboard cycle, 16th to 15th, is what Roobet pays on. On the 20th, a
 * deposit from the 5th counts for one and not the other.
 *
 * A single list could only ever answer one of those, and whichever it answered
 * would be silently wrong in the other conversation - which is the same
 * mistake the wager column made when it printed the date picker's label over
 * the month's figures.
 *
 * Every row for both windows is already here; switching tabs filters an array
 * rather than asking the server again.
 */

type Row = {
  playerId: string;
  reference: string | null;
  handle: string;
  roobetUsername: string | null;
  status: string;
  depositedAt: string;
  /** Pre-formatted on the server, so the date reads the same for everyone. */
  depositedLabel: string;
  inMonth: boolean;
  inCycle: boolean;
  /** Undefined means no wager figure at all - not zero. */
  wageredMonth?: number;
  wageredCycle?: number;
};

export function DepositTabs({
  rows,
  monthLabel,
  cycleLabel,
  showWager,
  owner,
}: {
  rows: Row[];
  monthLabel: string;
  cycleLabel: string;
  /** Withholds the money column. A deposit is not a dollar figure. */
  showWager: boolean;
  /* A string rather than a function that builds the href - props cross the
     server to client boundary by serialisation, and a function does not
     survive that. It fails at run time, not at type check. */
  owner?: string;
}) {
  const [tab, setTab] = useState<"month" | "cycle">("month");

  const shown = rows.filter((r) => (tab === "month" ? r.inMonth : r.inCycle));
  const monthCount = rows.filter((r) => r.inMonth).length;
  const cycleCount = rows.filter((r) => r.inCycle).length;

  const bookHref = (reference: string) =>
    `/book?${new URLSearchParams({
      q: reference,
      ...(owner ? { owner } : {}),
    }).toString()}`;

  const money = (n: number | undefined) =>
    n === undefined ? "—" : "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      {/* The count lives on the tab rather than above it, because the two
          windows hold different numbers and a single heading count would be
          wrong for whichever tab you were not on. */}
      <div
        role="tablist"
        aria-label="Which window to count deposits in"
        className="flex gap-1 border-b border-line bg-sunken px-2 py-1.5"
      >
        <Tab
          active={tab === "month"}
          onClick={() => setTab("month")}
          label={monthLabel}
          count={monthCount}
          hint="Calendar month, in your timezone"
        />
        <Tab
          active={tab === "cycle"}
          onClick={() => setTab("cycle")}
          label="Leaderboard"
          sub={cycleLabel}
          count={cycleCount}
          hint="The 16th to the 15th, in UTC — the window Roobet pays on"
        />
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-6 text-center text-small text-ink-muted">
          No first deposits in{" "}
          {tab === "month" ? monthLabel : `the ${cycleLabel} cycle`} yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left">
            <thead>
              <tr className="border-b border-line">
                <Th>Player</Th>
                <Th>Roobet username</Th>
                <Th>Deposited</Th>
                <Th>Status</Th>
                {showWager && (
                  <Th align="right">
                    Wagered
                    <span className="block font-normal normal-case tracking-normal text-ink-subtle">
                      {tab === "month" ? monthLabel : cycleLabel}
                    </span>
                  </Th>
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => {
                const wagered = tab === "month" ? d.wageredMonth : d.wageredCycle;
                return (
                  <tr key={d.playerId} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-ink">{d.handle}</span>
                      {d.reference && (
                        <Link
                          href={bookHref(d.reference)}
                          title={`Open ${d.handle} in the Book`}
                          className="tabular ml-2 text-caption text-accent underline-offset-2 hover:underline"
                        >
                          {d.reference}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {/* A depositor with no Roobet username is the one row
                          here worth acting on: money that arrived with nothing
                          to attribute it to, and they cannot appear on any
                          wager table at all. */}
                      {d.roobetUsername ? (
                        <CopyHandle
                          handle={d.roobetUsername}
                          tone="accent"
                          label={`Copy the Roobet username ${d.roobetUsername}`}
                        />
                      ) : (
                        <Badge tone="warning">No username</Badge>
                      )}
                    </td>
                    <td className="tabular px-4 py-2.5 text-small text-ink">
                      {d.depositedLabel}
                    </td>
                    <td className="px-4 py-2.5 text-small text-ink-muted">{d.status}</td>
                    {showWager && (
                      <td
                        className={cn(
                          "tabular px-4 py-2.5 text-right text-body",
                          wagered ? "font-medium text-ink" : "text-ink-subtle"
                        )}
                      >
                        {money(wagered)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  label,
  sub,
  count,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub?: string;
  count: number;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={hint}
      className={cn(
        "rounded-control px-3 py-1.5 text-left text-small transition-colors duration-fast",
        active
          ? "bg-surface font-medium text-ink shadow-card"
          : "text-ink-muted hover:bg-surface/60 hover:text-ink"
      )}
    >
      <span className="flex items-baseline gap-2">
        {label}
        <span
          className={cn(
            "tabular text-caption",
            active ? "text-accent" : "text-ink-subtle"
          )}
        >
          {count}
        </span>
      </span>
      {sub && (
        <span className="block text-caption font-normal text-ink-subtle">{sub}</span>
      )}
    </button>
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
