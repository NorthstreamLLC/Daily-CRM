import { createClient } from "@/lib/supabase/server";
import type { Me } from "@/lib/queries";
import { startOfDayPlusUtc, ymdInZone } from "@/lib/time";

export type Period = "7d" | "30d" | "90d" | "mtd" | "all";

export const PERIOD_LABEL: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  mtd: "This month",
  all: "All time",
};

/** Resolves a period to a UTC start instant using the viewer's own day boundary. */
export function periodStart(period: Period, timeZone: string): Date | null {
  switch (period) {
    case "7d":
      return startOfDayPlusUtc(timeZone, -6);
    case "30d":
      return startOfDayPlusUtc(timeZone, -29);
    case "90d":
      return startOfDayPlusUtc(timeZone, -89);
    case "mtd": {
      const ymd = ymdInZone(new Date(), timeZone);
      const dayOfMonth = Number(ymd.slice(8, 10));
      return startOfDayPlusUtc(timeZone, -(dayOfMonth - 1));
    }
    case "all":
      return null;
  }
}

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
 * Counts the players who *entered your book during the period* and asks how far
 * each one eventually got. That is a different question from "how many VIP
 * transfers happened this month", and it is the more useful one: it tells you
 * what a lead from this period is actually worth.
 *
 * The milestones come from the timestamps stamped when they happened, so
 * changing a status later never rewrites the history.
 */
export async function getFunnel(
  userId: string,
  start: Date | null
): Promise<Funnel> {
  const supabase = createClient();

  let query = supabase
    .from("players")
    .select("status, vip_fasttrack_started_at, first_deposit_at, assigned_at")
    .eq("owner_id", userId)
    .limit(20000);

  if (start) query = query.gte("assigned_at", start.toISOString());

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

/* ------------------------------------------------------- Source performance */

export type SourceRow = {
  source: string;
  leads: number;
  ftds: number;
  rate: number; // 0-1
};

/**
 * SOURCE PERFORMANCE, ranked by conversion rather than volume.
 *
 * Volume flatters whichever source you happen to work hardest. Rate tells you
 * which source is worth the hour. Sources with very few leads are still shown,
 * but the interface marks them as too small to judge rather than letting a
 * single lucky deposit sit at the top of the table.
 */
export async function getSourcePerformance(
  userId: string,
  start: Date | null
): Promise<SourceRow[]> {
  const supabase = createClient();

  let query = supabase
    .from("players")
    .select("source, first_deposit_at")
    .eq("owner_id", userId)
    .limit(20000);

  if (start) query = query.gte("assigned_at", start.toISOString());

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
  date: string;        // YYYY-MM-DD in the viewer's zone
  leads: number;
  vip: number;
  ftd: number;
  touches: number;     // tasks completed
};

/**
 * Daily activity, bucketed into the viewer's own time zone.
 *
 * This is the thing the spreadsheet could never do honestly - a South African
 * rep's Tuesday and a Manila rep's Tuesday are different windows of UTC, and
 * bucketing on the raw timestamp put their work on the wrong day.
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
    const d = startOfDayPlusUtc(timeZone, -(days - 1 - i));
    const key = ymdInZone(d, timeZone);
    byDay.set(key, { date: key, leads: 0, vip: 0, ftd: 0, touches: 0 });
  }

  for (const e of data ?? []) {
    const key = ymdInZone(new Date(e.occurred_at), timeZone);
    const day = byDay.get(key);
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
  currentStreak: number;   // consecutive days hitting the Active Leads target
  longestStreak: number;
  totalLeads: number;
  totalFtds: number;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Personal records and the target streak.
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
    .in("event_type", ["player_created", "status_change"])
    .order("occurred_at", { ascending: true })
    .limit(50000);

  const rows = data ?? [];
  const leadsByDay = new Map<string, number>();
  const leadsByMonth = new Map<string, number>();
  const leadsByWeek = new Map<string, number>();
  let totalLeads = 0;
  let totalFtds = 0;

  for (const e of rows) {
    if (e.event_type === "status_change") {
      if (e.to_status === "First Deposit" || e.to_status === "Active") totalFtds += 1;
      continue;
    }
    totalLeads += 1;

    const key = ymdInZone(new Date(e.occurred_at), timeZone);
    leadsByDay.set(key, (leadsByDay.get(key) ?? 0) + 1);

    const month = key.slice(0, 7);
    leadsByMonth.set(month, (leadsByMonth.get(month) ?? 0) + 1);

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

  // Streaks. Walk back day by day from today.
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
      } else {
        // Today still has hours left in it - do not let it break the streak.
        if (i > 0) running = 0;
      }
    }
  }

  return {
    bestDay: top(leadsByDay, (date, leads) => ({ date, leads })),
    bestWeek: top(leadsByWeek, (label, leads) => ({ label: prettyWeek(label), leads })),
    bestMonth: top(leadsByMonth, (label, leads) => ({
      label: `${MONTHS[Number(label.slice(5, 7)) - 1]} ${label.slice(0, 4)}`,
      leads,
    })),
    currentStreak,
    longestStreak,
    totalLeads,
    totalFtds,
  };
}

/** ISO week key (YYYY-Www) from a YYYY-MM-DD string. */
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
  leads: number;
  vip: number;
  ftd: number;
  touches: number;
  bookSize: number;
};

/**
 * TEAM LEADERBOARD - admin only.
 *
 * Reps see their own numbers and nobody else's. This is enforced twice: the
 * page is not linked or routed for a rep, and Row Level Security stops the
 * underlying query returning other people's rows even if one got there.
 */
export async function getLeaderboard(
  me: Me,
  start: Date | null
): Promise<LeaderboardRow[]> {
  if (me.role !== "admin") return [];
  const supabase = createClient();

  const [{ data: users }, activity, book] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, code, role")
      .eq("active", true)
      .order("name"),
    (async () => {
      let q = supabase
        .from("activity_log")
        .select("user_id, event_type, to_status")
        .limit(100000);
      if (start) q = q.gte("occurred_at", start.toISOString());
      return (await q).data ?? [];
    })(),
    (async () => {
      const { data } = await supabase.from("players").select("owner_id").limit(100000);
      return data ?? [];
    })(),
  ]);

  const bookSize = new Map<string, number>();
  for (const p of book) {
    bookSize.set(p.owner_id, (bookSize.get(p.owner_id) ?? 0) + 1);
  }

  const rows: LeaderboardRow[] = (users ?? []).map((u) => ({
    userId: u.id,
    name: u.name,
    code: u.code,
    role: u.role,
    leads: 0,
    vip: 0,
    ftd: 0,
    touches: 0,
    bookSize: bookSize.get(u.id) ?? 0,
  }));

  const index = new Map(rows.map((r) => [r.userId, r]));

  for (const e of activity) {
    const row = index.get(e.user_id);
    if (!row) continue;
    if (e.event_type === "player_created") row.leads += 1;
    if (e.event_type === "task_completed") row.touches += 1;
    if (e.event_type === "status_change") {
      if (e.to_status === "VIP Transferred") row.vip += 1;
      if (e.to_status === "First Deposit" || e.to_status === "Active") row.ftd += 1;
    }
  }

  return rows.sort((a, b) => b.ftd - a.ftd || b.vip - a.vip || b.leads - a.leads);
}
