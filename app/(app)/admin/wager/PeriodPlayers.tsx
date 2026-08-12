"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { PeriodPlayer } from "@/lib/admin";
import { Badge, Button, Input, Notice, Select, cn } from "@/components/ui";
import { Search } from "@/components/icons";
import { setWagererPreExisting } from "../actions";
import { RetireUnclaimed } from "./RetireUnclaimed";

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * EVERY WAGERER, ONE LIST.
 *
 * This replaced a separate "Unclaimed wagerers" panel. Two lists over the same
 * money invited the question of which one was right, and the answer was
 * neither on its own. Here claimed and unclaimed sit together, so the rows
 * always add up to the headline figure for the same period, and a name can be
 * recognised and retired where it sits.
 *
 * Defaults to all time: that is the figure that does not change under you, and
 * the one worth opening the page on.
 */
export function PeriodPlayers({
  rows,
  total,
  page,
  pages,
  choice,
  months,
  unclaimedCount,
}: {
  rows: PeriodPlayer[];
  total: number;
  page: number;
  pages: number;
  choice: string;
  months: { month: string; label: string }[];
  unclaimedCount: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState(params.get("pq") ?? "");
  const [notice, setNotice] = useState<{ error?: string; message?: string } | null>(null);

  useEffect(() => setSearch(params.get("pq") ?? ""), [params]);

  function go(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    start(() => router.push(`?${next.toString()}`, { scroll: false }));
  }

  const showPreExisting = params.get("pre") === "1";
  const visible = showPreExisting ? rows : rows.filter((r) => !r.ignored);

  return (
    <div className="rounded-card border border-line-strong bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-line-heavy px-4 py-3">
        <Select
          value={choice}
          aria-label="Period"
          className="w-auto min-w-[168px]"
          onChange={(e) => go({ pp: e.target.value, ppg: null })}
        >
          <option value="all">All time</option>
          <option value="day">Today (UTC)</option>
          <option value="week">This week (UTC)</option>
          <option value="month">This month (UTC)</option>
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
          className="flex min-w-[200px] flex-1 items-center gap-2"
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

        <Button
          size="sm"
          variant={showPreExisting ? "primary" : "secondary"}
          onClick={() => go({ pre: showPreExisting ? null : "1", ppg: null })}
        >
          {showPreExisting ? "Hiding none" : "Show pre-existing"}
        </Button>

        {unclaimedCount > 0 && <RetireUnclaimed count={unclaimedCount} />}
      </div>

      {notice && (
        <div className="px-4 pt-3">
          <Notice tone={notice.error ? "danger" : "success"}>
            {notice.error ?? notice.message}
          </Notice>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="px-4 py-6 text-body text-ink-muted">
          Nothing wagered in this period yet.
        </p>
      ) : (
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-line-heavy bg-sunken">
                <Th className="w-10">#</Th>
                <Th>Roobet username</Th>
                <Th>Rep</Th>
                <Th>Code</Th>
                <Th align="right">Weighted wager</Th>
                <Th align="right" className="w-32">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr
                  key={r.username}
                  className={cn(
                    "border-b border-line-heavy last:border-0",
                    i % 2 === 1 && "bg-sunken/40",
                    r.ignored && "opacity-55"
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
                    ) : r.ignored ? (
                      <Badge tone="neutral">Pre-existing</Badge>
                    ) : (
                      <Badge tone="warning">Unclaimed</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-small text-ink-subtle">{r.sources}</td>
                  <td className="tabular px-4 py-2 text-right text-body font-semibold text-ink">
                    {money(r.wagered)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {/* Only unowned names need this. Someone in a book is
                        accounted for by definition. */}
                    {!r.ownerName && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={pending}
                        onClick={() =>
                          start(async () => {
                            setNotice(
                              await setWagererPreExisting(r.username, !r.ignored)
                            );
                            router.refresh();
                          })
                        }
                      >
                        {r.ignored ? "Restore" : "Pre-existing"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-strong px-4 py-2.5">
        <span className="tabular text-caption text-ink-subtle">
          {total.toLocaleString()} {total === 1 ? "wagerer" : "wagerers"}
          {pages > 1 && ` · page ${page} of ${pages}`}
        </span>
        {pages > 1 && (
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
        )}
      </div>
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
