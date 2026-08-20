"use client";

import { Fragment, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Player } from "@/lib/queries";
import type { BookSort } from "@/lib/book";
import { CopyHandle, OpenProfile } from "../CopyHandle";
import { QuickNote } from "../QuickNote";
import { Badge, Button, Select, cn } from "@/components/ui";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  X,
} from "@/components/icons";
import { bulkAssignOwner, bulkChangeStatus, deletePlayers } from "../actions";
import { DueLabel, PlayerDetail, StatusSelect, formatDate, type StatusOption } from "../shared";

type Column = {
  key: BookSort | null;
  label: string;
  align?: "right";
  className?: string;
};

const COLUMNS: Column[] = [
  { key: "handle", label: "Player" },
  { key: null, label: "Roobet username", className: "w-[170px]" },
  { key: "status", label: "Status", className: "w-[172px]" },
  { key: "weighted_wager", label: "Wagered", align: "right", className: "w-[104px]" },
  { key: "last_contact_at", label: "Last contact", align: "right", className: "w-[112px]" },
  { key: "next_followup_at", label: "Due", align: "right", className: "w-[112px]" },
];

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * Turn an action's result into something the banner can colour correctly.
 *
 * Every bulk action returns the same shape, so the tone is known rather than
 * inferred. Before this, the banner was hard-coded green and reported
 * "Only admins can delete players." as though it had worked.
 */
function toBanner(
  res: { error?: string; message?: string } | null
): { text: string; failed: boolean } | null {
  if (!res) return null;
  if (res.error) return { text: res.error, failed: true };
  if (res.message) return { text: res.message, failed: false };
  return null;
}

/**
 * THE BOOK.
 *
 * Every player, always editable - the queue decides what needs doing today,
 * this decides nothing and hides nothing. That distinction matters: the most
 * common frustration with the spreadsheet was a row disappearing from view and
 * taking the ability to correct it with it.
 *
 * Sorting and paging go through the URL and back to the database rather than
 * happening in the browser, so behaviour does not change once the book outgrows
 * one page.
 */
