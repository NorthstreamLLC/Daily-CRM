import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activeSources, fillDayGaps, findDayGaps } from "@/lib/wager-gaps";

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
 * SEVEN DAYS, not thirty
 *   Long enough that a weekend outage is caught, short enough that one stuck
 *   source cannot make this run for minutes every night. The button covers
 *   thirty when a human is asking.
 */
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

  const found = await findDayGaps(admin, 7, 0.25);
  if ("error" in found) {
    await notifyAdmins(admin, "Wager watchdog could not run", found.error);
    return NextResponse.json({ error: found.error }, { status: 400 });
  }

  if (found.gaps.length === 0) {
    return NextResponse.json({ message: "No gaps in the last 7 days." });
  }

  const sources = await activeSources(admin);
  if (sources.length === 0) {
    await notifyAdmins(
      admin,
      "Wager data has gaps and no sources are active",
      `${found.gaps.length} day(s) are missing and there is nothing to fetch them from.`
    );
    return NextResponse.json({ error: "No active sources." }, { status: 400 });
  }

  const filled = await fillDayGaps(admin, sources, found.gaps);

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
    checked: 7,
    found: found.gaps.length,
    repaired,
    stillBroken: stillBroken.map((f) => f.day),
  });
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
