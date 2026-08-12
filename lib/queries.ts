import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { startOfDayUtc, endOfDayUtc, startOfDayPlusUtc } from "@/lib/time";

export type Player = {
  id: string;
  reference: string;
  handle: string;
  source: string | null;
  roobet_username: string | null;
  status: string;
  kyc_status: string | null;
  deposit_status: string | null;
  notes: string | null;
  assigned_at: string;
  last_contact_at: string | null;
  followup_attempts: number;
  next_followup_at: string | null;
  next_action: string;
  missing_roobet: boolean;
  is_dead: boolean;
  // Present on Book rows; the queue does not select them.
  is_ftd?: boolean;
  first_deposit_at?: string | null;
  owner_id?: string;
  weighted_wager?: number | null;
};

export type Me = {
  id: string;
  name: string;
  code: string;
  role: "user" | "admin";
  timezone: string;
  default_source: string | null;
};

const PLAYER_FIELDS =
  "id, reference, handle, source, roobet_username, status, kyc_status, " +
  "deposit_status, notes, assigned_at, last_contact_at, followup_attempts, " +
  "next_followup_at, next_action, missing_roobet, is_dead, weighted_wager";

/**
 * Who is asking.
 *
 * Wrapped in React's cache() because this is called from the layout, the page
 * and often a component inside it - and each call was two round trips to
 * Supabase (validate the token, then read the row). Six network hops before
 * any actual data was fetched, on every single navigation.
 *
 * cache() dedupes within one render pass only, so there is no staleness across
 * requests: a fresh request still re-validates the session.
 */
export const getMe = cache(async function getMe(): Promise<Me | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, name, code, role, timezone, default_source")
    .eq("id", user.id)
    .single();

  return (data as Me) ?? null;
});

export const getSetting = cache(async function getSetting(
  key: string,
  fallback: string
): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value ?? fallback;
});

/**
 * TODAY'S QUEUE.
 *
 * Someone is due if any of these is true:
 *   - you have never contacted them (a newly added lead, waiting to be worked)
 *   - their follow-up date has arrived
 *   - they still have no Roobet username, the single biggest blocker, so those
 *     resurface every day until it is filled
 *
 * And in every case, only if you have NOT already contacted them today.
 * Without that last part a finished task stays on the list and ticking it
 * appears to do nothing - which is exactly how the spreadsheet behaved.
 *
 * Ordering puts live leads above revived dead leads. A dead lead hitting its
 * 30-day retarget has the longest gap since contact, so on a plain
 * longest-neglected sort it would lead the queue every morning and bury the
 * work that actually earns.
 */
export async function getDueNow(me: Me, ownerId?: string): Promise<Player[]> {
  const supabase = createClient();
  const endToday = endOfDayUtc(me.timezone).toISOString();
  const startToday = startOfDayUtc(me.timezone).toISOString();

  const { data, error } = await supabase
    .from("players_enriched")
    .select(PLAYER_FIELDS)
    /* Scope explicitly rather than leaning on Row Level Security.
       RLS says "your own players, OR everything if you are an admin" - which
       is right for permission but wrong for a personal queue: it made an
       admin's Today show every rep's work as though it were theirs. Worse,
       ticking one off would have logged the completion against the admin and
       moved that player's follow-up date. */
    .eq("owner_id", ownerId || me.id)
    .or(`last_contact_at.is.null,last_contact_at.lt.${startToday}`)
    .or(
      `last_contact_at.is.null,next_followup_at.lte.${endToday},missing_roobet.is.true`
    )
    .order("is_dead", { ascending: true })
    .order("last_contact_at", { ascending: true, nullsFirst: true })
    .limit(500);

  if (error) throw error;
  return (data ?? []) as unknown as Player[];
}

/**
 * COMING UP.
 *
 * Nothing to do yet - this is the schedule, not the work. Two kinds of player
 * belong here:
 *
 *   - anyone whose next contact date falls inside the window
 *   - anyone added and contacted today, whatever their next date is
 *
 * That second rule matters. Someone added today is due tomorrow at the earliest,
 * so they are not a task - but leaving them out made this list read "0" on a day
 * five people had just been added, which is worse than useless. And a player
 * moved straight to Active would be due in fourteen days, outside the window,
 * and would have vanished from the page entirely on the day they were created.
 */
