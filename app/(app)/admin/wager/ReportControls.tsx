"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui";

/**
 * Period and rep pickers for the report.
 *
 * Periods rather than free dates: Roobet is asked for whole UTC windows, so
 * those are the only windows that can be answered as fact. Offering an
 * arbitrary date range would mean estimating one, and an estimate that looks
 * like a figure is worse than no figure.
 */
export function ReportControls({
  choice,
  owner,
  months,
  years,
  reps,
}: {
  choice: string;
  owner: string;
  months: { month: string; label: string }[];
  years: string[];
  reps: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, start] = useTransition();

  function go(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    start(() => router.push(`?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Select
        value={choice}
        aria-label="Report period"
        className="w-auto min-w-[168px]"
        onChange={(e) => go({ rp: e.target.value })}
      >
        <option value="all">All time</option>
        <option value="week">This week</option>
        <option value="month">This month</option>
        <option value="quarter">Last 3 months</option>
        <option value="ytd">This year</option>
        {years.length > 0 && (
          <optgroup label="Years">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </optgroup>
        )}
        {months.length > 0 && (
          <optgroup label="Months">
            {months.map((m) => (
              <option key={m.month} value={m.month}>
                {m.label}
              </option>
            ))}
          </optgroup>
        )}
      </Select>

      <Select
        value={owner}
        aria-label="Rep"
        className="w-auto min-w-[150px]"
        onChange={(e) => go({ ro: e.target.value })}
      >
        <option value="">Everyone</option>
        {reps.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
