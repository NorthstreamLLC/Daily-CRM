import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMe } from "@/lib/queries";
import { runWagerSync } from "@/lib/wager-sync";

/** Syncing five leaderboards takes longer than the default serverless limit. */
export const maxDuration = 300;

/**
 * Manual wager sync - the button in Admin > Settings.
 *
 * SERVICE ROLE, same as the cron. This used to run under the signed-in admin's
 * session, with a comment claiming that was the careful choice because "Row
 * Level Security still applies to every write". It was the bug.
 *
 * wager_periods has a policy letting a rep read their own players' figures:
 *
 *   exists (select 1 from players
 *            where lower(btrim(roobet_username)) = lower(btrim(wager_periods.username))
 *              and owner_id = auth.uid())
 *
 * Postgres evaluates that for every row an upsert touches. lower(btrim(..)) on
 * both sides means no index can serve it, so each row scans 1,500 players -
 * times thousands of rows, times every period. The result was
 * "periods: canceling statement due to statement timeout" on the largest
 * source, no wager_periods rows written for that day, and a day simply missing
 * from the wager page. Five days of August vanished this way.
 *
 * The permission check that matters happens above, in this route: admins only.
 * Re-checking it 40,000 times inside the database bought nothing and cost the
 * data.
 *
 * The rep-facing read policy still applies to reps. It is only the sync, which
 * is already gated, that stops paying for it.
 */
export async function POST() {
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

  const outcome = await runWagerSync(admin, me.id, "manual");

  if ("error" in outcome) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }
  return NextResponse.json(outcome);
}
