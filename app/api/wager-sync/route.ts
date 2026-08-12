import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/queries";
import { runWagerSync } from "@/lib/wager-sync";

/** Syncing five leaderboards takes longer than the default serverless limit. */
export const maxDuration = 300;

/**
 * Manual wager sync - the button in Admin > Settings.
 *
 * Runs the same core as the hourly cron, under the signed-in admin's session,
 * so Row Level Security still applies to every write.
 */
export async function POST() {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (me.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const outcome = await runWagerSync(createClient(), me.id, "manual");

  if ("error" in outcome) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }
  return NextResponse.json(outcome);
}
