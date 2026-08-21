import { cache } from "react";
import { headers } from "next/headers";
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
  /** False once an admin deactivates them - a leaver, or someone fired. */
  active: boolean;
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

  /* The middleware already verified the session and put the id on the
     request. Trusting it saves a full network round trip to Supabase Auth on
     every single navigation - the single biggest avoidable delay in the app.
  
     Only our middleware can set this header: it writes it after verifying,
     overwriting anything a client sent under the same name. If it is absent
     (a route the matcher skips, or an old deployment) we verify properly. */
  let userId: string | null = null;
  try {
    userId = headers().get("x-verified-user");
  } catch {
    userId = null;
  }

  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    userId = user.id;
  }

  const { data } = await supabase
    .from("users")
    .select("id, name, code, role, timezone, default_source, active")
    .eq("id", userId)
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
 * WHAT COUNTS AS DUE - the one definition.
 *
 * This rule was written out twice: once in getDueNow for a rep's own queue,
 * and again in getLeaderboard for the admin "outstanding" column. They drifted,
 * as duplicated rules do. After importing Moneyheist's book his Today page
 * said 8 and the admin overview said 224 about the same rep on the same day,
 * because only one of the two had learnt to leave dead leads alone.
 *
 * Both now call this. If the rule changes, it changes in one place, and the
 * two numbers cannot disagree again.
 *
 * The rule: a player is due if they have never been contacted, or their
 * follow-up date has arrived, or they still have no Roobet username - and in
 * every case only if they are not a dead lead, which has its own 30-day
 * retarget rhythm and its own place in the Book.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function onlyDue<T extends { or: any; eq: any }>(
  query: T,
  endTodayIso: string
): T {
  return query
    .eq("is_dead", false)
    .or(`last_contact_at.is.null,next_followup_at.lte.${endTodayIso},missing_roobet.is.true`);
}

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
 * Dead leads are excluded - see onlyDue. They retarget on their own 30-day
 * cycle and are worked from the Book, because a book that is 95% dead leads
 * would otherwise be a queue nobody could face.
 */
export async function getDueNow(me: Me, ownerId?: string): Promise<Player[]> {
  const supabase = createClient();
  const endToday = endOfDayUtc(me.timezone).toISOString();
  const startToday = startOfDayUtc(me.timezone).toISOString();

  const { data, error } = await onlyDue(
    supabase
      .from("players_enriched")
      .select(PLAYER_FIELDS)
      /* Scope explicitly rather than leaning on Row Level Security.
         RLS says "your own players, OR everything if you are an admin" -
         which is right for permission but wrong for a personal queue: it made
         an admin's Today show every rep's work as though it were theirs.
         Worse, ticking one off would have logged the completion against the
         admin and moved that player's follow-up date. */
      .eq("owner_id", ownerId || me.id)
      // Not already worked today - otherwise ticking one off does nothing.
      .or(`last_contact_at.is.null,last_contact_at.lt.${startToday}`),
    endToday
  )
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
  ownerId?: string,
  limit = 300
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
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as Player[];
}

/** How many are scheduled in the window, without fetching them. */
export async function countComingUp(
  me: Me,
  windowDays: number,
  ownerId?: string
): Promise<number> {
  const supabase = createClient();
  const startToday = startOfDayUtc(me.timezone).toISOString();
  const endToday = endOfDayUtc(me.timezone).toISOString();
  const horizon = startOfDayPlusUtc(me.timezone, windowDays + 1).toISOString();

  const { count } = await supabase
    .from("players_enriched")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId || me.id)
    .eq("is_dead", false)
    .or(
      `and(missing_roobet.eq.false,next_followup_at.gt.${endToday},next_followup_at.lte.${horizon}),` +
        `and(assigned_at.gte.${startToday},last_contact_at.gte.${startToday})`
    );

  return count ?? 0;
}

/**
 * How many dead leads this rep has, without fetching any of them.
 *
 * head: true means Postgres returns the count in a header and no rows at all -
 * which is what a badge needs. Fetching 500 rows to display the number 500 is
 * the kind of thing that is free at 20 players and expensive at 1,000.
 */
export async function countDeadLeads(
  me: Me,
  ownerId?: string
): Promise<number> {
  const supabase = createClient();
  /* Only the ones whose retarget has actually come round.

     The raw total is a number nobody can act on - Moneyheist has 233, and
     "233 dead leads waiting for a retarget" is true on the day of the import
     and still true in six months. What a rep can act on is the dozen whose
     thirty days are up today, which is a morning's work rather than a wall. */
  const { count } = await supabase
    .from("players_enriched")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId || me.id)
    .eq("is_dead", true)
    .lte("next_followup_at", endOfDayUtc(me.timezone).toISOString());
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
    /* Deleted players stop counting. Their activity rows survive with a null
       player_id, and without this a deleted lead still shows on Today. */
    .not("player_id", "is", null)
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

/* ------------------------------------------------------------ Notifications */

export type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  playerId: string | null;
  createdAt: string;
  readAt: string | null;
};

/**
 * The inbox, newest first.
 *
 * Only moments live here - a player started wagering, a book was handed over.
 * Standing state like "5 overdue" is counted on the page instead, because a
 * number you can recalculate should never be a row you have to maintain.
 *
 * Row Level Security scopes this to the viewer, so there is no owner
 * parameter: an inbox is personal even for an admin.
 */
export async function getNotifications(limit = 20): Promise<Notification[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, player_id, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((n) => ({
      id: n.id as string,
      kind: n.kind as string,
      title: n.title as string,
      body: n.body as string | null,
      playerId: n.player_id as string | null,
    createdAt: n.created_at as string,
    readAt: n.read_at as string | null,
  }));
}

/**
 * Just the badge number.
 *
 * The layout renders on every navigation, so it asks for the count and
 * nothing else - head: true returns it in a header with no rows at all. The
 * list itself is fetched when the panel is actually opened, which for most
 * reps on most days is never.
 */
export async function getUnreadCount(): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
}


/**
 * Several settings in one query.
 *
 * Asking for three keys separately is three round trips even inside a
 * Promise.all - the client opens three requests. One `in` query is one.
 */
export const getSettings = cache(async function getSettings(
  keys: string[]
): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", keys);

  return Object.fromEntries(
    (data ?? []).map((row) => [row.key as string, row.value as string])
  );
});

/**
 * MAY THIS PERSON SEE WAGER FIGURES?
 *
 * Admins always. A rep only if `reps_see_wager` is on.
 *
 * The reasoning is commercial rather than technical: a rep who can see that
 * one of their players wagered $400,000 has a number to negotiate with, and
 * the conversation stops being about the work. So it is a setting an admin can
 * flip, not a constant somebody has to redeploy.
 *
 * ADMIN MEANS ADMIN, not "viewing as". An admin looking at a rep's page is
 * still an admin and still sees the money - the question this answers is what
 * the REP sees when signed in as themselves.
 */
export async function canSeeWager(me: Me): Promise<boolean> {
  if (me.role === "admin") return true;
  const settings = await getSettings(["reps_see_wager"]);
  return settings.reps_see_wager === "true";
}