export function BookTable({
  rows,
  statuses,
  timezone,
  attemptsThreshold,
  overdueHours,
  page,
  pageCount,
  pageSize,
  total,
  readOnly = false,
  team,
}: {
  rows: Player[];
  statuses: StatusOption[];
  timezone: string;
  attemptsThreshold: number;
  overdueHours: number;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  readOnly?: boolean;
  /** Present only for admins - enables "Assign to" in the bulk bar. */
  team?: { id: string; name: string; code: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startNav] = useTransition();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [bulkPending, startBulk] = useTransition();
  /* The action already knows whether it failed - it returns `error` or
     `message`. Keeping the tone alongside the text means the banner never has
     to guess from the wording. */
  const [bulkResult, setBulkResult] =
    useState<{ text: string; failed: boolean } | null>(null);
  /* Delete asks twice. The first click arms it, the second does it - so a
     mis-click on a destructive control costs nothing, and the confirmation
     names the number rather than asking a vague "are you sure?". */
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      setBulkResult(toBanner(res));
      setSelected(new Set());
      setBulkStatus("");
      router.refresh();
    });
  }

  function applyAssign() {
    if (!assignTo || selected.size === 0) return;
    startBulk(async () => {
      const res = await bulkAssignOwner(Array.from(selected), assignTo);
      setBulkResult(toBanner(res));
      setSelected(new Set());
      setAssignTo("");
      router.refresh();
    });
  }

  function applyDelete() {
    if (selected.size === 0) return;
    startBulk(async () => {
      const res = await deletePlayers(Array.from(selected));
      setBulkResult(toBanner(res));
      setSelected(new Set());
      setConfirmDelete(false);
      router.refresh();
    });
  }

  /* Clearing the selection must disarm the delete too. Otherwise the armed
     state outlives what it was armed against, and the next selection inherits
     a primed destructive button. */
  function clearSelection() {
    setSelected(new Set());
    setConfirmDelete(false);
  }

  const firstOnPage = (page - 1) * pageSize + 1;
  const lastOnPage = Math.min(page * pageSize, total);

  return (
    <div>
      {/* Bulk actions - present only when there is a selection */}
      {selected.size > 0 && !readOnly && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="mb-3 flex flex-wrap items-center gap-3 rounded-card border border-accent/25
                     bg-accent-soft px-3 py-2.5"
        >
          <span className="text-small font-medium text-accent">{selected.size} selected</span>
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

          {/* Assign to another rep - admins only, and the receiving rep picks
              them up in their own queue on the players' normal cadence. */}
          {team && team.length > 0 && (
            <>
              <span className="hidden h-5 w-px bg-accent/20 sm:block" aria-hidden="true" />
              <Select
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value)}
                aria-label="Assign selected players to"
                className="h-8 w-auto min-w-[160px] text-small"
              >
                <option value="">Assign to…</option>
                {team.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="primary"
                disabled={!assignTo}
                loading={bulkPending}
                onClick={applyAssign}
              >
                Assign
              </Button>
            </>
          )}

          {/* Delete - admins only, and permanent.
              Sits behind the same `team` gate as Assign because both are
              admin-only, and it is deliberately the last control in the bar:
              the destructive one should not be next to the one people use all
              day. */}
          {team && team.length > 0 && (
            <>
              <span className="hidden h-5 w-px bg-accent/20 sm:block" aria-hidden="true" />
              {confirmDelete ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-small font-medium text-danger">
                    Delete {selected.size} permanently? Their messages and wager
                    history go too.
                  </span>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={bulkPending}
                    onClick={applyDelete}
                  >
                    Yes, delete
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={bulkPending}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto inline-flex items-center gap-1 rounded-control px-2 py-1
                       text-small text-accent hover:bg-white/60"
          >
            <X size={13} /> Clear
          </button>
        </div>
      )}

      {/* One banner for every bulk action. It used to be unconditionally green,
          which meant "Only admins can delete players." was reported as a
          success - so failures are told apart here rather than assumed away. */}
      {bulkResult && (
        <p
          role="status"
          className={cn(
            "mb-3 rounded-control px-3 py-2 text-small",
            bulkResult.failed
              ? "bg-danger-soft text-danger"
              : "bg-success-soft text-success"
          )}
        >
          {bulkResult.text}
        </p>
      )}

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-card border border-line bg-surface shadow-card lg:block">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10">
            <tr className="border-b-2 border-line-heavy bg-sunken">
              <th scope="col" className="w-11 px-3 py-2">
                {!readOnly && (
                  <Checkbox
                    checked={allOnPageSelected}
                    onChange={toggleAll}
                    label="Select all on this page"
                  />
                )}
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  scope="col"
                  className={cn(
                    "px-3 py-2 text-label font-medium uppercase tracking-wide text-ink-subtle",
                    col.align === "right" && "text-right",
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
                      className={cn(
                        "inline-flex items-center gap-1 rounded hover:text-ink",
                        sort === col.key && "text-ink"
                      )}
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
              <th scope="col" className="w-14 px-3 py-2" />
            </tr>
          </thead>

          <tbody>
            {rows.map((p, index) => {
              const isOpen = expanded === p.id;
              const hoursLate = p.next_followup_at
                ? (Date.now() - new Date(p.next_followup_at).getTime()) / 3_600_000
                : 0;
              const veryLate = hoursLate >= overdueHours;
              const readyForDead =
                p.missing_roobet && p.followup_attempts >= attemptsThreshold;

              return (
                <Fragment key={p.id}>
                  <tr
                    className={cn(
                      "border-b border-line-heavy transition-colors duration-fast",
                      selected.has(p.id)
                        ? "bg-accent-soft/60"
                        : isOpen
                        ? "bg-sunken/70"
                        : cn(
                            // Alternating bands give the eye a rail to follow
                            // across the row without a heavy grid.
                            index % 2 === 1 && "bg-sunken/35",
                            "hover:bg-accent-soft/40"
                          ),
                      veryLate && !selected.has(p.id) && "border-l-2 border-l-danger"
                    )}
                  >
                    <td className="px-3 py-1.5 align-middle">
                      {!readOnly && (
                        <Checkbox
                          checked={selected.has(p.id)}
                          onChange={() => toggleRow(p.id)}
                          label={`Select ${p.handle}`}
                        />
                      )}
                    </td>

                    {/* Identity carries the reference and source quietly beneath */}
                    <td className="px-3 py-1.5 align-middle">
                      <div className="flex items-center gap-2">
                        <CopyHandle handle={p.handle} />
                        <OpenProfile handle={p.handle} source={p.source} />
                        {readyForDead && (
                          <Badge tone="danger" icon={<AlertTriangle size={10} />}>
                            {p.followup_attempts}
                          </Badge>
                        )}
                      </div>
                      <p className="tabular mt-0.5 text-caption text-ink-subtle">
                        {p.reference}
                        {p.source && ` · ${p.source}`}
                        {p.first_deposit_at && " · Deposited"}
                      </p>
                    </td>

                    <td className="px-3 py-1.5 align-middle">
                      {p.roobet_username ? (
                        <span className="truncate text-small text-ink">{p.roobet_username}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : p.id)}
                          className="text-small font-medium text-warning underline-offset-2 hover:underline"
                        >
                          Add username
                        </button>
                      )}
                    </td>

                    <td className="px-3 py-1.5 align-middle">
                      <StatusSelect
                        player={p}
                        statuses={statuses}
                        size="sm"
                        disabled={readOnly}
                      />
                    </td>

                    <td
                      className={cn(
                        "tabular px-3 py-1.5 text-right align-middle text-small",
                        Number(p.weighted_wager ?? 0) > 0
                          ? "font-medium text-ink"
                          : "text-ink-subtle"
                      )}
                    >
                      {Number(p.weighted_wager ?? 0) > 0
                        ? money(Number(p.weighted_wager))
                        : "—"}
                    </td>

                    <td className="tabular px-3 py-1.5 text-right align-middle text-small text-ink-muted">
                      {formatDate(p.last_contact_at, timezone)}
                    </td>

                    <td
                      className={cn(
                        "px-3 py-3 text-right align-middle",
                        veryLate && "font-medium"
                      )}
                    >
                      <DueLabel player={p} timezone={timezone} overdueHours={overdueHours} />
                    </td>

                    <td className="px-3 py-3 text-right align-middle">
                      <span className="inline-flex items-center gap-1">
                        <QuickNote playerId={p.id} notes={p.notes} handle={p.handle} />
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : p.id)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? `Hide details for ${p.handle}` : `Edit ${p.handle}`}
                          className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-control",
                            "transition-colors duration-fast",
                            isOpen
                              ? "bg-accent text-white btn-on-accent"
                              : "text-ink-subtle hover:bg-sunken hover:text-ink"
                          )}
                        >
                          <ChevronDown size={14} />
                        </button>
                      </span>
                    </td>
                  </tr>

                  {isOpen && (
                    <tr>
                      <td colSpan={COLUMNS.length + 2} className="p-0">
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
                {!readOnly && (
                  <Checkbox
                    checked={selected.has(p.id)}
                    onChange={() => toggleRow(p.id)}
                    label={`Select ${p.handle}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <CopyHandle handle={p.handle} />
                    <span className="tabular text-caption text-ink-subtle">{p.reference}</span>
                  </div>
                  <p className="mt-0.5 text-caption text-ink-subtle">
                    {p.roobet_username ?? "No Roobet username"}
                    {p.source && ` · ${p.source}`} · Last contact{" "}
                    {formatDate(p.last_contact_at, timezone)}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <StatusSelect
                        player={p}
                        statuses={statuses}
                        size="sm"
                        disabled={readOnly}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : p.id)}
                      aria-expanded={isOpen}
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-control px-2
                                 text-small font-medium text-ink-muted hover:bg-sunken"
                    >
                      <MessageSquare size={14} />
                      {isOpen ? "Less" : "Edit"}
                    </button>
                  </div>
                </div>
              </div>
              {isOpen && (
                <PlayerDetail player={p} timezone={timezone} onClose={() => setExpanded(null)} />
              )}
            </div>
          );
        })}
      </div>

      {/* Paging */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="tabular text-small text-ink-muted">
          {total === 0
            ? "Nothing to show"
            : `${firstOnPage.toLocaleString()}–${lastOnPage.toLocaleString()} of ${total.toLocaleString()}`}
        </p>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={page <= 1}
              onClick={() => setParam({ page: String(page - 1) })}
              icon={<ChevronLeft size={14} />}
            >
              Previous
            </Button>
            <span className="tabular px-1 text-small text-ink-subtle">
              {page} / {pageCount}
            </span>
            <Button
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setParam({ page: String(page + 1) })}
            >
              Next <ChevronRight size={14} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Built on a real input so it is keyboard operable and announced correctly;
 * the visible box is drawn on top.
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
          "flex h-[18px] w-[18px] items-center justify-center rounded border-2",
          "transition-colors duration-fast",
          checked
            ? "border-accent bg-accent text-white btn-on-accent"
            : "border-line-strong bg-surface text-transparent peer-hover:border-ink-subtle"
        )}
      >
        <Check size={12} />
      </span>
    </label>
  );
}