export async function getComingUp(
  me: Me,
  windowDays: number,
  ownerId?: string
): Promise<Player[]> {
  const supabase = createClient();
  const startToday = startOfDayUtc(me.timezone).toISOString();
  const endToday = endOfDayUtc(me.timezone).toISOString();
  const horizon = startOfDayPlusUtc(me.timezone, windowDays + 1).toISOString();

  const { data, error } = await supabase
    .from("players_enriched")
    .select(PLAYER_FIELDS)
    .eq("owner_id", ownerId || me.id)
    .eq("is_dead", false)
    .or(
      `and(missing_roobet.eq.false,next_followup_at.gt.${endToday},next_followup_at.lte.${horizon}),` +
        `and(assigned_at.gte.${startToday},last_contact_at.gte.${startToday})`
    )
    .order("next_followup_at", { ascending: true })
    .limit(300);

  if (error) throw error;
  return (data ?? []) as unknown as Player[];
}

/**
 * How many dead leads this rep has, without fetching any of them.
 *
 * head: true means Postgres returns the count in a header and no rows at all -
 * which is what a badge needs. Fetching 500 rows to display the number 500 is
 * the kind of thing that is free at 20 players and expensive at 1,000.
 */
export async function countDeadLeads(me: Me, ownerId?: string): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from("players_enriched")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId || me.id)
    .eq("is_dead", true);
  return count ?? 0;
}

/**
 * Dead leads, soonest retarget first.
 *
 * Takes a limit because Today renders a handful and links to the Book for the
 * rest. It was fetching 500 rows to display 8 - invisible at 20 players, and
 * 500 wasted rows on every page load at 1,000.
 */
export async function getDeadLeads(
  me: Me,
  ownerId?: string,
  limit = 500
): Promise<Player[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("players_enriched")
    .select(PLAYER_FIELDS)
    .eq("owner_id", ownerId || me.id)
    .eq("is_dead", true)
    .order("next_followup_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as Player[];
}

/**
 * Today's numbers, counted from activity_log rather than from each player's
 * current state.
 *
 * This is the difference between "5 deals" and "9". Counting current state
 * means a status set by mistake and corrected the next day still counts
 * forever. Counting logged events means a correction removes itself.
 */
export async function getTodayStats(me: Me, ownerId?: string) {
  const supabase = createClient();
  const start = startOfDayUtc(me.timezone).toISOString();
  const end = endOfDayUtc(me.timezone).toISOString();

  const { data: events } = await supabase
    .from("activity_log")
    .select("event_type, to_status")
    .eq("user_id", ownerId || me.id)
    .gte("occurred_at", start)
    .lt("occurred_at", end);

  const rows = events ?? [];

  return {
    activeLeads: rows.filter((e) => e.event_type === "player_created").length,
    vipTransfers: rows.filter(
      (e) => e.event_type === "status_change" && e.to_status === "VIP Transferred"
    ).length,
    // Reversals subtract, so a deposit logged by mistake and corrected stops
    // counting instead of standing forever.
    ftds: Math.max(
      0,
      rows.filter(
        (e) =>
          e.event_type === "status_change" &&
          (e.to_status === "First Deposit" || e.to_status === "Active")
      ).length - rows.filter((e) => e.event_type === "deposit_reversed").length
    ),
  };
}

export async function getTargets(me: Me, ownerId?: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("kpi_targets")
    .select("active_leads_per_day, vip_transfers_per_day, ftd_per_day")
    .eq("user_id", ownerId || me.id)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    activeLeads: data?.active_leads_per_day ?? 0,
    vipTransfers: data?.vip_transfers_per_day ?? 0,
    ftds: data?.ftd_per_day ?? 0,
  };
}

export async function getStatuses() {
  const supabase = createClient();
  const { data } = await supabase
    .from("statuses")
    .select("name, sort_order, next_action")
    .order("sort_order");
  return data ?? [];
}

export async function getSources() {
  const supabase = createClient();
  const { data } = await supabase
    .from("sources")
    .select("name")
    .eq("active", true)
    .order("sort_order");
  return (data ?? []).map((s) => s.name as string);
}
