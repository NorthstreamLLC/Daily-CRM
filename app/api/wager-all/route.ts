import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMe } from "@/lib/queries";
import { activeSources, fillDayGaps, findDayGaps } from "@/lib/wager-gaps";
import {
  cycleEndUtc,
  cycleStartUtc,
  previousCycleStart,
  refreshPeriod,
  runWagerSync,
} from "@/lib/wager-sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * ONE BUTTON.
 *
 * There were four, and the difference between them was only knowable by
 * having read the code:
 *
 *   Sync now         today, this week, this month, this cycle, all time
 *   Fill missing days days the sync can no longer reach, because it only ever
 *                    writes today and briefly yesterday
 *   Refresh figures  the month, the cycle, and past cycles never fetched
 *   Backfill         months from a chosen start
 *
 * Three of those four answer "make the numbers right". Asking someone to know
 * which one applies to the symptom in front of them is asking them to debug
 * the sync before they can use it - and the failure mode is silent: press the
 * wrong one and it reports success having not touched the thing that was
 * broken. Isac pressed Sync three times waiting for 23 August to come back,
 * and it never could have.
 *
 * So this runs all three, in the order that matters most first, and reports
 * each phase separately. Backfill stays separate: it asks for a start month
 * and can rewrite a year of history, which is not a thing to do by accident.
 *
 * WHAT IT DOES NOT TOUCH, and why that is not a gap:
 *   Leads, VIP transfers, first deposits, daily tasks. None of those are
 *   synced from anywhere - they are written to activity_log at the moment the
 *   work happens. There is no external source to reconcile them against, so
 *   there is nothing a button could do. Wager is the only figure in this app
 *   that lives somewhere else and has to be fetched.
 */

/* A phase that starts at 280s will be killed mid-write. Better to skip it and
   say so than to be cut off and leave the caller guessing which parts ran. */
const BUDGET_MS = 240_000;

type Phase = {
  phase: string;
  ran: boolean;
  detail: string;
  errors: string[];
};

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
  const days = Math.min(Math.max(Number(body.days) || 30, 1), 120);
  const cycles = Math.min(Math.max(Number(body.cycles) || 12, 1), 24);

  const started = Date.now();
  const spent = () => Date.now() - started;
  const room = () => spent() < BUDGET_MS;

  const sources = await activeSources(admin);
  if (sources.length === 0) {
    return NextResponse.json({ error: "No active sources." }, { status: 400 });
  }

  const phases: Phase[] = [];

  /* ------------------------------------------------------------------ 1 */
  /* The live sync. First because it is the one that makes today correct, and
     today is what somebody is usually looking at when they press this. */
  const sync = await runWagerSync(admin, me.id, "manual");

  if ("error" in sync) {
    phases.push({
      phase: "Live sync",
      ran: true,
      detail: "failed",
      errors: [sync.error],
    });
  } else {
    const failed = sync.results.filter((r) => r.error);
    phases.push({
      phase: "Live sync",
      ran: true,
      detail:
        `${sync.results.length} source${sync.results.length === 1 ? "" : "s"}, ` +
        `${sync.periodsWritten ?? 0} period rows, ` +
        `${sync.advanced} player${sync.advanced === 1 ? "" : "s"} moved to Active`,
      errors: failed.map((r) => `${r.name}: ${r.error}`),
    });
  }

  /* ------------------------------------------------------------------ 2 */
  /* Days the sync cannot reach. After midnight nothing ever asks about
     yesterday again, so a failed run takes that day with it permanently. */
  if (room()) {
    const found = await findDayGaps(admin, days, 0.25);

    if ("error" in found) {
      phases.push({
        phase: "Missing days",
        ran: true,
        detail: "could not check",
        errors: [found.error],
      });
    } else if (found.gaps.length === 0) {
      phases.push({
        phase: "Missing days",
        ran: true,
        detail: `none in the last ${days} days`,
        errors: [],
      });
    } else {
      const filled = await fillDayGaps(admin, sources, found.gaps);
      /* A day that comes back with no rows at all is not repaired - it is a
         day the API will not give us. Counting it as success is how the last
         version of this problem stayed hidden for a fortnight. */
      const stillBad = filled.filter((f) => f.errors.length > 0 || f.rows === 0);
      phases.push({
        phase: "Missing days",
        ran: true,
        detail:
          `refetched ${filled.length}` +
          (stillBad.length ? `, ${stillBad.length} still empty` : ""),
        errors: stillBad.map(
          (f) => `${f.day}: ${f.errors[0] ?? "the API returned nothing"}`
        ),
      });
    }
  } else {
    phases.push({
      phase: "Missing days",
      ran: false,
      detail: "skipped - ran out of time",
      errors: [],
    });
  }

  /* ------------------------------------------------------------------ 3 */
  /* Leaderboard cycles never fetched. Only the empty ones: a closed cycle
     will not change, and refetching it spends a minute writing back numbers
     that were already right. */
  if (room()) {
    const { data: held, error: heldError } = await admin.rpc("wager_cycles_held", {
      p_limit: 48,
    });

    if (heldError) {
      phases.push({
        phase: "Leaderboard cycles",
        ran: true,
        detail: "could not check",
        errors: [
          /does not exist|schema cache/i.test(heldError.message)
            ? "Run migration 20260812000055_leaderboard_cycle.sql first."
            : heldError.message,
        ],
      });
    } else {
      const have = new Set(
        ((held ?? []) as { cycle_start: string }[]).map((r) =>
          String(r.cycle_start).slice(0, 10)
        )
      );

      const ymd = (d: Date) => d.toISOString().slice(0, 10);
      const missing: { key: string; start: Date; end: Date }[] = [];
      let cursor = previousCycleStart(cycleStartUtc(new Date()));

      for (let i = 0; i < cycles; i++) {
        const key = ymd(cursor);
        if (!have.has(key)) {
          missing.push({ key, start: new Date(cursor), end: cycleEndUtc(cursor) });
        }
        cursor = previousCycleStart(cursor);
      }

      let done = 0;
      const errors: string[] = [];

      for (const cycle of missing) {
        if (!room()) break;
        for (const source of sources) {
          const outcome = await refreshPeriod(admin, source, {
            type: "leaderboard",
            start: cycle.start,
            key: cycle.key,
            end: cycle.end,
          });
          if ("error" in outcome) errors.push(`${cycle.key} ${source.name}: ${outcome.error}`);
        }
        done += 1;
      }

      phases.push({
        phase: "Leaderboard cycles",
        ran: true,
        detail:
          missing.length === 0
            ? `all ${cycles} held already`
            : `filled ${done} of ${missing.length} missing` +
              (done < missing.length ? " - press again for the rest" : ""),
        errors: errors.slice(0, 6),
      });
    }
  } else {
    phases.push({
      phase: "Leaderboard cycles",
      ran: false,
      detail: "skipped - ran out of time",
      errors: [],
    });
  }

  await admin.from("admin_audit").insert({
    actor_id: me.id,
    action: "wager_sync_all",
    detail: { seconds: Math.round(spent() / 1000), phases },
  });

  const problems = phases.reduce((n, p) => n + p.errors.length, 0);

  return NextResponse.json({
    message:
      `Done in ${Math.round(spent() / 1000)}s` +
      (problems === 0 ? ", nothing outstanding." : `, ${problems} thing${problems === 1 ? "" : "s"} to look at.`),
    phases,
  });
}
