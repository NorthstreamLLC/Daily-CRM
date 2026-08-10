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
  "next_followup_at, next_action, missing_roobet, is_dead";

export async function getMe(): Promise<Me | null> {
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
}

export async function getSetting(key: string, fallback: string): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value ?? fallback;
}

/**
 * TODAY'S QUEUE.
 *
 * Someone is due when their follow-up date has arrived, OR they still have no
 * Roobet username - the single biggest blocker, so those resurface daily until
 * it is filled.
 *
 * Crucially, anyone contacted today is excluded. Without that a finished task
 * stays on the list and ticking it appears to do nothing, which is exactly how
 * the spreadsheet behaved.
 *
 * Ordering puts live leads above revived dead leads. A dead lead hitting its
 * 30-day retarget has the longest gap since contact, so on a plain
 * longest-neglected sort it would lead the queue every morning and bury the
 * work that actually earns.
 */
export async function getDueNow(me: Me): Promise<Player[]> {
  const supabase = createClient();
  const endToday = endOfDayUtc(me.timezone).toISOString();
  const startToday = startOfDayUtc(me.timezone).toISOString();

  const { data, error } = await supabase
    .from("players_enriched")
    .select(PLAYER_FIELDS)
    .or(`last_contact_at.is.null,last_contact_at.lt.${startToday}`)
    .or(`next_followup_at.lte.${endToday},missing_roobet.is.true`)
    .order("is_dead", { ascending: true })
    .order("last_contact_at", { ascending: true, nullsFirst: true })
    .limit(500);

  if (error) throw error;
  return (data ?? []) as unknown as Player[];
}

/** Not due yet, but landing within the configured window. Visibility only. */
export async function getComingUp(me: Me, windowDays: number): Promise<Player[]> {
  const supabase = createClient();
  const endToday = endOfDayUtc(me.timezone).toISOString();
  const horizon = startOfDayPlusUtc(me.timezone, windowDays + 1).toISOString();

  const { data, error } = await supabase
    .from("players_enriched")
    .select(PLAYER_FIELDS)
    .eq("is_dead", false)
    .eq("missing_roobet", false)
    .gt("next_followup_at", endToday)
    .lte("next_followup_at", horizon)
    .order("next_followup_at", { ascending: true })
    .limit(300);

  if (error) throw error;
  return (data ?? []) as unknown as Player[];
}

/** Every dead lead, soonest retarget first. Workable whenever they choose. */
export async function getDeadLeads(me: Me): Promise<Player[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("players_enriched")
    .select(PLAYER_FIELDS)
    .eq("is_dead", true)
    .order("next_followup_at", { ascending: true, nullsFirst: true })
    .limit(500);

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
export async function getTodayStats(me: Me) {
  const supabase = createClient();
  const start = startOfDayUtc(me.timezone).toISOString();
  const end = endOfDayUtc(me.timezone).toISOString();

  const { data: events } = await supabase
    .from("activity_log")
    .select("event_type, to_status")
    .eq("user_id", me.id)
    .gte("occurred_at", start)
    .lt("occurred_at", end);

  const rows = events ?? [];

  return {
    activeLeads: rows.filter((e) => e.event_type === "player_created").length,
    vipTransfers: rows.filter(
      (e) => e.event_type === "status_change" && e.to_status === "VIP Transferred"
    ).length,
    ftds: rows.filter(
      (e) =>
        e.event_type === "status_change" &&
        (e.to_status === "First Deposit" || e.to_status === "Active")
    ).length,
  };
}

export async function getTargets(me: Me) {
  const supabase = createClient();
  const { data } = await supabase
    .from("kpi_targets")
    .select("active_leads_per_day, vip_transfers_per_day, ftd_per_day")
    .eq("user_id", me.id)
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
