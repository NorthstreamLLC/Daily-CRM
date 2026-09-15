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

    const report = await getWagerCycleReport(monthKey, monthKey, cycleParam, owner, 100000);

    const columns = [
      { key: "username", label: "Roobet Username" },
      { key: "handle", label: "Player" },
      { key: "reference", label: "Reference" },
      { key: "owner", label: "Rep" },
      { key: "status", label: "Status" },
      { key: "code", label: "Code" },
      { key: "month", label: `Wagered ${monthLabel}` },
      { key: "cycle", label: `Wagered Leaderboard ${cycleName}` },
      { key: "allTime", label: "Wagered All Time" },
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
    }));

    const stamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(toCsv(columns, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="wager-${choice}-cycle-${cycleParam}-${stamp}.csv"`,
        "Cache-Control": "no-store",
        "X-Report-Label": `${monthLabel} and leaderboard ${cycleName}`,
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
