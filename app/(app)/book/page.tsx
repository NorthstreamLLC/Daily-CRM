import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BookToolbar, type Chip } from "./BookToolbar";
import { BookTable } from "./BookTable";
import { OwnerSwitcher } from "./OwnerSwitcher";
import { AddPlayer } from "../today/AddPlayer";
import { EmptyState } from "@/components/ui";
import { BookOpen, ChevronLeft, Search, Shield } from "@/components/icons";
import {
  getBook,
  getBookCounts,
  resolvePageSize,
  type BookFilters,
  type BookSort,
} from "@/lib/book";
import { getMe, getSetting, getSources, getStatuses } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SORTS: BookSort[] = [
  "handle",
  "reference",
  "status",
  "source",
  "assigned_at",
  "last_contact_at",
  "next_followup_at",
  "weighted_wager",
];

/**
 * THE BOOK.
 *
 * Filters arrive as URL parameters and are validated here rather than trusted -
 * the sort column is checked against a fixed list before it reaches the
 * database, so a hand-edited URL cannot turn into an unexpected query.
 *
 * An admin can open anyone's book with ?owner=. A rep cannot: the parameter is
 * ignored for them, and Row Level Security would return nothing anyway.
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const one = (key: string) => {
    const v = searchParams[key];
    return Array.isArray(v) ? v[0] ?? "" : v ?? "";
  };

  const isAdmin = me.role === "admin";
  const requestedOwner = isAdmin ? one("owner") : "";
  const ownerId = requestedOwner || me.id;
  const viewingSomeoneElse = ownerId !== me.id;

  const requestedSort = one("sort") as BookSort;
  const filters: BookFilters = {
    q: one("q"),
    status: one("status"),
    source: one("source"),
    flag: one("flag"),
    sort: SORTS.includes(requestedSort) ? requestedSort : "last_contact_at",
    dir: one("dir") === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(one("page")) || 1),
    pageSize: resolvePageSize(one("size")),
  };

  const supabase = createClient();

  const [attemptsRaw, overdueRaw] = await Promise.all([
    getSetting("followup_attempts_before_dead", "3"),
    getSetting("overdue_highlight_hours", "24"),
  ]);

  const [book, counts, statuses, sources, team, owner] = await Promise.all([
    getBook(me, filters, ownerId),
    getBookCounts(me, ownerId),
    getStatuses(),
    getSources(),
    isAdmin
      ? supabase
          .from("users")
          .select("id, name, code")
          .eq("active", true)
          .order("name")
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    viewingSomeoneElse
      ? supabase
          .from("users")
          .select("name, code")
          .eq("id", ownerId)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

  if (viewingSomeoneElse && !owner) redirect("/book");

  const chips: Chip[] = [
    {
      key: "overdue",
      label: "Overdue",
      count: counts.overdue,
      tone: "danger",
    },
    {
      key: "missing_roobet",
      label: "No Roobet username",
      count: counts.missingRoobet,
      tone: "warning",
    },
    { key: "ftd", label: "Deposited", count: counts.ftd, tone: "success" },
    { key: "dead", label: "Dead leads", count: counts.dead },
  ];

  const filtered = Boolean(filters.q || filters.status || filters.source || filters.flag);
  const exportHref = viewingSomeoneElse ? `/api/export?owner=${ownerId}` : "/api/export";

  return (
    <>
      {/* Viewing someone else's book is stated plainly, never implied. */}
      {viewingSomeoneElse && owner && (
        <div
          className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-accent/25
                     bg-accent-soft px-4 py-2.5"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Shield size={14} />
          </span>
          <p className="text-small text-accent">
            Viewing <span className="font-semibold">{owner.name}&rsquo;s</span> book as an
            admin. Edits here change their data.
          </p>
          <Link
            href="/admin"
            className="ml-auto inline-flex items-center gap-1 rounded-control px-2 py-1
                       text-small font-medium text-accent hover:bg-white/60"
          >
            <ChevronLeft size={14} /> Back to admin
          </Link>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold tracking-tight text-ink">
            {viewingSomeoneElse && owner ? `${owner.name}'s book` : "Book"}
          </h1>
          <p className="mt-0.5 text-body text-ink-muted">
            {counts.all.toLocaleString()} {counts.all === 1 ? "player" : "players"}. Nothing
            is hidden here, and every field is editable.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && team.length > 1 && (
            <Suspense fallback={null}>
              <OwnerSwitcher team={team} current={ownerId} meId={me.id} />
            </Suspense>
          )}
          <a
            href={exportHref}
            className="inline-flex h-9 items-center gap-1.5 rounded-control border
                       border-line-strong bg-surface px-3.5 text-body font-medium
                       text-ink-muted transition-colors duration-fast hover:bg-sunken
                       hover:text-ink"
          >
            Export CSV
          </a>
          {!viewingSomeoneElse && (
            <AddPlayer
              sources={sources}
              defaultSource={me.default_source}
              statuses={statuses as { name: string }[]}
            />
          )}
        </div>
      </div>

      <Suspense fallback={<div className="mb-4 h-24" />}>
        <BookToolbar
          statuses={statuses.map((s) => s.name as string)}
          sources={sources}
          chips={chips}
          pageSize={filters.pageSize}
        />
      </Suspense>

      {book.rows.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<Search size={18} />}
            title="Nothing matches those filters"
            body="Try clearing a filter, or searching for part of a handle rather than the whole thing."
          />
        ) : (
          <EmptyState
            icon={<BookOpen size={18} />}
            title={viewingSomeoneElse ? "This book is empty" : "Your book is empty"}
            body={
              viewingSomeoneElse
                ? "Nothing has been added or imported for this person yet."
                : isAdmin
                  ? /* An admin's own book being empty is normal - they carry no
                       players. Saying "add your first player" here reads as
                       though the company has none, which is how an empty
                       personal book gets mistaken for lost data. */
                    "This is your personal book, and admins usually don't carry players. Use the picker above to open a rep's book, or see everyone in Admin → People."
                  : "Add your first player and they'll appear in today's queue straight away."
            }
          />
        )
      ) : (
        <Suspense fallback={<div className="h-96" />}>
          <BookTable
            rows={book.rows}
            statuses={statuses}
            timezone={me.timezone}
            attemptsThreshold={Number(attemptsRaw) || 3}
            overdueHours={Number(overdueRaw) || 24}
            page={book.page}
            pageCount={book.pageCount}
            pageSize={book.pageSize}
            total={book.total}
            team={isAdmin && team.length > 0 ? team : undefined}
          />
        </Suspense>
      )}
    </>
  );
}
