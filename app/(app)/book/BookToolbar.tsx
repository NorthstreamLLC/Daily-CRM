"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select, cn } from "@/components/ui";
import { Search, X } from "@/components/icons";
import { PAGE_SIZES } from "@/lib/pagination";

export type Chip = {
  key: string;
  label: string;
  count: number;
  tone?: "warning" | "danger" | "success";
};

/**
 * Search and filters for the Book.
 *
 * All state lives in the URL rather than in component state. That makes a
 * filtered view shareable and bookmarkable, survives a refresh, and means the
 * back button does what you expect - none of which is true when filters are
 * held in memory.
 */
export function BookToolbar({
  statuses,
  sources,
  chips,
  pageSize,
}: {
  statuses: string[];
  sources: string[];
  chips: Chip[];
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const [q, setQ] = useState(params.get("q") ?? "");
  const firstRender = useRef(true);

  function apply(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") sp.delete(key);
      else sp.set(key, value);
    }
    // Any filter change returns you to page one; staying on page 7 of a result
    // set that now has two pages shows an empty table.
    if (!("page" in next)) sp.delete("page");
    start(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
  }

  // Debounced search - typing should not fire a query per keystroke.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => apply({ q: q || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const activeFlag = params.get("flag") ?? "";
  const activeStatus = params.get("status") ?? "";
  const activeSource = params.get("source") ?? "";
  const hasFilters = Boolean(q || activeFlag || activeStatus || activeSource);

  return (
    <div className="mb-3 space-y-2">
      {/* Quick filters double as a health check on the book. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((chip) => {
          const active = activeFlag === chip.key;
          const alarming = chip.count > 0 && (chip.tone === "danger" || chip.tone === "warning");
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={active}
              onClick={() => apply({ flag: active ? null : chip.key })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
                "text-small font-medium transition-colors duration-fast",
                active
                  ? "border-accent bg-accent text-white btn-on-accent"
                  : alarming
                  ? chip.tone === "danger"
                    ? "border-danger/30 bg-danger-soft text-danger hover:border-danger/50"
                    : "border-warning/30 bg-warning-soft text-warning hover:border-warning/50"
                  : "border-line-strong bg-surface text-ink-muted hover:bg-sunken hover:text-ink"
              )}
            >
              {chip.label}
              <span className={cn("tabular", active ? "text-white/70" : "opacity-60")}>
                {chip.count.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Capped, so the selects sit beside it instead of being pushed onto
            their own rows - which is what made the toolbar four rows tall. */}
        <div className="relative min-w-[200px] max-w-[320px] flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle">
            <Search size={15} />
          </span>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search handle, Roobet username or reference"
            aria-label="Search this book"
            className="pl-8"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-subtle hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <Select
          value={activeStatus}
          aria-label="Filter by status"
          onChange={(e) => apply({ status: e.target.value || null })}
          className="w-auto min-w-[132px]"
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        <Select
          value={activeSource}
          aria-label="Filter by source"
          onChange={(e) => apply({ source: e.target.value || null })}
          className="w-auto min-w-[116px]"
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        <Select
          value={String(pageSize)}
          aria-label="Players per page"
          onChange={(e) => apply({ size: e.target.value })}
          className="w-auto"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              Show {n}
            </option>
          ))}
        </Select>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              apply({ q: null, status: null, source: null, flag: null });
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-control px-2.5
                       text-small font-medium text-ink-muted hover:bg-sunken hover:text-ink"
          >
            <X size={14} /> Clear
          </button>
        )}

        {pending && <span className="text-caption text-ink-subtle">Updating…</span>}
      </div>
    </div>
  );
}
