import { NextResponse } from "next/server";
import { canSeeWager, getMe } from "@/lib/queries";
import { getWagerReport, resolveReportPeriod } from "@/lib/admin";
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

  const { period, label, slug } = resolveReportPeriod(choice);

  // An admin may filter to one rep; a rep is always scoped to themselves.
  const owner = me.role === "admin" ? ownerParam || undefined : me.id;

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
