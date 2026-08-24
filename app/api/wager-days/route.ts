import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMe } from "@/lib/queries";
import { refreshPeriod, type SourceRow } from "@/lib/wager-sync";

/** Refetching a fortnight of days across five sources is not a quick request. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * FILL IN MISSING DAYS.
 *
 * Why this had to exist at all:
 *
 *   The live sync writes today, and yesterday for six hours after midnight
 *   (currentPeriods). Nothing older. The backfill writes period_type 'month'
 *   and only month-ends. So between them, there was NO way to produce a day
 *   that had been missed - and five days of August had been.
 *
 *   Isac resynced three times waiting for the 23rd to appear. It never could
 *   have. That is worse than a bug: the button that looks like it should fix it
 *   silently cannot, and nothing says so.
 *
 * What it does:
 *
 *   Finds which days are missing between the oldest day held and yesterday,
 *   then asks each source for exactly that UTC day - the same whole-period
 *   question the live sync asks, so the rows it writes are identical in kind.
 *
 *   Today is deliberately excluded: it is still running, the live sync owns it,
 *   and overwriting it here with a partial figure would be the same class of
 *   mistake this is fixing.
 *
 * Also refetches days that look PARTIAL - a sync that started, wrote some
 * usernames and died leaves a row that reads as real. 22 August held 8 wagerers
 * and $938 sitting between two days of ~190 and ~$230,000. A row that is wrong
 * is more dangerous than a row that is missing, because nothing marks it.
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
  /* A day whose total is below this share of the median gets refetched even
     though it exists. Zero disables it, for when only true gaps are wanted. */
  const partialBelow = body.partialBelow === undefined ? 0.25 : Number(body.partialBelow);

  const { data: sources } = await admin
    .from("wager_sources")
    .select("id, name, url, api_key, auth_style, header_name, query_param")
    .eq("active", true)
    .order("name");

  if (!sources || sources.length === 0) {
    return NextResponse.json({ error: "No active sources." }, { status: 400 });
  }

  /* What is already held. Grouped in the database rather than counted here -
     one row per day is a handful of rows, where the raw table is tens of
     thousands. */
  const { data: held } = await admin.rpc("wager_day_totals", { p_days: days });
  const byDay = new Map<string, number>(
    ((held ?? []) as { day: string; total: number }[]).map((r) => [
      String(r.day).slice(0, 10),
      Number(r.total),
    ])
  );

  const totals = Array.from(byDay.values()).filter((t) => t > 0).sort((a, b) => a - b);
  const median = totals.length ? totals[Math.floor(totals.length / 2)] : 0;

  /* Yesterday backwards. Today belongs to the live sync. */
  const todayUtc = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const wanted: { key: string; start: Date; end: Date; why: string }[] = [];

  for (let i = 1; i <= days; i++) {
    const start = new Date(todayUtc.getTime() - i * 86_400_000);
    const key = start.toISOString().slice(0, 10);
    const end = new Date(start.getTime() + 86_400_000);
    const total = byDay.get(key);

    if (total === undefined) {
      wanted.push({ key, start, end, why: "missing" });
    } else if (partialBelow > 0 && median > 0 && total < median * partialBelow) {
      wanted.push({ key, start, end, why: "looks partial" });
    }
  }

  if (wanted.length === 0) {
    return NextResponse.json({
      message: `No gaps in the last ${days} days.`,
      filled: [],
    });
  }

  const filled: { day: string; why: string; rows: number; errors: string[] }[] = [];

  for (const day of wanted) {
    const entry = { day: day.key, why: day.why, rows: 0, errors: [] as string[] };

    for (const source of sources as SourceRow[]) {
      /* An explicit end, so this is a closed whole-day fact rather than
         "start until now" - the same shape the live sync uses for a period
         that has already closed. */
      const outcome = await refreshPeriod(
        admin,
        source,
        { type: "day", start: day.start, key: day.key, end: day.end }
      );
      if ("error" in outcome) entry.errors.push(`${source.name}: ${outcome.error}`);
      else entry.rows += outcome.rows;
    }

    filled.push(entry);
  }

  const good = filled.filter((f) => f.errors.length === 0).length;
  return NextResponse.json({
    message:
      `Refetched ${filled.length} day${filled.length === 1 ? "" : "s"}` +
      (good === filled.length ? "." : `, ${filled.length - good} with errors.`),
    filled,
  });
}
