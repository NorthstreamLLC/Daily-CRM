import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/queries";
import { fetchSource, type SourceRow } from "@/lib/wager-sync";

/** Five leaderboards over a wide window takes longer than the default limit. */
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * WAGER BETWEEN ANY TWO DATES.
 *
 * Everything else on the Wager page reads stored facts, which only exist for
 * whole UTC periods - day, week, month, all time. That is deliberate: those
 * figures are exact because Roobet was asked for exactly those windows.
 *
 * An arbitrary range has no stored answer. Rather than estimate one by adding
 * up days (which would be wrong before the daily history existed, and wrong
 * again after pruning), this asks Roobet directly for the window. It is a
 * live question with a live answer - slower, and correct.
 *
 * Nothing is written. This is a report, not a sync: storing ad-hoc ranges
 * would create rows whose period_type means nothing and which no other query
 * would ever read.
 */
export async function POST(request: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (me.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  let from = "";
  let to = "";
  try {
    const body = await request.json();
    from = String(body.from ?? "");
    to = String(body.to ?? "");
  } catch {
    // handled below
  }

  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isDate(from) || !isDate(to)) {
    return NextResponse.json({ error: "Pick a start and end date." }, { status: 400 });
  }

  /* Inclusive of the end date: someone asking for the 1st to the 7th means
     the whole of the 7th, not up to midnight as it begins. UTC throughout,
     because that is what Roobet reports in. */
  const startIso = `${from}T00:00:00.000Z`;
  const endDate = new Date(`${to}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const endIso = endDate.toISOString();

  if (new Date(startIso) >= endDate) {
    return NextResponse.json({ error: "The end date is before the start." }, { status: 400 });
  }

  const supabase = createClient();

  const { data: sources } = await supabase
    .from("wager_sources")
    .select("id, name, url, api_key, auth_style, header_name, query_param")
    .eq("active", true)
    .order("name");

  if (!sources || sources.length === 0) {
    return NextResponse.json({ error: "No active wager sources." }, { status: 400 });
  }

  /* Per username, the LARGEST single code - never the sum. The same person
     appearing under two codes is the same wagering reported twice, and this
     is the rule every other wager figure in the app follows. */
  const best = new Map<string, { display: string; wagered: number; codes: Set<string> }>();
  const failed: string[] = [];

  for (const source of sources as SourceRow[]) {
    const outcome = await fetchSource(source, startIso, endIso);

    if ("error" in outcome) {
      failed.push(`${source.name}: ${outcome.error}`);
      continue;
    }

    for (const entry of outcome) {
      if (entry.wagered <= 0) continue;
      const key = entry.username.trim().toLowerCase();
      const seen = best.get(key);

      if (!seen) {
        best.set(key, {
          display: entry.username.trim(),
          wagered: entry.wagered,
          codes: new Set([source.name]),
        });
      } else {
        seen.codes.add(source.name);
        if (entry.wagered > seen.wagered) seen.wagered = entry.wagered;
      }
    }
  }

  // Attach owners, so the report says whose player this is.
  const { data: players } = await supabase
    .from("players")
    .select("id, handle, reference, roobet_username, status, owner_id")
    .not("roobet_username", "is", null)
    .limit(100000);

  const { data: users } = await supabase.from("users").select("id, name");
  const names = new Map((users ?? []).map((u) => [u.id as string, u.name as string]));

  const byUsername = new Map(
    (players ?? [])
      .filter((p) => p.roobet_username?.trim())
      .map((p) => [p.roobet_username!.trim().toLowerCase(), p])
  );

  const rows = Array.from(best.entries())
    .map(([key, v]) => {
      const player = byUsername.get(key);
      return {
        username: v.display,
        wagered: v.wagered,
        sources: Array.from(v.codes).sort().join(", "),
        playerId: player?.id ?? null,
        handle: player?.handle ?? null,
        reference: player?.reference ?? null,
        ownerName: player ? (names.get(player.owner_id) ?? null) : null,
        status: player?.status ?? null,
      };
    })
    .sort((a, b) => b.wagered - a.wagered);

  const total = rows.reduce((a, r) => a + r.wagered, 0);
  const claimed = rows.filter((r) => r.ownerName).reduce((a, r) => a + r.wagered, 0);

  return NextResponse.json({
    from,
    to,
    rows: rows.slice(0, 500),
    truncated: rows.length > 500,
    wagerers: rows.length,
    total,
    claimed,
    unclaimed: total - claimed,
    failed,
  });
}
