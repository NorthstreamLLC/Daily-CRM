import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activeSources, fillDayGaps, findDayGaps } from "@/lib/wager-gaps";
import {
  cycleEndUtc,
  cycleStartUtc,
  previousCycleStart,
  refreshPeriod,
} from "@/lib/wager-sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * NIGHTLY WATCHDOG - repair what it can, report what it cannot.
 *
 * WHY
 *   Five days of August went missing and nobody noticed for a fortnight. Not
 *   because the app hid it badly - because nothing looked. The wager page tells
 *   you about gaps only if somebody opens the wager page, and the person most
 *   likely to notice is a rep querying their commission, which is the worst
 *   possible way to find out.
 *
 * REPAIR FIRST, ALERT SECOND
 *   It refetches every gap before deciding whether to say anything. An alert
 *   about something already fixable is noise, and a channel that mostly carries
 *   noise is a channel nobody reads - at which point the watchdog has the same
 *   problem as the page it was built to cover.
 *
 *   So: silence means healthy OR quietly repaired. A notification means
 *   somebody has to do something, which is the only thing worth interrupting
 *   for.
 *
 * THIRTY DAYS, not seven
 *   It used to look back a week, reasoning that a weekend outage would be
 *   caught and a longer window would make the nightly run expensive. Both
 *   halves were wrong. Finding gaps is one cheap aggregate whatever the
 *   window; only FILLING costs anything, and in the normal case there is
 *   nothing to fill. Meanwhile a gap that survived seven nights became
 *   permanent, silently, which is the exact failure this exists to prevent -
 *   and it left two different definitions of "recent" between the watchdog
 *   and the button beside it.
 *
 *   The cost is bounded by MAX_FILL instead: a catastrophic run of missing
 *   days repairs ten a night rather than timing out mid-write and repairing
 *   none. Three bad weeks heal in three nights without anybody watching.
 */
