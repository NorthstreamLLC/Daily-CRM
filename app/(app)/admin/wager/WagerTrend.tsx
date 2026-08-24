"use client";

import { useMemo, useState } from "react";
import type { WagerHistory, HistoryGrain } from "@/lib/admin";
import { cn } from "@/components/ui";
import { ArrowDown, ArrowUp } from "@/components/icons";

const GRAINS: { key: HistoryGrain; label: string }[] = [
  { key: "day", label: "By day" },
  { key: "week", label: "By week" },
  { key: "month", label: "By month" },
];

type SortKey = "start" | "total" | "wagerers" | "average";

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * WAGERED OVER TIME - the numbers, with the chart as a sidebar.
 *
 * The first version of this was a bar chart and nothing else, which answered
 * "is it going up" and no other question. What is actually wanted is which
 * days and which months were the good ones - and you cannot read "the third
 * Saturday was the best day this month" off forty bars, you have to sort a
 * column.
 *
 * So the table is the feature and the chart is context. Sort by total to find
 * the best periods, by date to read it as a timeline.
 */
export function WagerTrend({ history }: { history: WagerHistory }) {
  const [grain, setGrain] = useState<HistoryGrain>("day");
  const [sort, setSort] = useState<SortKey>("start");
  const [desc, setDesc] = useState(true);

  const points = history[grain];

  const rows = useMemo(() => {
    const withAvg = points.map((p) => ({
      ...p,
      average: p.wagerers > 0 ? p.total / p.wagerers : 0,
    }));
    const dir = desc ? -1 : 1;
    return withAvg.sort((a, b) => {
      if (sort === "start") return a.start.localeCompare(b.start) * dir;
      return (a[sort] - b[sort]) * dir;
    });
  }, [points, sort, desc]);

  /* Gaps are counted, not just drawn. "8 days" next to "5 days never
     captured" is the difference between a quiet fortnight and a broken sync,
     and the header is where somebody would actually notice. */
  const gaps = points.filter((p) => p.missing).length;
  const captured = points.length - gaps;

  const max = Math.max(1, ...points.map((p) => p.total));
  const totalAll = points.reduce((a, p) => a + p.total, 0);
  const best = points.reduce(
    (a, p) => (p.total > (a?.total ?? -1) ? p : a),
    points[0]
  );

  /* The last period is still running - today is not over, and neither is this
     week or month. Marked, because a half-finished period read as a finished
     one says "wagering collapsed" every single morning. */
  const runningStart = points[points.length - 1]?.start;

  function toggle(key: SortKey) {
    if (sort === key) setDesc((d) => !d);
    else {
      setSort(key);
      setDesc(true);
    }
  }

  const Th = ({ label, k }: { label: string; k: SortKey }) => (
    <th className="px-4 py-2 text-right">
      <button
        type="button"
        onClick={() => toggle(k)}
        className={cn(
          "inline-flex items-center gap-1 text-label font-semibold uppercase tracking-wide",
          sort === k ? "text-ink" : "text-ink-subtle hover:text-ink"
        )}
      >
        {label}
        {sort === k &&
          (desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
      </button>
    </th>
  );

  return (
    <div className="rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
        <div className="inline-flex rounded-control border border-line-strong p-0.5">
          {GRAINS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setGrain(g.key)}
              className={cn(
                "rounded px-2.5 py-1 text-small font-medium transition-colors duration-fast",
                grain === g.key
                  ? "bg-accent text-white btn-on-accent"
                  : "text-ink-muted hover:bg-sunken hover:text-ink"
              )}
            >
              {g.label}
            </button>
          ))}
        </div>

        {points.length > 0 && (
          <p className="text-small text-ink-muted">
            Best {grain}:{" "}
            <span className="font-medium text-ink">{best?.label}</span> at{" "}
            <span className="tabular font-semibold text-ink">
              {money(best?.total ?? 0)}
            </span>
            <span className="mx-2 text-ink-subtle">·</span>
            <span className="tabular">{money(totalAll)}</span> over{" "}
            {captured} {grain}
            {captured === 1 ? "" : "s"}
            {gaps > 0 && (
              <>
                <span className="mx-2 text-ink-subtle">·</span>
                <span className="font-medium text-warning">
                  {gaps} {grain}
                  {gaps === 1 ? "" : "s"} never captured
                </span>
              </>
            )}
          </p>
        )}
      </div>

      {points.length === 0 ? (
        <p className="py-10 text-center text-small text-ink-subtle">
          No {grain} figures stored yet. They arrive with the next sync.
        </p>
      ) : (
        <>
          {/* Shape first, so a glance still works. */}
          <div className="flex h-20 items-end gap-[2px] px-3 pt-3">
            {points.map((p) => (
              /* A missing period is drawn full height in a warning tint, not
                 as a flat bar. A flat bar says "nobody wagered"; this says
                 "we never looked" - and those are opposite conclusions about
                 whether anything is wrong. */
              <span
                key={p.start}
                title={
                  p.missing
                    ? `${p.label} — the sync never recorded this ${grain}`
                    : `${p.label} — ${money(p.total)}`
                }
                className={cn(
                  "flex-1 rounded-t-sm",
                  p.missing
                    ? "bg-warning/25 outline-dashed outline-1 outline-offset-[-1px] outline-warning/50"
                    : p.start === runningStart
                      ? "bg-accent/30"
                      : "bg-accent/60"
                )}
                style={{
                  height: p.missing
                    ? "100%"
                    : `${Math.max(p.total > 0 ? 2 : 1, (p.total / max) * 100)}%`,
                }}
              />
            ))}
          </div>

          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full min-w-[520px] text-left">
              <thead>
                <tr className="border-y border-line bg-sunken">
                  <th className="px-4 py-2 text-label font-semibold uppercase tracking-wide text-ink-subtle">
                    <button
                      type="button"
                      onClick={() => toggle("start")}
                      className={cn(
                        "inline-flex items-center gap-1",
                        sort === "start" ? "text-ink" : "hover:text-ink"
                      )}
                    >
                      Period
                      {sort === "start" &&
                        (desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
                    </button>
                  </th>
                  <Th label="Wagering" k="wagerers" />
                  <Th label="Average each" k="average" />
                  <Th label="Total wagered" k="total" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.start}
                    className={cn(
                      "border-b border-line last:border-0",
                      i % 2 === 1 && "bg-sunken/35",
                      r.start === runningStart && "italic"
                    )}
                  >
                    <td className="px-4 py-2 text-body font-medium text-ink">
                      {r.label}
                      {r.start === runningStart && (
                        <span className="ml-2 text-caption not-italic text-ink-subtle">
                          still running
                        </span>
                      )}
                    </td>
                    {r.missing ? (
                      /* One cell across the figures rather than three zeros.
                         Zeros in the money column would be read as money. */
                      <td
                        colSpan={3}
                        className="px-4 py-2 text-right text-small font-medium text-warning"
                      >
                        Not captured — the sync did not run for this {grain}
                      </td>
                    ) : (
                      <>
                        <td className="tabular px-4 py-2 text-right text-small text-ink-muted">
                          {r.wagerers.toLocaleString()}
                        </td>
                        <td className="tabular px-4 py-2 text-right text-small text-ink-muted">
                          {money(r.average)}
                        </td>
                        <td className="tabular px-4 py-2 text-right text-body font-semibold text-ink">
                          {money(r.total)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
