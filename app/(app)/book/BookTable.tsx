"use client";

import { Fragment, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Player } from "@/lib/queries";
import type { BookSort } from "@/lib/book";
import { Button, Select, cn } from "@/components/ui";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  X,
} from "@/components/icons";
import { bulkChangeStatus } from "../actions";
import {
  DueLabel,
  PlayerDetail,
  PlayerFlags,
  StatusSelect,
  formatDate,
  type StatusOption,
} from "../shared";

type Column = { key: BookSort | null; label: string; className?: string };

const COLUMNS: Column[] = [
  { key: "handle", label: "Player" },
  { key: null, label: "Roobet username" },
  { key: "status", label: "Status", className: "w-[172px]" },
  { key: "source", label: "Source", className: "w-[110px]" },
  { key: "last_contact_at", label: "Last contact", className: "w-[110px]" },
  { key: "next_followup_at", label: "Due", className: "w-[110px]" },
  { key: null, label: "Notes", className: "w-[64px]" },
];

/**
 * THE BOOK.
 *
 * Every player, always editable - the queue decides what needs doing today,
 * this decides nothing and hides nothing. That distinction matters: the single
 * most common frustration with the spreadsheet was a row disappearing from view
 * and taking the ability to correct it along with it.
 *
 * Sorting and paging go through the URL and back to the database rather than
 * being done in the browser, so the behaviour does not change once the book
 * outgrows one page.
 */
