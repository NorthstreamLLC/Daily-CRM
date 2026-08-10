import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BookToolbar, type Chip } from "./BookToolbar";
import { BookTable } from "./BookTable";
import { AddPlayer } from "../today/AddPlayer";
import { EmptyState } from "@/components/ui";
import { BookOpen, Search } from "@/components/icons";
import { getBook, getBookCounts, type BookFilters, type BookSort } from "@/lib/book";
import { getMe, getSetting, getSources, getStatuses } from "@/lib/queries";

export const dynamic = "force-dynamic";

const SORTS: BookSort[] = [
  "handle",
  "reference",
  "status",
  "source",
  "assigned_at",
  "last_contact_at",
  "next_followup_at",
];

/**
 * THE BOOK.
 *
 * Filters arrive as URL parameters and are validated here rather than trusted -
 * a sort column is checked against a fixed list before it reaches the database,
 * so a hand-edited URL cannot turn into an unexpected query.
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

  const requestedSort = one("sort") as BookSort;
  const filters: BookFilters = {
    q: one("q"),
    status: one("status"),
    source: one("source"),
    flag: one("flag"),
    sort: SORTS.includes(requestedSort) ? requestedSort : "last_contact_at",
    dir: one("dir") === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(one("page")) || 1),
  };

  const [attemptsRaw, overdueRaw] = await Promise.all([
    getSetting("followup_attempts_before_dead", "3"),
    getSetting("overdue_highlight_hours", "24"),
  ]);

  const [book, counts, statuses, sources] = await Promise.all([
    getBook(me, filters),
    getBookCounts(me),
    getStatuses(),
    getSources(),
  ]);

  const chips: Chip[] = [
    { key: "missing_roobet", label: "No Roobet username", count: counts.missingRoobet },
    { key: "overdue", label: "Overdue", count: counts.overdue },
    { key: "ftd", label: "Deposited", count: counts.ftd },
    { key: "dead", label: "Dead leads", count: counts.dead },
  ];

  const filtered = Boolean(filters.q || filters.status || filters.source || filters.flag);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold tracking-tight text-ink">Book</h1>
          <p className="mt-0.5 text-body text-ink-muted">
            Everyone you own — {counts.all.toLocaleString()}{" "}
            {counts.all === 1 ? "player" : "players"}. Nothing is hidden here, and every
            field is editable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/export"
            className="inline-flex h-9 items-center gap-1.5 rounded-control border
                       border-line-strong bg-surface px-3.5 text-body font-medium
                       text-ink-muted transition-colors duration-fast hover:bg-sunken
                       hover:text-ink"
          >
            Export CSV
          </a>
          <AddPlayer sources={sources} defaultSource={me.default_source} />
        </div>
      </div>

      <Suspense fallback={<div className="mb-4 h-24" />}>
        <BookToolbar
          statuses={statuses.map((s) => s.name as string)}
          sources={sources}
          chips={chips}
        />
      </Suspense>

      {book.rows.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<Search size={18} />}
            title="Nothing matches those filters"
            body="Try clearing a filter or searching for part of a handle instead of the whole thing."
          />
        ) : (
          <EmptyState
            icon={<BookOpen size={18} />}
            title="Your book is empty"
            body="Add your first player and they'll appear in today's queue straight away."
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
            total={book.total}
          />
        </Suspense>
      )}
    </>
  );
}
