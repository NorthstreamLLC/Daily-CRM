import { NextResponse } from "next/server";
import { getMe } from "@/lib/queries";
import { getWagerReport } from "@/lib/admin";
import { toCsv, type Row } from "@/lib/csv";

/**
 * WAGER REPORT AS CSV.
 *
 * The weekly and monthly review, downloadable. Row Level Security scopes the
 * underlying query, so a rep exporting this gets their own players and an
 * admin gets everyone - the URL cannot widen it.
 */

const COLUMNS = [
  { key: "reference", label: "Reference" },
  { key: "handle", label: "Player" },
  { key: "roobet", label: "Roobet Username" },
  { key: "owner", label: "Rep" },
  { key: "status", label: "Status" },
  { key: "window", label: "Wagered In Period" },
  { key: "allTime", label: "Wagered All Time" },
];

export async function GET(request: Request) {
  const me = await getMe();
  if (!me) return new NextResponse("Not signed in", { status: 401 });

  const url = new URL(request.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const label = url.searchParams.get("label") ?? "period";

  const start = fromRaw ? new Date(fromRaw) : null;
  const end = toRaw ? new Date(toRaw) : null;

  if ((start && isNaN(start.getTime())) || (end && isNaN(end.getTime()))) {
    return new NextResponse("Bad date range", { status: 400 });
  }

  // A rep is pinned to their own players whatever the URL says.
  const report = await getWagerReport(
    start,
    end,
    me.role === "admin" ? undefined : me.id
  );

  const rows: Row[] = report.rows.map((r) => ({
    reference: r.reference,
    handle: r.handle,
    roobet: r.roobetUsername ?? "",
    owner: r.ownerName,
    status: r.status,
    window: r.windowWager.toFixed(2),
    allTime: r.allTime.toFixed(2),
  }));

  const stamp = new Date().toISOString().slice(0, 10);
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return new NextResponse(toCsv(COLUMNS, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wager-${slug}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
