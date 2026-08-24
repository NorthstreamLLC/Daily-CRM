import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMe } from "@/lib/queries";
import { activeSources, fillDayGaps, findDayGaps } from "@/lib/wager-gaps";

/** Refetching a month of days across five sources is not a quick request. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * FILL IN MISSING DAYS - the button in Admin > Settings.
 *
 * Why this had to exist at all: the live sync writes today, and yesterday for
 * six hours after midnight. Nothing older. The backfill writes months. So a day
 * that had been missed had NO route back - Isac pressed Sync three times
 * waiting for 23 August to reappear and it never could have.
 *
 * The finding and filling live in lib/wager-gaps, shared with the nightly
 * watchdog. Two definitions of "what counts as a gap" would eventually
 * disagree, and then the thing meant to catch problems becomes one.
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
  const days = Math.min(Math.max(Number(body.days) || 30, 1), 120);
  /* A day below this share of the median is refetched even though it exists.
     Zero disables it, for when only true holes are wanted. */
  const partialBelow = body.partialBelow === undefined ? 0.25 : Number(body.partialBelow);

  const found = await findDayGaps(admin, days, partialBelow);
  if ("error" in found) {
    return NextResponse.json({ error: found.error }, { status: 400 });
  }

  if (found.gaps.length === 0) {
    return NextResponse.json({
      message: `No gaps in the last ${days} days.`,
      filled: [],
    });
  }

  const sources = await activeSources(admin);
  if (sources.length === 0) {
    return NextResponse.json({ error: "No active sources." }, { status: 400 });
  }

  const filled = await fillDayGaps(admin, sources, found.gaps);

  /* A day that comes back with no rows at all is not repaired - it is a day the
     API will not give us. Counting it as success is how the last version of
     this problem stayed hidden. */
  const failed = filled.filter((f) => f.errors.length > 0 || f.rows === 0).length;

  return NextResponse.json({
    message:
      `Refetched ${filled.length} day${filled.length === 1 ? "" : "s"}` +
      (failed === 0 ? "." : `, ${failed} still not recovered.`),
    filled,
  });
}