export function BookTable({
  rows,
  statuses,
  timezone,
  attemptsThreshold,
  overdueHours,
  page,
  pageCount,
  total,
}: {
  rows: Player[];
  statuses: StatusOption[];
  timezone: string;
  attemptsThreshold: number;
  overdueHours: number;
  page: number;
  pageCount: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startNav] = useTransition();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkPending, startBulk] = useTransition();
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const sort = (params.get("sort") ?? "last_contact_at") as BookSort;
  const dir = (params.get("dir") ?? "desc") as "asc" | "desc";

  function setParam(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    startNav(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
  }

  function toggleSort(key: BookSort) {
    if (sort === key) setParam({ dir: dir === "asc" ? "desc" : "asc" });
    else setParam({ sort: key, dir: "asc" });
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function applyBulk() {
    if (!bulkStatus || selected.size === 0) return;
    startBulk(async () => {
      const res = await bulkChangeStatus(Array.from(selected), bulkStatus);
      setBulkResult(res?.error ?? res?.message ?? null);
      setSelected(new Set());
      setBulkStatus("");
      router.refresh();
    });
  }

  return (
    <div>
      {/* Bulk action bar - only present when there is a selection */}
      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="mb-3 flex flex-wrap items-center gap-3 rounded-card border border-accent/30
                     bg-accent-soft px-3 py-2.5"
        >
          <span className="text-small font-medium text-accent">
            {selected.size} selected
          </span>
          <Select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            aria-label="Set status for selected players"
            className="h-8 w-auto min-w-[170px] text-small"
          >
            <option value="">Change status to…</option>
            {statuses.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="primary"
            disabled={!bulkStatus}
            loading={bulkPending}
            onClick={applyBulk}
          >
            Apply
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex items-center gap-1 rounded-control px-2 py-1
                       text-small text-accent hover:bg-white/60"
          >
            <X size={13} /> Clear
          </button>
        </div>
      )}

      {bulkResult && (
        <p role="status" className="mb-3 rounded-control bg-success-soft px-3 py-2 text-small text-success">
          {bulkResult}
        </p>
      )}

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-card border border-line bg-surface shadow-card lg:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-sunken">
              <th scope="col" className="w-10 px-3 py-2.5">
                <Checkbox
                  checked={allOnPageSelected}
                  onChange={toggleAll}
                  label="Select all on this page"
                />
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  scope="col"
                  className={cn(
                    "px-3 py-2.5 text-label font-medium uppercase tracking-wide text-ink-subtle",
                    col.className
                  )}
                  aria-sort={
                    col.key && sort === col.key
                      ? dir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {col.key ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key as BookSort)}
                      className="inline-flex items-center gap-1 rounded hover:text-ink"
                    >
                      {col.label}
                      {sort === col.key &&
                        (dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((p) => {
              const isOpen = expanded === p.id;
              return (
                <Fragment key={p.id}>
                  <tr
                    className={cn(
                      "border-b border-line transition-colors duration-fast last:border-0",
                      selected.has(p.id) ? "bg-accent-soft/50" : "hover:bg-sunken/60"
                    )}
                  >
                    <td className="px-3 py-2.5 align-middle">
                      <Checkbox
                        checked={selected.has(p.id)}
                        onChange={() => toggleRow(p.id)}
                        label={`Select ${p.handle}`}
                      />
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-ink">{p.handle}</span>
                        <span className="tabular shrink-0 text-caption text-ink-subtle">
                          {p.reference}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        <PlayerFlags player={p} attemptsThreshold={attemptsThreshold} />
                      </div>
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      {p.roobet_username ? (
                        <span className="text-small text-ink">{p.roobet_username}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : p.id)}
                          className="text-small text-warning underline-offset-2 hover:underline"
                        >
                          Add username
                        </button>
                      )}
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      <StatusSelect player={p} statuses={statuses} size="sm" />
                    </td>

                    <td className="px-3 py-2.5 align-middle text-small text-ink-muted">
                      {p.source ?? "—"}
                    </td>

                    <td className="tabular px-3 py-2.5 align-middle text-small text-ink-muted">
                      {formatDate(p.last_contact_at, timezone)}
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      <DueLabel player={p} timezone={timezone} overdueHours={overdueHours} />
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : p.id)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? `Hide details for ${p.handle}` : `Edit ${p.handle}`}
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-control",
                          "transition-colors duration-fast",
                          isOpen
                            ? "bg-accent text-white"
                            : p.notes
                            ? "text-accent hover:bg-accent-soft"
                            : "text-ink-subtle hover:bg-sunken hover:text-ink"
                        )}
                      >
                        {p.notes ? <MessageSquare size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </td>
                  </tr>

                  {isOpen && (
                    <tr>
                      <td colSpan={COLUMNS.length + 1} className="p-0">
                        <PlayerDetail
                          player={p}
                          timezone={timezone}
                          onClose={() => setExpanded(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards - a table at 375px is unusable, so this is a different
          layout rather than a squeezed one. */}
      <div className="space-y-2 lg:hidden">
        {rows.map((p) => {
          const isOpen = expanded === p.id;
          return (
            <div
              key={p.id}
              className="overflow-hidden rounded-card border border-line bg-surface shadow-card"
            >
              <div className="flex items-start gap-3 p-3">
                <Checkbox
                  checked={selected.has(p.id)}
                  onChange={() => toggleRow(p.id)}
                  label={`Select ${p.handle}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-ink">{p.handle}</span>
                    <span className="tabular text-caption text-ink-subtle">{p.reference}</span>
                  </div>
                  <p className="mt-0.5 text-caption text-ink-subtle">
                    {p.roobet_username ?? "No Roobet username"} ·{" "}
                    {p.source ?? "No source"} · Last contact{" "}
                    {formatDate(p.last_contact_at, timezone)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <PlayerFlags player={p} attemptsThreshold={attemptsThreshold} />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusSelect player={p} statuses={statuses} size="sm" />
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : p.id)}
                      aria-expanded={isOpen}
                      className="inline-flex h-8 items-center gap-1 rounded-control px-2
                                 text-small font-medium text-ink-muted hover:bg-sunken"
                    >
                      <MessageSquare size={14} />
                      {isOpen ? "Less" : "Edit"}
                    </button>
                  </div>
                </div>
              </div>
              {isOpen && (
                <PlayerDetail
                  player={p}
                  timezone={timezone}
                  onClose={() => setExpanded(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Paging */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="tabular text-small text-ink-muted">
          Page {page} of {pageCount} · {total.toLocaleString()}{" "}
          {total === 1 ? "player" : "players"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={page <= 1}
            onClick={() => setParam({ page: String(page - 1) })}
            icon={<ChevronLeft size={14} />}
          >
            Previous
          </Button>
          <Button
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setParam({ page: String(page + 1) })}
          >
            Next <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Checkbox built on a real input so it is keyboard operable and announced
 * correctly; the visible box is drawn on top.
 */
function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="relative inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label={label}
      />
      <span
        aria-hidden="true"
        className={cn(
          "flex h-4.5 w-4.5 items-center justify-center rounded border-2 transition-colors duration-fast",
          "h-[18px] w-[18px]",
          checked
            ? "border-accent bg-accent text-white"
            : "border-line-strong bg-surface text-transparent peer-hover:border-ink-subtle"
        )}
      >
        <Check size={12} />
      </span>
    </label>
  );
}
