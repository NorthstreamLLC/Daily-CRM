import { NextResponse } from "next/server";
import { canSeeWager, getMe } from "@/lib/queries";
import {
  currentCycle,
  getWagerCycleReport,
  getWagerReport,
  resolveReportPeriod,
} from "@/lib/admin";
import { cycleLabel } from "@/lib/wager-sync";
import { toCsv, type Row } from "@/lib/csv";

/**
 * WAGER REPORT AS CSV.
 *
 * Every wagerer for a period, not just the ones in a book. A username nobody
 * owns exports with a blank rep rather than being dropped - it is still money
 * that arrived on our codes, and leaving it out of the export was how the
 * spreadsheet totals stopped matching the affiliate panel.
 *
 * Periods only, no arbitrary dates: Roobet is asked for whole UTC windows, so
 * those are the windows that can be answered as fact rather than estimated.
 *
 * A rep is pinned to their own players whatever the URL says.
 */

const COLUMNS = [
  { key: "username", label: "Roobet Username" },
  { key: "reference", label: "Reference" },
  { key: "handle", label: "Player" },
  { key: "owner", label: "Rep" },
  { key: "status", label: "Status" },
  { key: "code", label: "Code" },
  { key: "period", label: "Wagered In Period" },
  { key: "allTime", label: "Wagered All Time" },
];

export async function GET(request: Request) {
  const me = await getMe();
  if (!me) return new NextResponse("Not signed in", { status: 401 });

  /* Refused here, not merely hidden in the interface.

     Hiding the export button while the endpoint still serves the CSV is not a
     rule, it is a suggestion - and this URL is guessable. */
  if (!(await canSeeWager(me))) {
    return new NextResponse("Wager figures are not available to your account.", {
      status: 403,
    });
  }

  const url = new URL(request.url);
  const choice = url.searchParams.get("period") ?? "all";
  const ownerParam = url.searchParams.get("owner") ?? "";
  const cycleParam = url.searchParams.get("cycle") ?? "";

  const { period, label, slug } = resolveReportPeriod(choice);

  // An admin may filter to one rep; a rep is always scoped to themselves.
  const owner = me.role === "admin" ? ownerParam || undefined : me.id;

  /* THE STATS EXPORT: the same two windows the table on screen is showing.

     This is what Isac meant by "export this set of values, not EVERYTHING".
     The old Export link passed from/to/label - three parameters this route has
     never read - so it silently fell through to the default and produced
     all-time wager for every rep in the company. The button said Export CSV
     next to one rep's month and delivered the entire book's lifetime. Nothing
     in the file said which window it covered, either, so the mismatch was only
     findable by adding the numbers up.

     The presence of `cycle` is what distinguishes this from the admin Wager
     page's single-window export, which still works exactly as it did. */
  if (/^\d{4}-\d{2}-\d{2}$/.test(cycleParam) && /^\d{4}-\d{2}$/.test(choice)) {
    const monthKey = `${choice}-01`;
    const monthLabel = new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${monthKey}T12:00:00Z`));
    const cycleName = cycleLabel(new Date(`${cycleParam}T00:00:00Z`));

    /* A CSV cell may hold any Unicode; an HTTP HEADER may not.

       cycleLabel writes "16 Aug – 15 Sept" with an EN DASH, and Node refuses
       to set a header containing a character outside Latin-1 - it throws
       ERR_INVALID_CHAR, which surfaces as a 500 with no body. So the download
       failed for a reason that had nothing to do with the data, the query or
       the permissions: one punctuation mark in a header nobody reads.

       Kept rather than deleted, because it is genuinely useful when a file is
       already sitting in Downloads and its window is in doubt. Flattened to
       ASCII, which a header can carry. */
    const headerSafe = (s: string) =>
      s.replace(/[‒-―−]/g, "-").replace(/[^\x20-\x7E]/g, "");

    let report;
    try {
      report = await getWagerCycleReport(monthKey, monthKey, cycleParam, owner, 100000);
    } catch (e) {
      /* An export that fails should say so in words. A bare 500 on a link
         click looks like the button is broken rather than the query. */
      return new NextResponse(`Could not build the export: ${(e as Error).message}`, {
        status: 500,
      });
    }

    /* Column order mirrors the table on screen, because the export is meant to
       BE the table - a file whose columns arrive in a different order than the
       page they were exported from is a file people re-sort by hand. */
    const columns = [
      { key: "handle", label: "Player" },
      { key: "username", label: "Roobet Username" },
      { key: "reference", label: "Reference" },
      { key: "owner", label: "Rep" },
      { key: "status", label: "Status" },
      { key: "code", label: "Code" },
      { key: "month", label: `Wagered ${monthLabel}` },
      { key: "cycle", label: `Wagered Leaderboard ${cycleName}` },
      { key: "allTime", label: "Wagered All Time" },
      /* Last column, but it is the one to sort by first: marked as playing,
         never reported by Roobet. A spreadsheet of money should say which of
         its rows are money that never arrived. */
      { key: "flag", label: "Never Wagered" },
    ];

    const rows: Row[] = report.rows.map((r) => ({
      username: r.username,
      handle: r.handle ?? "",
      reference: r.reference ?? "",
      owner: r.ownerName ?? "",
      status: r.status ?? "",
      code: r.sources ?? "",
      month: r.monthWagered.toFixed(2),
      cycle: r.cycleWagered.toFixed(2),
      allTime: r.allTime.toFixed(2),
      flag: r.neverWagered ? "YES" : "",
    }));

    const stamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(toCsv(columns, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="wager-${choice}-cycle-${cycleParam}-${stamp}.csv"`,
        "Cache-Control": "no-store",
        "X-Report-Label": headerSafe(`${monthLabel} and leaderboard ${cycleName}`),
      },
    });
  }

  const report = await getWagerReport(period, owner, 100000);

  const rows: Row[] = report.rows.map((r) => ({
    username: r.username,
    reference: r.reference ?? "",
    handle: r.handle ?? "",
    owner: r.ownerName ?? "",
    status: r.status ?? "",
    code: r.sources ?? "",
    period: r.wagered.toFixed(2),
    allTime: r.allTime.toFixed(2),
  }));

  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(toCsv(COLUMNS, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wager-${slug}-${stamp}.csv"`,
      "Cache-Control": "no-store",
      // Not sensitive, but it is a full book export - keep it out of caches.
      "X-Report-Label": label,
    },
  });
}
