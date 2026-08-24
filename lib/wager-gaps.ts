import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshPeriod, type SourceRow } from "@/lib/wager-sync";

/**
 * MISSING AND HALF-FINISHED DAYS - found and repaired.
 *
 * One definition, used by both the "Fill missing days" button and the nightly
 * watchdog. Written as a shared module on purpose: this codebase has already
 * had "what counts as due" written out three times and drift between them, and
 * a watchdog that disagrees with the button about what a gap is would be worse
 * than no watchdog.
 *
 * WHY GAPS HAPPEN AT ALL
 *   The live sync writes today, and yesterday for six hours after midnight.
 *   Nothing older. So a run that fails takes that day with it permanently -
 *   after midnight nothing ever asks about it again. Months, weeks and
 *   all-time repair themselves on the next run; only days cannot.
 */

export type DayGap = {
  key: string;
  start: Date;
  end: Date;
  why: "missing" | "looks partial";
};

export type GapFinding = {
  gaps: DayGap[];
  /** Days held with a total, for context in a report. */
  held: Map<string, number>;
  median: number;
};

/**
 * Which days in the last `days` are absent or suspiciously small.
 *
 * "Suspiciously small" matters as much as absent. A sync that wrote a few
 * hundred usernames and then died leaves a row that reads as a real day - 22
 * August held 8 wagerers and $938 between two days of ~190 and ~$230,000.
 * Nothing marks a row like that, which makes it more dangerous than a hole.
 */
export async function findDayGaps(
  supabase: SupabaseClient,
  days: number,
  partialBelow: number
): Promise<GapFinding | { error: string }> {
  const { data, error } = await supabase.rpc("wager_day_totals", { p_days: days });

  if (error) {
    return {
      error: /does not exist|schema cache/i.test(error.message)
        ? "Run migration 20260812000050_wager_day_totals.sql first - this needs it to know which days are held."
        : error.message,
    };
  }

  const held = new Map<string, number>(
    ((data ?? []) as { day: string; total: number }[]).map((r) => [
      String(r.day).slice(0, 10),
      Number(r.total),
    ])
  );

  const totals = Array.from(held.values())
    .filter((t) => t > 0)
    .sort((a, b) => a - b);
  const median = totals.length ? totals[Math.floor(totals.length / 2)] : 0;

  /* Yesterday backwards. Today is still running and belongs to the live sync -
     refetching it here would write a half-finished figure over a
     half-finished figure, which is motion rather than progress. */
  const todayUtc = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const gaps: DayGap[] = [];

  for (let i = 1; i <= days; i++) {
    const start = new Date(todayUtc.getTime() - i * 86_400_000);
    const key = start.toISOString().slice(0, 10);
    const end = new Date(start.getTime() + 86_400_000);
    const total = held.get(key);

    if (total === undefined) {
      gaps.push({ key, start, end, why: "missing" });
    } else if (partialBelow > 0 && median > 0 && total < median * partialBelow) {
      gaps.push({ key, start, end, why: "looks partial" });
    }
  }

  return { gaps, held, median };
}

export type FilledDay = {
  day: string;
  why: string;
  rows: number;
  errors: string[];
};

/**
 * Ask every active source for each whole UTC day.
 *
 * An explicit end date, so each is a closed fact rather than "start until
 * now" - the same shape the live sync uses for a period that has closed, which
 * is what makes these rows identical in kind to the ones written live rather
 * than a special case that has to be remembered later.
 */
export async function fillDayGaps(
  supabase: SupabaseClient,
  sources: SourceRow[],
  gaps: DayGap[]
): Promise<FilledDay[]> {
  const filled: FilledDay[] = [];

  for (const day of gaps) {
    const entry: FilledDay = { day: day.key, why: day.why, rows: 0, errors: [] };

    for (const source of sources) {
      const outcome = await refreshPeriod(supabase, source, {
        type: "day",
        start: day.start,
        key: day.key,
        end: day.end,
      });
      if ("error" in outcome) entry.errors.push(`${source.name}: ${outcome.error}`);
      else entry.rows += outcome.rows;
    }

    filled.push(entry);
  }

  return filled;
}

export async function activeSources(supabase: SupabaseClient): Promise<SourceRow[]> {
  const { data } = await supabase
    .from("wager_sources")
    .select("id, name, url, api_key, auth_style, header_name, query_param")
    .eq("active", true)
    .order("name");
  return (data ?? []) as SourceRow[];
}
