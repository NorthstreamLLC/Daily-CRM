import { createClient } from "@/lib/supabase/server";
import type { Me, Player } from "@/lib/queries";

export const BOOK_PAGE_SIZE = 50;

export type BookSort =
  | "handle"
  | "reference"
  | "status"
  | "source"
  | "assigned_at"
  | "last_contact_at"
  | "next_followup_at";

export type BookFilters = {
  q: string;
  status: string;      // "" means any
  source: string;      // "" means any
  flag: string;        // "", "missing_roobet", "overdue", "ftd", "dead"
  sort: BookSort;
  dir: "asc" | "desc";
  page: number;        // 1-based
};

export type BookResult = {
  rows: Player[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * PostgREST builds its `or` filter from a comma-separated string, so a comma or
 * bracket typed into the search box would be read as syntax rather than as text.
 * Stripping them is safer than escaping and costs nothing - nobody searches for
 * a bracket.
 */
function sanitiseSearch(q: string) {
  return q.replace(/[,()*\\]/g, " ").trim().slice(0, 80);
}

const FIELDS =
  "id, reference, handle, source, roobet_username, status, kyc_status, " +
  "deposit_status, notes, assigned_at, last_contact_at, followup_attempts, " +
  "next_followup_at, next_action, missing_roobet, is_dead, is_ftd, " +
  "first_deposit_at, owner_id";

/**
 * THE BOOK.
 *
 * Everyone in your book, whatever their state - unlike the queue, nothing is
 * ever hidden here. This is the page you come to when you need to find or fix
 * a specific person rather than work through today's list.
 *
 * Paginated in the database rather than in the browser, so it behaves the same
 * at 50 players and at 50,000.
 */
export async function getBook(
  me: Me,
  filters: BookFilters,
  ownerId?: string
): Promise<BookResult> {
  const supabase = createClient();
  const page = Math.max(1, filters.page);
  const from = (page - 1) * BOOK_PAGE_SIZE;

  let query = supabase
    .from("players_enriched")
    .select(FIELDS, { count: "exact" })
    .eq("owner_id", ownerId ?? me.id);

  const q = sanitiseSearch(filters.q);
  if (q) {
    query = query.or(
      `handle.ilike.%${q}%,roobet_username.ilike.%${q}%,reference.ilike.%${q}%`
    );
  }

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.source) query = query.eq("source", filters.source);

  if (filters.flag === "missing_roobet") query = query.eq("missing_roobet", true);
  if (filters.flag === "dead") query = query.eq("is_dead", true);
  if (filters.flag === "ftd") query = query.not("first_deposit_at", "is", null);
  if (filters.flag === "overdue") {
    query = query.lte("next_followup_at", new Date().toISOString());
  }

  const { data, error, count } = await query
    .order(filters.sort, { ascending: filters.dir === "asc", nullsFirst: false })
    .range(from, from + BOOK_PAGE_SIZE - 1);

  if (error) throw error;

  const total = count ?? 0;
  return {
    rows: (data ?? []) as unknown as Player[],
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / BOOK_PAGE_SIZE)),
  };
}

/** Counts for the filter chips, so you can see what is wrong without filtering. */
export async function getBookCounts(me: Me, ownerId?: string) {
  const supabase = createClient();
  const owner = ownerId ?? me.id;

  const base = () =>
    supabase
      .from("players_enriched")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", owner);

  const [all, missing, dead, ftd, overdue] = await Promise.all([
    base(),
    base().eq("missing_roobet", true),
    base().eq("is_dead", true),
    base().not("first_deposit_at", "is", null),
    base().lte("next_followup_at", new Date().toISOString()),
  ]);

  return {
    all: all.count ?? 0,
    missingRoobet: missing.count ?? 0,
    dead: dead.count ?? 0,
    ftd: ftd.count ?? 0,
    overdue: overdue.count ?? 0,
  };
}

export type TimelineEvent = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
};

/**
 * One player's full history: every contact, status change and note, newest
 * first. This is what the Activity Log tab was trying to be, except attached
 * to the person it describes.
 */
export async function getPlayerTimeline(playerId: string): Promise<TimelineEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, event_type, from_status, to_status, occurred_at, metadata")
    .eq("player_id", playerId)
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as TimelineEvent[];
}
