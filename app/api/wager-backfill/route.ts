import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/queries";

/**
 * WAGER HISTORY BACKFILL.
 *
 * Rebuilds the past from Roobet itself. For every month since the chosen start,
 * each source is queried with startDate/endDate for that month's wagering, the
 * months are summed into running totals, and a snapshot is written dated at
 * each month's end - exactly the shape the live sync produces, so the window
 * maths works on history without special cases.
 *
 * Idempotent: a month that already has a snapshot for a (player, source) pair
 * is skipped, so running it twice cannot double the history. It also cannot
 * touch live snapshots - it only ever writes at past month-ends.
 */

type Entry = { username: string; wagered: number };

type SourceRow = {
  id: string;
  name: string;
  url: string;
  api_key: string;
  auth_style: "bearer" | "header" | "query";
  header_name: string;
  query_param: string;
};

function findArray(payload: unknown, depth = 0): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (depth > 2 || !payload || typeof payload !== "object") return null;
  for (const key of ["data", "leaderboard", "entries", "results", "players", "items"]) {
    const value = (payload as Record<string, unknown>)[key];
    const found = findArray(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function readEntry(raw: unknown): Entry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const username = [r.username, r.name, r.user, r.player, r.roobet_username].find(
    (v) => typeof v === "string" && v.trim()
  ) as string | undefined;

  const wageredRaw = [
    r.weightedWagered,
    r.weighted_wagered,
    r.wagered,
    r.wager,
    r.totalWagered,
    r.total_wagered,
    r.amount,
  ].find((v) => typeof v === "number" || (typeof v === "string" && v.trim() !== ""));

  const wagered =
    typeof wageredRaw === "number"
      ? wageredRaw
      : Number(String(wageredRaw).replace(/[$,]/g, ""));

  if (!username || !Number.isFinite(wagered)) return null;
  return { username: username.trim(), wagered };
}

async function fetchWindow(
  source: SourceRow,
  startIso: string,
  endIso: string
): Promise<Entry[] | { error: string }> {
  let url = source.url;
  const headers: Record<string, string> = { Accept: "application/json" };

  if (source.auth_style === "bearer") {
    headers.Authorization = `Bearer ${source.api_key}`;
  } else if (source.auth_style === "header") {
    headers[source.header_name || "x-api-key"] = source.api_key;
  } else {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}${encodeURIComponent(source.query_param || "key")}=${encodeURIComponent(source.api_key)}`;
  }

  const sep = url.includes("?") ? "&" : "?";
  url = `${url}${sep}startDate=${encodeURIComponent(startIso)}&endDate=${encodeURIComponent(endIso)}`;

  try {
    const response = await fetch(url, { headers, cache: "no-store" });
    if (!response.ok) return { error: `answered ${response.status}` };
    const payload = await response.json();
    const rawEntries = findArray(payload);
    if (!rawEntries) return { error: "no player list in response" };
    return rawEntries.map(readEntry).filter((e): e is Entry => e !== null);
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Month boundaries in UTC: [start, end) pairs from startMonth to now. */
function monthWindows(startMonth: string): { label: string; start: Date; end: Date }[] {
  const [y, m] = startMonth.split("-").map(Number);
  const windows: { label: string; start: Date; end: Date }[] = [];
  const now = new Date();

  let cursor = Date.UTC(y, m - 1, 1);
  while (cursor < now.getTime()) {
    const d = new Date(cursor);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    windows.push({
      label: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      start: new Date(cursor),
      end: new Date(Math.min(next, now.getTime())),
    });
    cursor = next;
  }
  return windows;
}

export async function POST(request: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (me.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  let startMonth = "";
  try {
    const body = await request.json();
    startMonth = String(body.startMonth ?? "");
  } catch {
    // handled below
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth)) {
    return NextResponse.json(
      { error: "Pick the month you joined Roobet, like 2025-03." },
      { status: 400 }
    );
  }

  const windows = monthWindows(startMonth);
  if (windows.length === 0) {
    return NextResponse.json({ error: "That month is in the future." }, { status: 400 });
  }
  if (windows.length > 48) {
    return NextResponse.json(
      { error: "That is over four years of months - pick a later start." },
      { status: 400 }
    );
  }

  const supabase = createClient();

  const [{ data: sources }, { data: players }, { data: existing }] = await Promise.all([
    supabase
      .from("wager_sources")
      .select("id, name, url, api_key, auth_style, header_name, query_param")
      .eq("active", true)
      .order("name"),
    supabase
      .from("players")
      .select("id, roobet_username")
      .not("roobet_username", "is", null)
      .limit(100000),
    // Everything already written in the past - the skip list.
    supabase
      .from("wager_snapshots")
      .select("player_id, source, captured_at")
      .lt("captured_at", new Date().toISOString())
      .limit(200000),
  ]);

  if (!sources || sources.length === 0) {
    return NextResponse.json({ error: "No active sources." }, { status: 400 });
  }

  const byUsername = new Map(
    (players ?? [])
      .filter((p) => p.roobet_username?.trim())
      .map((p) => [p.roobet_username!.trim().toLowerCase(), p.id])
  );

  const alreadyThere = new Set(
    (existing ?? []).map(
      (s) => `${s.player_id}|${s.source}|${String(s.captured_at).slice(0, 7)}`
    )
  );

  // The ledger's own skip list, keyed by username instead of player.
  const { data: existingExternal } = await supabase
    .from("wager_external")
    .select("username, source, captured_at")
    .lt("captured_at", new Date().toISOString())
    .limit(300000);

  const ledgerHas = new Set(
    (existingExternal ?? []).map(
      (s) =>
        `${String(s.username).toLowerCase()}|${s.source}|${String(s.captured_at).slice(0, 7)}`
    )
  );

  const results: {
    name: string;
    months: number;
    snapshots: number;
    skipped: number;
    failedMonths: string[];
  }[] = [];

  for (const source of sources as SourceRow[]) {
    // Running totals accumulated month by month - one per matched player, and
    // one per username for the company-wide ledger.
    const cumulative = new Map<string, number>();
    const ledgerCumulative = new Map<string, { display: string; total: number }>();
    let written = 0;
    let skipped = 0;
    const failedMonths: string[] = [];

    for (const window of windows) {
      const outcome = await fetchWindow(
        source,
        window.start.toISOString(),
        window.end.toISOString()
      );

      if ("error" in outcome) {
        failedMonths.push(`${window.label} (${outcome.error})`);
        continue;
      }

      /* Store the month as a FACT. The window we just asked Roobet for is
         exactly that month, so no derivation is needed - this is what makes
         "August" correct on the first run rather than the second. */
      const monthRows = outcome
        .filter((e) => e.wagered > 0)
        .map((e) => ({
          username: e.username,
          source: source.name,
          period_type: "month",
          period_start: `${window.label}-01`,
          wagered: e.wagered,
          refreshed_at: new Date().toISOString(),
        }));

      for (let i = 0; i < monthRows.length; i += 500) {
        const { error } = await supabase
          .from("wager_periods")
          .upsert(monthRows.slice(i, i + 500), {
            onConflict: "username,source,period_type,period_start",
          });
        if (error) {
          failedMonths.push(`${window.label} (periods: ${error.message})`);
          break;
        }
        written += monthRows.length;
      }

      for (const entry of outcome) {
        if (entry.wagered <= 0) continue;

        const uname = entry.username.toLowerCase();
        const prior = ledgerCumulative.get(uname);
        ledgerCumulative.set(uname, {
          display: prior?.display ?? entry.username,
          total: (prior?.total ?? 0) + entry.wagered,
        });

        const playerId = byUsername.get(uname);
        if (!playerId) continue;
        cumulative.set(playerId, (cumulative.get(playerId) ?? 0) + entry.wagered);
      }

      // Snapshot everyone's running total at this month's end. A millisecond
      // before the boundary keeps it unambiguously inside the month.
      const capturedAt = new Date(window.end.getTime() - 1).toISOString();
      const rows: { player_id: string; wagered: number; source: string; captured_at: string }[] =
        [];

      cumulative.forEach((total, playerId) => {
        const key = `${playerId}|${source.name}|${capturedAt.slice(0, 7)}`;
        if (alreadyThere.has(key)) {
          skipped += 1;
          return;
        }
        rows.push({
          player_id: playerId,
          wagered: total,
          source: source.name,
          captured_at: capturedAt,
        });
      });

      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase.from("wager_snapshots").insert(chunk);
        if (error) {
          failedMonths.push(`${window.label} (write: ${error.message})`);
          break;
        }
        written += chunk.length;
      }

      // The ledger gets everyone, matched or not - this is where the general
      // book's history lands.
      const ledgerRows: {
        username: string;
        wagered: number;
        source: string;
        captured_at: string;
      }[] = [];

      ledgerCumulative.forEach(({ display, total }, uname) => {
        const key = `${uname}|${source.name}|${capturedAt.slice(0, 7)}`;
        if (ledgerHas.has(key)) {
          skipped += 1;
          return;
        }
        ledgerRows.push({
          username: display,
          wagered: total,
          source: source.name,
          captured_at: capturedAt,
        });
      });

      for (let i = 0; i < ledgerRows.length; i += 500) {
        const chunk = ledgerRows.slice(i, i + 500);
        const { error } = await supabase.from("wager_external").insert(chunk);
        if (error) {
          failedMonths.push(`${window.label} (ledger: ${error.message})`);
          break;
        }
        written += chunk.length;
      }
    }

    await supabase
      .from("wager_sources")
      .update({
        last_status: `Backfilled ${windows.length} months: ${written} snapshots${
          failedMonths.length ? `, ${failedMonths.length} month(s) failed` : ""
        }`,
      })
      .eq("id", source.id);

    results.push({
      name: source.name,
      months: windows.length,
      snapshots: written,
      skipped,
      failedMonths: failedMonths.slice(0, 6),
    });
  }

  await supabase.from("admin_audit").insert({
    actor_id: me.id,
    action: "wager_backfill",
    detail: { startMonth, results },
  });

  return NextResponse.json({ startMonth, months: windows.length, results });
}
