import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMe } from "@/lib/queries";
import { activeSources } from "@/lib/wager-gaps";
import {
  cycleEndUtc,
  cycleStartUtc,
  previousCycleStart,
  refreshPeriod,
  type SyncPeriod,
} from "@/lib/wager-sync";

/** Twelve cycles across several sources is a long errand, not a request. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * REFRESH THE WAGER FIGURES - the admin-only button on Stats.
 *
 * Isac's report was "for each user their 30d stats we need to show updated
 * wager, not past wager, it's not all loading in", and the suggested fix was a
 * button per row. A button per row cannot exist as such: Roobet serves a whole
 * leaderboard for a window, never one player, so fetching one name costs
 * exactly what fetching all of them costs. One button that refetches the
 * windows on screen is the same operation with a twenty-fifth of the clicks.
 *
 * What it refreshes:
 *   - the current leaderboard cycle, open, so it ends at now
 *   - the current calendar month, same
 *   - all time
 *   - and any of the last twelve cycles the database holds nothing for
 *
 * That last part is why the first press takes a while and later ones do not.
 * The cycle only became a stored period in migration 055, so on day one there
 * is a year of history to go and get; afterwards there is one live window to
 * top up.
 *
 * Runs as the service role, like the cron. The manual sync under an admin's
 * own session is what hit `canceling statement due to statement timeout` and
 * lost five days of August - upserting tens of thousands of rows with RLS
 * evaluated per row is the difference between the two.
 */
export async function POST(request: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (me.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not set." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const backfillCycles = Math.min(Math.max(Number(body.cycles) || 12, 1), 24);

  const sources = await activeSources(admin);
  if (sources.length === 0) {
    return NextResponse.json({ error: "No active sources." }, { status: 400 });
  }

  const now = new Date();
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  /* Which past cycles are already stored. A cycle with rows is left alone -
     it closed, it will not change, and refetching it would burn a minute of
     API calls to write the same numbers back. */
  const { data: held, error: heldError } = await admin.rpc("wager_cycles_held", {
    p_limit: 48,
  });

  if (heldError && /does not exist|schema cache/i.test(heldError.message)) {
    return NextResponse.json(
      {
        error:
          "Run migration 20260812000055_leaderboard_cycle.sql first - nothing " +
          "here can store a leaderboard cycle until it exists.",
      },
      { status: 400 }
    );
  }

  const haveCycle = new Set(
    ((held ?? []) as { cycle_start: string }[]).map((r) =>
      String(r.cycle_start).slice(0, 10)
    )
  );

  const thisCycle = cycleStartUtc(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  type Job = { label: string; period: SyncPeriod };
  const jobs: Job[] = [
    {
      label: `leaderboard ${ymd(thisCycle)}`,
      period: { type: "leaderboard", start: thisCycle, key: ymd(thisCycle) },
    },
    {
      label: `month ${ymd(monthStart)}`,
      period: { type: "month", start: monthStart, key: ymd(monthStart) },
    },
    {
      label: "all time",
      period: {
        type: "all",
        start: new Date("2020-01-01T00:00:00Z"),
        key: "1970-01-01",
      },
    },
  ];

  /* Past cycles, newest first, only the empty ones. Closed windows get an
     explicit end date so each is a complete fact rather than "start to now",
     which would bleed every later cycle into the one being repaired. */
  let cursor = previousCycleStart(thisCycle);
  for (let i = 0; i < backfillCycles; i++) {
    const key = ymd(cursor);
    if (!haveCycle.has(key)) {
      jobs.push({
        label: `leaderboard ${key}`,
        period: {
          type: "leaderboard",
          start: new Date(cursor),
          key,
          end: cycleEndUtc(cursor),
        },
      });
    }
    cursor = previousCycleStart(cursor);
  }

  const done: { window: string; rows: number; errors: string[] }[] = [];

  for (const job of jobs) {
    const entry = { window: job.label, rows: 0, errors: [] as string[] };
    for (const source of sources) {
      const outcome = await refreshPeriod(admin, source, job.period, now);
      if ("error" in outcome) entry.errors.push(`${source.name}: ${outcome.error}`);
      else entry.rows += outcome.rows;
    }
    done.push(entry);
  }

  /* A window that came back with nothing from every source is not refreshed,
     it is a window the API would not answer. Counting it as success is how the
     missing days of August stayed invisible for a fortnight. */
  const failed = done.filter((d) => d.errors.length > 0 || d.rows === 0);

  await admin.from("admin_audit").insert({
    actor_id: me.id,
    action: "wager_refresh",
    detail: { windows: done.length, failed: failed.length },
  });

  return NextResponse.json({
    message:
      `Refreshed ${done.length} window${done.length === 1 ? "" : "s"} from ` +
      `${sources.length} source${sources.length === 1 ? "" : "s"}` +
      (failed.length === 0 ? "." : `, ${failed.length} returned nothing.`),
    windows: done,
  });
}
