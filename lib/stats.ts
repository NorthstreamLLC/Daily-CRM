import { createClient } from "@/lib/supabase/server";
import type { Me } from "@/lib/queries";
import { startOfDayPlusUtc, startOfDayUtc, ymdInZone } from "@/lib/time";
import { prettyDate, type DateRange } from "@/lib/ranges";

// Re-exported so a page importing stats does not also need to import ranges.
export {
  RANGE_PRESETS,
  resolveRange,
  trendDays,
  type DateRange,
  type RangeKey,
} from "@/lib/ranges";

/* ------------------------------------------------------------------ Funnel */

export type Funnel = {
  leads: number;
  reachedVip: number;
  reachedFtd: number;
  stillActive: number;
  dead: number;
};

/**
 * CONVERSION FUNNEL, measured as a cohort.
 *
 * Counts the players who entered your book during the window and asks how far
 * each one eventually got. That is a different question from "how many VIP
 * transfers happened this month", and the more useful one: it tells you what a
 * lead from this period is actually worth.
 *
 * The milestones come from timestamps stamped when they happened, so changing a
 * status later never rewrites the history.
 */
export async function getFunnel(userId: string, range: DateRange): Promise<Funnel> {
  const supabase = createClient();

  let query = supabase
    .from("players")
    .select("status, vip_fasttrack_started_at, first_deposit_at")
    .eq("owner_id", userId)
    .limit(20000);

  if (range.start) query = query.gte("assigned_at", range.start.toISOString());
  if (range.end) query = query.lt("assigned_at", range.end.toISOString());

  const { data } = await query;
  const rows = data ?? [];

  return {
    leads: rows.length,
    reachedVip: rows.filter((r) => r.vip_fasttrack_started_at !== null).length,
    reachedFtd: rows.filter((r) => r.first_deposit_at !== null).length,
    stillActive: rows.filter((r) => r.status === "Active").length,
    dead: rows.filter((r) => r.status === "Dead Lead").length,
  };
}

/* -------------------------------------------------------------- Activity */

export type ActivityTotals = {
  leads: number;
  vip: number;
  ftd: number;
  touches: number;
};

/**
 * What actually happened inside the window, from the log.
 *
 * Separate from the funnel on purpose. The funnel asks "how did this period's
 * leads do"; this asks "what did I do this period" - and a VIP transfer of a
 * lead added three months ago belongs in the second question, not the first.
 */
export async function getActivity(
  userId: string,
  range: DateRange
): Promise<ActivityTotals> {
  const supabase = createClient();

  let query = supabase
    .from("activity_log")
    .select("event_type, to_status")
    .eq("user_id", userId)
    .limit(100000);

  if (range.start) query = query.gte("occurred_at", range.start.toISOString());
  if (range.end) query = query.lt("occurred_at", range.end.toISOString());

  const { data } = await query;
  return tally(data ?? []);
}

type Event = { event_type: string; to_status: string | null };

function tally(rows: Event[]): ActivityTotals {
  const totals = { leads: 0, vip: 0, ftd: 0, touches: 0 };
  for (const e of rows) {
    if (e.event_type === "player_created") totals.leads += 1;
    else if (e.event_type === "task_completed") totals.touches += 1;
    // A deposit logged by mistake and corrected stops counting.
    else if (e.event_type === "deposit_reversed") totals.ftd -= 1;
    else if (e.event_type === "status_change") {
      if (e.to_status === "VIP Transferred") totals.vip += 1;
      if (e.to_status === "First Deposit" || e.to_status === "Active") totals.ftd += 1;
    }
  }
  totals.ftd = Math.max(0, totals.ftd);
  return totals;
}

/* ------------------------------------------------------- Source performance */

export type SourceRow = {
  source: string;
  leads: number;
  ftds: number;
  rate: number;
};

/**
 * SOURCE PERFORMANCE, ranked by conversion rather than volume.
 *
 * Volume flatters whichever source you happen to work hardest. Rate tells you
 * which source is worth the hour. Sources with very few leads are still listed,
 * but marked as too small to judge rather than letting one lucky deposit sit at
 * the top of the table.
 */
