"use client";

import { useState } from "react";
import type { HistoryPoint, WagerHistory, HistoryGrain } from "@/lib/admin";
import { cn } from "@/components/ui";

const GRAINS: { key: HistoryGrain; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

const money = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
};

const exact = (n: number) =>
  "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * WAGERED OVER TIME.
 *
 * Replaces the "Month by month" table, which showed a single row - true, and
 * useless, because syncing started this month. The daily figures were being
 * stored the whole time and nothing read them.
 *
 * Bars rather than a line: these are discrete periods, each one a fact Roobet
 * returned for that exact window, not a continuous measurement sampled over
 * time. A line would imply values between the points that do not exist.
 *
 * No charting library. Thirty divs with a height do this correctly, and the
 * page already loads enough.
 */
export function WagerTrend({ history }: { history: WagerHistory }) {
  const [grain, setGrain] = useState<HistoryGrain>("day");
  const [hover, setHover] = useState<number | null>(null);

  const points = history[grain];
  const max = Math.max(1, ...points.map((p) => p.total));
  const shown = hover !== null ? points[hover] : null;

  /* The most recent period is still running - today is not over, and neither
     is this week or month. Drawn faded so a half-finished bar is not read as
     a collapse in wagering, which is the one thing this chart could otherwise
     say loudly and wrongly every single morning. */
  const lastIndex = points.length - 1;

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-control border border-line-strong p-0.5">
          {GRAINS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => {
                setGrain(g.key);
                setHover(null);
              }}
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

        {shown ? (
          <p className="text-small text-ink-muted">
            <span className="font-medium text-ink">{shown.label}</span> ·{" "}
            <span className="tabular font-semibold text-ink">{exact(shown.total)}</span> ·{" "}
            <span className="tabular">{shown.wagerers.toLocaleString()}</span> wagering
          </p>
        ) : (
          <p className="text-small text-ink-subtle">
            {points.length > 0
              ? `${points.length} ${grain}${points.length === 1 ? "" : "s"} on record — hover a bar`
              : "Nothing on record yet"}
          </p>
        )}
      </div>

      {points.length === 0 ? (
        <p className="py-10 text-center text-small text-ink-subtle">
          No {grain} figures stored yet. They arrive with the next sync.
        </p>
      ) : (
        <>
          <div className="flex h-40 items-end gap-[3px]">
            {points.map((p, i) => (
              <button
                key={p.start}
                type="button"
                aria-label={`${p.label}: ${exact(p.total)}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="group relative flex-1 rounded-t-sm transition-colors duration-fast"
                style={{ height: "100%" }}
              >
                <span
                  className={cn(
                    "absolute bottom-0 left-0 right-0 rounded-t-sm transition-colors duration-fast",
                    hover === i
                      ? "bg-accent"
                      : i === lastIndex
                        ? "bg-accent/35"
                        : "bg-accent/70 group-hover:bg-accent"
                  )}
                  style={{
                    // A zero period still gets a hairline, so a gap in the data
                    // is visibly different from a day nobody wagered.
                    height: `${Math.max(p.total > 0 ? 2 : 1, (p.total / max) * 100)}%`,
                  }}
                />
              </button>
            ))}
          </div>

          <div className="mt-2 flex justify-between text-caption text-ink-subtle">
            <span>{points[0]?.label}</span>
            <span className="tabular">peak {money(max)}</span>
            <span>
              {points[lastIndex]?.label}
              <span className="ml-1 opacity-60">(still running)</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
