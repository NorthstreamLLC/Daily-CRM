import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/queries";
import { runWagerSync } from "@/lib/wager-sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * KEEP-FRESH SYNC.
 *
 * The scheduled cron is the real engine, but it only exists once the site is
 * deployed - and on some hosting plans it runs far less often than every half
 * hour. This is the safety net: whenever an admin has the Wager page open, it
 * quietly checks how old the data is and syncs if it has gone stale.
 *
 * Three things keep it from becoming a load problem:
 *
 *   It does nothing unless the newest source is older than the staleness
 *   window, so a page refresh five seconds later is free.
 *
 *   It claims the work first by stamping last_synced_at, so two admins with
 *   the page open cannot both start a sync against the same window.
 *
 *   It is admin-only and session-authenticated, so it is not an open endpoint
 *   that could be used to hammer Roobet with the account's keys.
 */

/** How stale the data may get before this route steps in. */
const STALE_MINUTES = 20;

export async function POST() {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (me.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const supabase = createClient();

  const { data: sources } = await supabase
    .from("wager_sources")
    .select("id, last_synced_at")
    .eq("active", true);

  if (!sources || sources.length === 0) {
    return NextResponse.json({ ran: false, reason: "no-sources" });
  }

  const newest = sources
    .map((s) => (s.last_synced_at ? new Date(s.last_synced_at).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);

  const ageMinutes = newest === 0 ? Infinity : (Date.now() - newest) / 60000;

  if (ageMinutes < STALE_MINUTES) {
    return NextResponse.json({
      ran: false,
      reason: "fresh",
      ageMinutes: Math.round(ageMinutes),
    });
  }

  /* Claim the window before doing the work. If another tab got here first its
     stamp is already newer than ours, and the guard above will turn that tab
     away on its next check. */
  const claimedAt = new Date().toISOString();
  await supabase
    .from("wager_sources")
    .update({ last_synced_at: claimedAt })
    .eq("active", true)
    .or(`last_synced_at.is.null,last_synced_at.lt.${new Date(Date.now() - STALE_MINUTES * 60000).toISOString()}`);

  const outcome = await runWagerSync(supabase, me.id, "auto");

  if ("error" in outcome) {
    return NextResponse.json({ ran: true, error: outcome.error });
  }

  return NextResponse.json({
    ran: true,
    advanced: outcome.advanced,
    sources: outcome.results.map((r) => ({
      name: r.name,
      entries: r.entries,
      matched: r.matched,
      error: r.error ?? null,
    })),
  });
}
