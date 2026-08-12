import { createClient } from "@/lib/supabase/server";

export type ChurnKind = "quiet" | "dropping";

export type ChurnPlayer = {
  id: string;
  handle: string;
  reference: string;
  roobetUsername: string | null;
  status: string;
  ownerId: string;
  ownerName: string;
  allTime: number;
  /** Wager in the recent window. */
  current: number;
  /** Wager in the window before that. */
  previous: number;
  /** How far below the previous period, 0-1. */
  dropShare: number;
  kind: ChurnKind;
  /** Put here by a person rather than by detection. */
  pinned: boolean;
  pinnedNote: string | null;
};

export type ChurnReport = {
  quiet: ChurnPlayer[];
  dropping: ChurnPlayer[];
  /** Pinned by a VIP rep, whatever the numbers say. */
  watched: ChurnPlayer[];
  /** Wager at risk: what the flagged players produced last period. */
  atRisk: number;
  windowDays: number;
  configured: boolean;
  /** Which comparison the figures above actually came from. */
  basis: "rolling" | "month" | "none";
  basisLabel: string;
};

/**
 * CHURN.
 *
 * Two questions asked of the same data:
 *
 *   GONE QUIET  - they wagered in the previous window and nothing in this one.
 *   DROPPING    - still wagering, but far below their own recent normal.
 *
 * Both compare a player against themselves rather than against a company
 * average, because a $200-a-week player halving matters as much to that rep as
 * a whale halving matters to the business.
 *
 * Row Level Security scopes wager_deltas, so a rep calling this sees their own
 * players and an admin sees everyone - one function, two audiences.
 */
export async function getChurn(
  timezone: string,
  ownerId?: string,
  limit = 40
): Promise<ChurnReport> {
  const supabase = createClient();

  const { data: settingRows } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["churn_quiet_days", "churn_drop_percent", "churn_min_wager"]);

  const setting = new Map((settingRows ?? []).map((s) => [s.key, s.value]));
  const configured = (settingRows ?? []).length > 0;

  const dropPercent = Math.min(
    99,
    Math.max(1, Number(setting.get("churn_drop_percent") ?? 50) || 50)
  );
  const minWager = Math.max(0, Number(setting.get("churn_min_wager") ?? 100) || 0);
  const windowDays = 30;

  /* One database call that returns only the flagged players.
  
     This used to fetch every player in the company with any wager - up to
     50,000 rows - and then discard other people's in JavaScript. At 13,000
     players that was 13,000 rows crossing the wire on every Today load, to
     display at most ten. Filtering by owner in SQL is both faster and a
     tighter privacy boundary: a rep's page never touches another rep's rows
     at all. */
  const { data, error } = await supabase.rpc("churn_players", {
    p_owner: ownerId ?? null,
    p_days: windowDays,
    p_drop: dropPercent,
    p_min: minWager,
    p_limit: limit,
  });

  if (error) {
    // Migration not run yet - an empty panel beats a broken page.
    return {
      quiet: [],
      dropping: [],
      watched: [],
      atRisk: 0,
      windowDays,
      configured,
      basis: "none",
      basisLabel: "run migration 20260812000023_scale.sql",
    };
  }

  type Row = {
    id: string;
    handle: string;
    reference: string;
    roobet_username: string | null;
    status: string;
    owner_id: string;
    owner_name: string;
    all_time: number;
    current_sum: number;
    previous_sum: number;
    pinned: boolean;
    pinned_note: string | null;
    basis: string;
  };

  const rows = (data ?? []) as Row[];

  const quiet: ChurnPlayer[] = [];
  const dropping: ChurnPlayer[] = [];
  const watched: ChurnPlayer[] = [];
  let atRisk = 0;

  for (const r of rows) {
    const cur = Number(r.current_sum);
    const prev = Number(r.previous_sum);

    const player: ChurnPlayer = {
      id: r.id,
      handle: r.handle,
      reference: r.reference,
      roobetUsername: r.roobet_username,
      status: r.status,
      ownerId: r.owner_id,
      ownerName: r.owner_name,
      allTime: Number(r.all_time),
      current: cur,
      previous: prev,
      dropShare: prev > 0 ? cur / prev : 1,
      pinned: Boolean(r.pinned),
      pinnedNote: r.pinned_note,
      kind: cur <= 0 ? "quiet" : "dropping",
    };

    atRisk += Math.max(0, prev - cur);

    if (player.pinned) watched.push(player);
    else if (cur <= 0) quiet.push(player);
    else dropping.push(player);
  }

  const basis = (rows[0]?.basis ?? "none") as ChurnReport["basis"];
  const basisLabel =
    basis === "rolling"
      ? `last ${windowDays} days vs the ${windowDays} before`
      : basis === "month"
        ? "this month vs last month"
        : "not enough history yet";

  return { quiet, dropping, watched, atRisk, windowDays, configured, basis, basisLabel };
}
