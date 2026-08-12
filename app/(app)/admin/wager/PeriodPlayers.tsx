"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { PeriodPlayer } from "@/lib/admin";
import { Badge, Button, Input, Select, cn } from "@/components/ui";
import { Search } from "@/components/icons";

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * PER-PLAYER WAGER, FOR ANY PERIOD.
 *
 * The period picker and the totals above read the same stored facts, so the
 * rows here always add up to the headline figure for the same choice. Players
 * with no rep are shown rather than hidden - they are real money, and dropping
 * them would make the list quietly disagree with the total.
 */
export function PeriodPlayers({
  rows,
  total,
  page,
  pages,
  choice,
  months,
}: {
  rows: PeriodPlayer[];
  total: number;
  page: number;
  pages: number;
  choice: string;
  months: { month: string; label: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState(params.get("pq") ?? "");

  // Keep the box in step when the URL changes from elsewhere (back button).
  useEffect(() => setSearch(params.get("pq") ?? ""), [params]);

  function go(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    start(() => router.push(`?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className="rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-line-strong px-4 py-3">
        <Select
          value={choice}
          aria-label="Period"
          className="w-auto min-w-[168px]"
          onChange={(e) => go({ pp: e.target.value, ppg: null })}
        >
          <option value="day">Today (UTC)</option>
          <option value="week">This week (UTC)</option>
          <option value="month">This month (UTC)</option>
          <option value="all">All time</option>
          {months.length > 0 && (
            <optgroup label="Past months">
              {months.map((m) => (
                <option key={m.month} value={m.month}>
                  {m.label}
                </option>
              ))}
            </optgroup>
          )}
        </Select>

        <form
          className="flex min-w-[220px] flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            go({ pq: search, ppg: null });
          }}
        >
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Roobet username"
            aria-label="Search Roobet username"
            className="flex-1"
          />
          <Button type="submit" icon={<Search size={15} />} loading={pending}>
            Search
          </Button>
          {params.get("pq") && (
            <Button variant="ghost" onClick={() => go({ pq: null, ppg: null })}>
              Clear
            </Button>
          )}
        </form>

        <span className="tabular text-caption text-ink-subtle">
          {total.toLocaleString()} {total === 1 ? "player" : "players"}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-body text-ink-muted">
          Nothing wagered in this period yet.
        </p>
      ) : (
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-line bg-sunken">
                <th
                  scope="col"
                  className="px-4 py-2 text-label font-medium uppercase tracking-wide text-ink-subtle"
                >
                  #
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-label font-medium uppercase tracking-wide text-ink-subtle"
                >
                  Roobet username
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-label font-medium uppercase tracking-wide text-ink-subtle"
                >
                  Rep
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-label font-medium uppercase tracking-wide text-ink-subtle"
                >
                  Code
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-right text-label font-medium uppercase tracking-wide text-ink-subtle"
                >
                  Weighted wager
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.username}
                  className={cn(
                    "border-b border-line last:border-0",
                    i % 2 === 1 && "bg-sunken/35"
                  )}
                >
                  <td className="tabular px-4 py-2 text-caption text-ink-subtle">
                    {(page - 1) * 50 + i + 1}
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
                  <td className="px-4 py-2 text-small">
                    {r.ownerName ? (
                      <span className="text-ink-muted">{r.ownerName}</span>
                    ) : (
                      <Badge tone="neutral">Unclaimed</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-small text-ink-subtle">{r.sources}</td>
                  <td className="tabular px-4 py-2 text-right text-body font-semibold text-ink">
                    {money(r.wagered)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
          <span className="tabular text-caption text-ink-subtle">
            Page {page} of {pages}
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              disabled={page <= 1}
              loading={pending}
              onClick={() => go({ ppg: String(page - 1) })}
            >
              Previous
            </Button>
            <Button
              size="sm"
              disabled={page >= pages}
              loading={pending}
              onClick={() => go({ ppg: String(page + 1) })}
            >
              Next
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
