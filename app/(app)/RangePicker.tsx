"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Input, cn } from "@/components/ui";
import { Clock, X } from "@/components/icons";
import { RANGE_PRESETS, type DateRange } from "@/lib/ranges";

/**
 * Period selector: presets plus a custom calendar range.
 *
 * The choice lives in the URL rather than in component state, so a view can be
 * bookmarked or sent to someone and arrive showing the same window. The custom
 * range only submits when both ends are set - a half-entered range would
 * otherwise reload the page on every keystroke.
 */
export function RangePicker({ range, today }: { range: DateRange; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const [open, setOpen] = useState(range.key === "custom");
  const [from, setFrom] = useState(range.key === "custom" ? range.from : "");
  const [to, setTo] = useState(range.key === "custom" ? range.to : "");

  function go(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete("page");
    start(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
  }

  const invalid = Boolean(from && to && from > to);

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGE_PRESETS.map((preset) => {
          const active = range.key === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => {
                setOpen(false);
                setFrom("");
                setTo("");
                go({ period: preset.key, from: null, to: null });
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-small font-medium",
                "transition-colors duration-fast",
                active
                  ? "border-accent bg-accent text-white btn-on-accent"
                  : "border-line-strong bg-surface text-ink-muted hover:bg-sunken hover:text-ink"
              )}
            >
              {preset.label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
            "text-small font-medium transition-colors duration-fast",
            range.key === "custom"
              ? "border-accent bg-accent text-white btn-on-accent"
              : "border-line-strong bg-surface text-ink-muted hover:bg-sunken hover:text-ink"
          )}
        >
          <Clock size={12} />
          {range.key === "custom" ? range.label : "Pick dates"}
        </button>

        {pending && <span className="text-caption text-ink-subtle">Updating…</span>}
      </div>

      {open && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-3 shadow-card">
          <div>
            <label htmlFor="range-from" className="mb-1 block text-label font-medium text-ink-muted">
              From
            </label>
            <Input
              id="range-from"
              type="date"
              value={from}
              max={to || today}
              onChange={(e) => setFrom(e.target.value)}
              className="w-auto"
            />
          </div>

          <div>
            <label htmlFor="range-to" className="mb-1 block text-label font-medium text-ink-muted">
              To
            </label>
            <Input
              id="range-to"
              type="date"
              value={to}
              min={from || undefined}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="w-auto"
            />
          </div>

          <Button
            variant="primary"
            disabled={!from || !to || invalid}
            loading={pending}
            onClick={() => go({ from, to, period: null })}
          >
            Apply
          </Button>

          {range.key === "custom" && (
            <Button
              variant="ghost"
              icon={<X size={14} />}
              onClick={() => {
                setFrom("");
                setTo("");
                setOpen(false);
                go({ period: "today", from: null, to: null });
              }}
            >
              Clear
            </Button>
          )}

          {invalid && (
            <p className="w-full text-caption text-danger">
              The start date is after the end date.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
