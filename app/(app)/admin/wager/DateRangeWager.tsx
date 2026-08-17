"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Input, Notice, cn } from "@/components/ui";

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

type Row = {
  username: string;
  wagered: number;
  sources: string;
  playerId: string | null;
  handle: string | null;
  reference: string | null;
  ownerName: string | null;
  status: string | null;
};

type Result = {
  from: string;
  to: string;
  rows: Row[];
  truncated: boolean;
  wagerers: number;
  total: number;
  claimed: number;
  unclaimed: number;
  failed: string[];
  error?: string;
};

/**
 * Wager between any two dates.
 *
 * Every other figure on this page reads a stored fact for a whole UTC period.
 * An arbitrary range has no stored answer, so this asks Roobet directly for
 * the window - a live question with a live answer.
 *
 * That means it takes a few seconds and it is a deliberate action rather than
 * something that happens on page load. Five leaderboards, one request each.
 */
export function DateRangeWager() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      setResult(null);
      try {
        const response = await fetch("/api/wager-range", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from, to }),
        });
        setResult(await response.json());
      } catch (e) {
        setResult({
          error: (e as Error).message,
        } as Result);
      }
    });
  }

  return (
    <div className="rounded-card border border-line-strong bg-surface shadow-card">
      <div className="flex flex-wrap items-end gap-3 border-b-2 border-line-heavy px-4 py-3">
        <label className="block">
          <span className="mb-1 block text-label font-medium text-ink-muted">From</span>
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="w-auto"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-label font-medium text-ink-muted">To</span>
          <Input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            className="w-auto"
          />
        </label>

        <Button variant="primary" loading={pending} onClick={run}>
          {pending ? "Asking Roobet…" : "Get wager"}
        </Button>

        <span className="text-caption text-ink-subtle">
          Both dates included, UTC. Asks Roobet live, so it takes a few seconds.
        </span>
      </div>

      {result?.error && (
        <div className="p-4">
          <Notice tone="danger">{result.error}</Notice>
        </div>
      )}

      {result && !result.error && (
        <>
          <div className="grid gap-3 border-b border-line-strong p-4 sm:grid-cols-3">
            <Figure label={`${result.from} to ${result.to}`} value={money(result.total)} emphasis />
            <Figure label="In a rep's book" value={money(result.claimed)} />
            <Figure
              label="No owner"
              value={money(result.unclaimed)}
              sub={`${result.wagerers.toLocaleString()} wagerers`}
            />
          </div>

          {result.failed.length > 0 && (
            <div className="px-4 pt-3">
              <Notice tone="warning">
                Some codes did not answer, so this total is incomplete:{" "}
                {result.failed.join("; ")}
              </Notice>
            </div>
          )}

          {result.rows.length === 0 ? (
            <p className="px-4 py-6 text-body text-ink-muted">
              Nothing wagered on any code in that window.
            </p>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full min-w-[680px] text-left">
                <thead>
                  <tr className="border-b border-line-heavy bg-sunken">
                    <Th className="w-10">#</Th>
                    <Th>Roobet username</Th>
                    <Th>Player</Th>
                    <Th>Rep</Th>
                    <Th>Code</Th>
                    <Th align="right">Wagered</Th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
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
                      </td>
                      <td className="px-4 py-2 text-small text-ink-muted">
                        {r.ownerName ?? "Unclaimed"}
                      </td>
                      <td className="px-4 py-2 text-small text-ink-subtle">{r.sources}</td>
                      <td className="tabular px-4 py-2 text-right text-body font-semibold text-ink">
                        {money(r.wagered)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {result.truncated && (
                <p className="border-t border-line-strong px-4 py-2.5 text-small text-ink-muted">
                  Showing the top 500 of {result.wagerers.toLocaleString()}.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-label font-medium uppercase tracking-wide text-ink-subtle">
        {label}
      </p>
      <p
        className={cn(
          "tabular mt-1 text-metric font-semibold",
          emphasis ? "text-accent" : "text-ink"
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-caption text-ink-subtle">{sub}</p>}
    </div>
  );
}

function Th({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2 text-label font-medium uppercase tracking-wide text-ink-subtle",
        align === "right" && "text-right",
        className
      )}
    >
      {children}
    </th>
  );
}
