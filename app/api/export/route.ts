import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/queries";
import { toCsv, type Row } from "@/lib/csv";

/**
 * CSV EXPORT.
 *
 * Reps can export their own book. Admins can export anyone's, or the whole
 * company. The scope is decided here from the signed-in person's role rather
 * than from the request, and the underlying query still runs through Row Level
 * Security - a rep asking for someone else's book gets their own back, not an
 * error and not somebody else's data.
 */

const COLUMNS = [
  { key: "reference", label: "Reference" },
  { key: "handle", label: "Handle" },
  { key: "roobet_username", label: "Roobet Username" },
  { key: "status", label: "Status" },
  { key: "source", label: "Source" },
  { key: "kyc_status", label: "KYC Status" },
  { key: "deposit_status", label: "Deposit Status" },
  { key: "assigned_at", label: "Assigned At" },
  { key: "last_contact_at", label: "Last Contact At" },
  { key: "next_followup_at", label: "Next Follow-Up At" },
  { key: "first_deposit_at", label: "First Deposit At" },
  { key: "followup_attempts", label: "Follow-Up Attempts" },
  { key: "owner", label: "Owner" },
  { key: "notes", label: "Notes" },
];

/** ISO date only. Round-trips back through the importer without ambiguity. */
function isoDate(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

/** Supabase cannot infer a shape for a view, so the result is named here. */
type ExportRow = {
  reference: string | null;
  handle: string | null;
  roobet_username: string | null;
  status: string | null;
  source: string | null;
  kyc_status: string | null;
  deposit_status: string | null;
  assigned_at: string | null;
  last_contact_at: string | null;
  next_followup_at: string | null;
  first_deposit_at: string | null;
  followup_attempts: number | null;
  notes: string | null;
  owner_id: string;
};

export async function GET(request: Request) {
  const me = await getMe();
  if (!me) return new NextResponse("Not signed in", { status: 401 });

  const url = new URL(request.url);
  const requestedOwner = url.searchParams.get("owner") ?? "";
  const scope = url.searchParams.get("scope") ?? "";

  const supabase = createClient();

  let query = supabase
    .from("players_enriched")
    .select(
      "reference, handle, roobet_username, status, source, kyc_status, deposit_status, " +
        "assigned_at, last_contact_at, next_followup_at, first_deposit_at, " +
        "followup_attempts, notes, owner_id"
    )
    .order("reference")
    .limit(50000);

  // A rep is pinned to their own book whatever the URL says.
  if (me.role !== "admin") {
    query = query.eq("owner_id", me.id);
  } else if (scope !== "company") {
    query = query.eq("owner_id", requestedOwner || me.id);
  }

  const [{ data, error }, { data: users }] = await Promise.all([
    query,
    supabase.from("users").select("id, name"),
  ]);

  if (error) return new NextResponse(error.message, { status: 500 });

  const names = new Map((users ?? []).map((u) => [u.id as string, u.name as string]));

  const rows: Row[] = ((data ?? []) as unknown as ExportRow[]).map((p) => ({
    reference: p.reference ?? "",
    handle: p.handle ?? "",
    roobet_username: p.roobet_username ?? "",
    status: p.status ?? "",
    source: p.source ?? "",
    kyc_status: p.kyc_status ?? "",
    deposit_status: p.deposit_status ?? "",
    assigned_at: isoDate(p.assigned_at),
    last_contact_at: isoDate(p.last_contact_at),
    next_followup_at: isoDate(p.next_followup_at),
    first_deposit_at: isoDate(p.first_deposit_at),
    followup_attempts: String(p.followup_attempts ?? 0),
    owner: names.get(p.owner_id) ?? "",
    notes: p.notes ?? "",
  }));

  const stamp = new Date().toISOString().slice(0, 10);
  const who =
    me.role === "admin" && scope === "company"
      ? "company"
      : (names.get(requestedOwner || me.id) ?? me.name).toLowerCase().replace(/\s+/g, "-");

  return new NextResponse(toCsv(COLUMNS, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="daily-gamba-${who}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