const MAX_FILL = 10;
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set, so the watchdog is disabled." },
      { status: 503 }
    );
  }

  const provided = (request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (provided !== secret) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not set." },
      { status: 503 }
    );
  }

  const found = await findDayGaps(admin, 30, 0.25);
  if ("error" in found) {
    await notifyAdmins(admin, "Wager watchdog could not run", found.error);
    return NextResponse.json({ error: found.error }, { status: 400 });
  }

  const sources = await activeSources(admin);

  /* The cycle check runs whether or not there are day gaps - they fail
     independently. A 12-hour outage across the 16th loses a whole leaderboard
     cycle while every day around it stays perfectly intact, and that is the
     figure commission is argued over. */
  const cycleNote = sources.length > 0 ? await repairCycles(admin, sources) : null;

  if (found.gaps.length === 0) {
    return NextResponse.json({
      message: "No gaps in the last 30 days.",
      cycles: cycleNote,
    });
  }

  if (sources.length === 0) {
    await notifyAdmins(
      admin,
      "Wager data has gaps and no sources are active",
      `${found.gaps.length} day(s) are missing and there is nothing to fetch them from.`
    );
    return NextResponse.json({ error: "No active sources." }, { status: 400 });
  }

  /* Newest first, capped. If there are more than MAX_FILL the rest wait for
     tomorrow night - recent days matter most and a partial repair that
     completes beats a full one that gets killed halfway. */
  const batch = found.gaps.slice(0, MAX_FILL);
  const deferred = found.gaps.length - batch.length;

  const filled = await fillDayGaps(admin, sources, batch);

  /* Repaired means a row now exists AND has something in it. A day that comes
     back with zero rows from every source is not repaired - it is a day the
     API will not give us, which is exactly the case worth telling somebody
     about rather than counting as a win. */
  const stillBroken = filled.filter((f) => f.errors.length > 0 || f.rows === 0);
  const repaired = filled.length - stillBroken.length;

  if (stillBroken.length > 0) {
    const lines = stillBroken.map(
      (f) =>
        `${f.day} (${f.why}) — ${
          f.errors.length > 0 ? f.errors.join("; ") : "no data returned by any source"
        }`
    );
    await notifyAdmins(
      admin,
      `Wager data: ${stillBroken.length} day${stillBroken.length === 1 ? "" : "s"} could not be recovered`,
      [
        ...lines,
        repaired > 0 ? `${repaired} other day(s) were repaired automatically.` : "",
        "Admin → Settings → Fill missing days to retry by hand.",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return NextResponse.json({
    checked: 30,
    found: found.gaps.length,
    attempted: batch.length,
    deferredToTomorrow: deferred,
    repaired,
    stillBroken: stillBroken.map((f) => f.day),
    cycles: cycleNote,
  });
}

/**
 * Leaderboard cycles that were never fetched.
 *
 * The live sync writes the current cycle every half hour and tops up the one
 * that just closed for twelve hours after the 16th. That covers everything
 * except an outage spanning the rollover - and a cycle lost that way is lost
 * for good, because after the grace window nothing asks about it again. Same
 * shape of hole as the missing days, so it gets the same nightly check.
 *
 * Only the last three, and only empty ones. Anything older is history the
 * "Sync everything" button fills on demand; refetching a closed cycle that is
 * already stored spends a minute writing back numbers that were already right.
 */
async function repairCycles(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  sources: Awaited<ReturnType<typeof activeSources>>
): Promise<string> {
  const { data, error } = await admin.rpc("wager_cycles_held", { p_limit: 12 });
  if (error) return `not checked: ${error.message}`;

  const have = new Set(
    ((data ?? []) as { cycle_start: string }[]).map((r) =>
      String(r.cycle_start).slice(0, 10)
    )
  );

  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  let cursor = cycleStartUtc(new Date());
  const missing: { key: string; start: Date; end: Date }[] = [];

  for (let i = 0; i < 3; i++) {
    const key = ymd(cursor);
    if (!have.has(key)) {
      missing.push({
        key,
        start: new Date(cursor),
        /* The live cycle has no end - it is still running, so it is asked for
           as "start until now" exactly like the live sync asks. Only closed
           cycles get a boundary. */
        end: i === 0 ? new Date() : cycleEndUtc(cursor),
      });
    }
    cursor = previousCycleStart(cursor);
  }

  if (missing.length === 0) return "all three recent cycles held";

  let repaired = 0;
  for (const cycle of missing) {
    let rows = 0;
    for (const source of sources) {
      const outcome = await refreshPeriod(admin, source, {
        type: "leaderboard",
        start: cycle.start,
        key: cycle.key,
        end: cycle.end,
      });
      if (!("error" in outcome)) rows += outcome.rows;
    }
    if (rows > 0) repaired += 1;
  }

  return `${repaired} of ${missing.length} missing cycle(s) recovered`;
}

/**
 * Tell every active admin, once.
 *
 * Failures here are swallowed deliberately: the repair above is the valuable
 * half, and losing it because a notification row would not insert would be
 * trading the work for the announcement of the work.
 */
async function notifyAdmins(
  admin: ReturnType<typeof createAdminClient>,
  title: string,
  body: string
): Promise<void> {
  if (!admin) return;

  const { data: admins } = await admin
    .from("users")
    .select("id")
    .eq("role", "admin")
    .eq("active", true);

  if (!admins || admins.length === 0) return;

  /* Not again if the same title is already sitting unread. The gap does not
     get worse by being reported nightly, and an alert that repeats itself
     every day is one people learn to dismiss without reading. */
  const { data: existing } = await admin
    .from("notifications")
    .select("user_id")
    .eq("kind", "system")
    .eq("title", title)
    .is("read_at", null);

  const alreadyTold = new Set((existing ?? []).map((n) => n.user_id as string));
  const rows = admins
    .filter((a) => !alreadyTold.has(a.id as string))
    .map((a) => ({ user_id: a.id, kind: "system", title, body }));

  if (rows.length > 0) await admin.from("notifications").insert(rows);
}

export const GET = handle;
export const POST = handle;