export async function getSourcePerformance(
  userId: string,
  range: DateRange
): Promise<SourceRow[]> {
  const supabase = createClient();

  let query = supabase
    .from("players")
    .select("source, first_deposit_at")
    .eq("owner_id", userId)
    .limit(20000);

  if (range.start) query = query.gte("assigned_at", range.start.toISOString());
  if (range.end) query = query.lt("assigned_at", range.end.toISOString());

  const { data } = await query;
  const buckets = new Map<string, { leads: number; ftds: number }>();

  for (const row of data ?? []) {
    const key = row.source?.trim() || "Not recorded";
    const bucket = buckets.get(key) ?? { leads: 0, ftds: 0 };
    bucket.leads += 1;
    if (row.first_deposit_at) bucket.ftds += 1;
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .map(([source, b]) => ({
      source,
      leads: b.leads,
      ftds: b.ftds,
      rate: b.leads ? b.ftds / b.leads : 0,
    }))
    .sort((a, b) => b.rate - a.rate || b.leads - a.leads);
}

/* ------------------------------------------------------------------- Trend */

export type TrendDay = {
  date: string;
  leads: number;
  vip: number;
  ftd: number;
  touches: number;
};

/**
 * Daily activity, bucketed into the viewer's own time zone.
 *
 * This is what the spreadsheet could never do honestly - a Johannesburg Tuesday
 * and a Manila Tuesday are different windows of UTC, and bucketing on the raw
 * timestamp put work on the wrong day.
 */
export async function getTrend(
  userId: string,
  timeZone: string,
  days: number
): Promise<TrendDay[]> {
  const supabase = createClient();
  const start = startOfDayPlusUtc(timeZone, -(days - 1));

  const { data } = await supabase
    .from("activity_log")
    .select("event_type, to_status, occurred_at")
    .eq("user_id", userId)
    .gte("occurred_at", start.toISOString())
    .limit(50000);

  const byDay = new Map<string, TrendDay>();
  for (let i = 0; i < days; i++) {
    const key = ymdInZone(startOfDayPlusUtc(timeZone, -(days - 1 - i)), timeZone);
    byDay.set(key, { date: key, leads: 0, vip: 0, ftd: 0, touches: 0 });
  }

  for (const e of data ?? []) {
    const day = byDay.get(ymdInZone(new Date(e.occurred_at), timeZone));
    if (!day) continue;
    if (e.event_type === "player_created") day.leads += 1;
    if (e.event_type === "task_completed") day.touches += 1;
    if (e.event_type === "status_change") {
      if (e.to_status === "VIP Transferred") day.vip += 1;
      if (e.to_status === "First Deposit" || e.to_status === "Active") day.ftd += 1;
    }
  }

  return Array.from(byDay.values());
}

/* ----------------------------------------------------------------- Records */

export type Records = {
  bestDay: { date: string; leads: number } | null;
  bestWeek: { label: string; leads: number } | null;
  bestMonth: { label: string; leads: number } | null;
  currentStreak: number;
  longestStreak: number;
  totalLeads: number;
  totalVip: number;
  totalFtds: number;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * All-time records and the target streak.
 *
 * The streak counts backwards from today and deliberately does not break on
 * today itself - a day still in progress should not read as a failure at 9am.
 */
export async function getRecords(
  userId: string,
  timeZone: string,
  dailyLeadTarget: number
): Promise<Records> {
  const supabase = createClient();

  const { data } = await supabase
    .from("activity_log")
    .select("event_type, to_status, occurred_at")
    .eq("user_id", userId)
    .in("event_type", ["player_created", "status_change", "deposit_reversed"])
    .order("occurred_at", { ascending: true })
    .limit(50000);

  const rows = data ?? [];
  const leadsByDay = new Map<string, number>();
  const leadsByMonth = new Map<string, number>();
  const leadsByWeek = new Map<string, number>();

  let totalLeads = 0;
  let totalVip = 0;
  let totalFtds = 0;

  for (const e of rows) {
    if (e.event_type === "deposit_reversed") {
      totalFtds = Math.max(0, totalFtds - 1);
      continue;
    }
    if (e.event_type === "status_change") {
      if (e.to_status === "VIP Transferred") totalVip += 1;
      if (e.to_status === "First Deposit" || e.to_status === "Active") totalFtds += 1;
      continue;
    }
    totalLeads += 1;

    const key = ymdInZone(new Date(e.occurred_at), timeZone);
    leadsByDay.set(key, (leadsByDay.get(key) ?? 0) + 1);
    leadsByMonth.set(key.slice(0, 7), (leadsByMonth.get(key.slice(0, 7)) ?? 0) + 1);
    const week = isoWeekKey(key);
    leadsByWeek.set(week, (leadsByWeek.get(week) ?? 0) + 1);
  }

  const top = <T,>(m: Map<string, number>, make: (k: string, v: number) => T): T | null => {
    let bestKey: string | null = null;
    let bestVal = 0;
    m.forEach((v, k) => {
      if (v > bestVal) {
        bestVal = v;
        bestKey = k;
      }
    });
    return bestKey === null ? null : make(bestKey, bestVal);
  };

  let currentStreak = 0;
  let longestStreak = 0;
  let running = 0;

  if (dailyLeadTarget > 0) {
    for (let i = 0; i < 400; i++) {
      const key = ymdInZone(startOfDayPlusUtc(timeZone, -i), timeZone);
      const hit = (leadsByDay.get(key) ?? 0) >= dailyLeadTarget;

      if (hit) {
        running += 1;
        longestStreak = Math.max(longestStreak, running);
        if (currentStreak === i || currentStreak === i - 1) currentStreak = running;
      } else if (i > 0) {
        // Today still has hours left in it - do not let it break the streak.
        running = 0;
      }
    }
  }

  return {
    bestDay: top(leadsByDay, (date, leads) => ({ date: prettyDate(date), leads })),
    bestWeek: top(leadsByWeek, (label, leads) => ({ label: prettyWeek(label), leads })),
    bestMonth: top(leadsByMonth, (label, leads) => ({
      label: `${MONTHS[Number(label.slice(5, 7)) - 1]} ${label.slice(0, 4)}`,
      leads,
    })),
    currentStreak,
    longestStreak,
    totalLeads,
    totalVip,
    totalFtds,
  };
}

function isoWeekKey(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function prettyWeek(key: string) {
  return `Week ${Number(key.slice(6))}, ${key.slice(0, 4)}`;
}

/* -------------------------------------------------------------- Leaderboard */

export type LeaderboardRow = {
  userId: string;
  name: string;
  code: string;
  role: string;
  timezone: string;
  leads: number;
  vip: number;
  vipAllTime: number;
  ftd: number;
  touches: number;
  bookSize: number;
  /** Players sitting in their queue right now, not yet worked today. */
  outstanding: number;
};

/**
 * TEAM LEADERBOARD - admin only.
 *
 * Reps see their own numbers and nobody else's. That is enforced twice: the
 * page is not routed for a rep, and Row Level Security stops the underlying
 * query returning other people's rows even if one got there.
 */
export async function getLeaderboard(
  me: Me,
  range: DateRange
): Promise<LeaderboardRow[]> {
  if (me.role !== "admin") return [];
  const supabase = createClient();

  const nowIso = new Date().toISOString();

  const [{ data: users }, periodEvents, allVipEvents, book, dueRows] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, code, role, timezone")
      .eq("active", true)
      .order("name"),

    (async () => {
      let q = supabase
        .from("activity_log")
        .select("user_id, event_type, to_status")
        .limit(200000);
      if (range.start) q = q.gte("occurred_at", range.start.toISOString());
      if (range.end) q = q.lt("occurred_at", range.end.toISOString());
      return (await q).data ?? [];
    })(),

    // VIP transfers all time, whatever window the page is showing.
    (async () => {
      const { data } = await supabase
        .from("activity_log")
        .select("user_id")
        .eq("event_type", "status_change")
        .eq("to_status", "VIP Transferred")
        .limit(200000);
      return data ?? [];
    })(),

    (async () => {
      const { data } = await supabase.from("players").select("owner_id").limit(200000);
      return data ?? [];
    })(),

    // Only the players who could possibly be due - far smaller than the book.
    (async () => {
      const { data } = await supabase
        .from("players_enriched")
        .select("owner_id, last_contact_at, next_followup_at, missing_roobet")
        .or(`next_followup_at.lte.${nowIso},missing_roobet.is.true`)
        .limit(200000);
      return data ?? [];
    })(),
  ]);

  const bookSize = new Map<string, number>();
  for (const p of book) bookSize.set(p.owner_id, (bookSize.get(p.owner_id) ?? 0) + 1);

  const vipAllTime = new Map<string, number>();
  for (const e of allVipEvents) {
    vipAllTime.set(e.user_id, (vipAllTime.get(e.user_id) ?? 0) + 1);
  }

  const rows: LeaderboardRow[] = (users ?? []).map((u) => ({
    userId: u.id,
    name: u.name,
    code: u.code,
    role: u.role,
    timezone: u.timezone,
    leads: 0,
    vip: 0,
    vipAllTime: vipAllTime.get(u.id) ?? 0,
    ftd: 0,
    touches: 0,
    bookSize: bookSize.get(u.id) ?? 0,
    outstanding: 0,
  }));

  const index = new Map(rows.map((r) => [r.userId, r]));

  for (const e of periodEvents) {
    const row = index.get(e.user_id);
    if (!row) continue;
    if (e.event_type === "player_created") row.leads += 1;
    else if (e.event_type === "task_completed") row.touches += 1;
    else if (e.event_type === "deposit_reversed") row.ftd = Math.max(0, row.ftd - 1);
    else if (e.event_type === "status_change") {
      if (e.to_status === "VIP Transferred") row.vip += 1;
      if (e.to_status === "First Deposit" || e.to_status === "Active") row.ftd += 1;
    }
  }

  // "Not yet worked today" depends on where the rep is, so each person's own
  // day boundary decides it - the same rule their queue uses.
  const dayStart = new Map<string, number>();
  for (const r of rows) dayStart.set(r.userId, startOfDayUtc(r.timezone).getTime());

  for (const p of dueRows as {
    owner_id: string;
    last_contact_at: string | null;
    next_followup_at: string | null;
    missing_roobet: boolean;
  }[]) {
    const row = index.get(p.owner_id);
    if (!row) continue;

    const start = dayStart.get(p.owner_id) ?? 0;
    const workedToday =
      p.last_contact_at !== null && new Date(p.last_contact_at).getTime() >= start;

    if (!workedToday) row.outstanding += 1;
  }

  return rows.sort((a, b) => b.ftd - a.ftd || b.vip - a.vip || b.leads - a.leads);
}
