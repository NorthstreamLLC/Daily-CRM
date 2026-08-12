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
  ownerId?: string
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

  /* Thirty days against the thirty before. Rolling, so a slide shows up as it
     happens rather than waiting for a month boundary. */
  const windowDays = 30;

  type Pair = {
    player_id: string;
    owner_id: string;
    current_sum: number;
    previous_sum: number;
    current_days?: number;
    previous_days?: number;
  };

  const [rolling, monthly, { data: players }, { data: users }, { data: watch }] =
    await Promise.all([
      supabase
        .rpc("wager_window_pairs", { p_days: windowDays })
        .then((r) => (r.data ?? []) as Pair[]),
      supabase.rpc("wager_month_pairs").then((r) => (r.data ?? []) as Pair[]),
      supabase
        .from("players")
        .select("id, handle, reference, roobet_username, status, owner_id, weighted_wager")
        .gt("weighted_wager", minWager)
        .limit(50000),
      supabase.from("users").select("id, name"),
      supabase
        .from("vip_watch")
        .select("player_id, note")
        .is("resolved_at", null)
        .limit(5000),
    ]);

  /* Daily facts only exist from the day syncing started, so early on the
     rolling window is comparing three days with three days and calling it a
     month. When there is not enough of it, fall back to calendar months -
     those came from the backfill and go back properly. Saying which one is in
     use matters more than always using the fancier one. */
  const daysCovered = rolling.reduce(
    (max, p) => Math.max(max, (p.previous_days ?? 0) + (p.current_days ?? 0)),
    0
  );
  const rollingUsable = daysCovered >= windowDays + 7;

  const basis: ChurnReport["basis"] = rollingUsable
    ? "rolling"
    : monthly.length > 0
      ? "month"
      : "none";

  const basisLabel =
    basis === "rolling"
      ? `last ${windowDays} days vs the ${windowDays} before`
      : basis === "month"
        ? "this month vs last month"
        : "not enough history yet";

  const pairs = basis === "rolling" ? rolling : monthly;

  const names = new Map((users ?? []).map((u) => [u.id as string, u.name as string]));
  const pairBy = new Map(pairs.map((d) => [d.player_id, d]));
  const watched = new Map(
    (watch ?? []).map((w) => [w.player_id as string, (w.note as string | null) ?? null])
  );

  const quiet: ChurnPlayer[] = [];
  const dropping: ChurnPlayer[] = [];
  const pinnedList: ChurnPlayer[] = [];
  let atRisk = 0;

  for (const p of players ?? []) {
    if (ownerId && p.owner_id !== ownerId) continue;

    const pair = pairBy.get(p.id);
    const cur = Number(pair?.current_sum ?? 0);
    const prev = Number(pair?.previous_sum ?? 0);
    const share = prev > 0 ? cur / prev : 1;
    const isPinned = watched.has(p.id);

    const base = {
      id: p.id,
      handle: p.handle,
      reference: p.reference,
      roobetUsername: p.roobet_username,
      status: p.status,
      ownerId: p.owner_id,
      ownerName: names.get(p.owner_id) ?? "—",
      allTime: Number(p.weighted_wager ?? 0),
      current: cur,
      previous: prev,
      dropShare: share,
      pinned: isPinned,
      pinnedNote: watched.get(p.id) ?? null,
    };

    /* A pinned player is on the list because someone put them there, so no
       threshold applies - not the dead-lead rule either. Somebody decided
       they are worth watching. */
    if (isPinned) {
      pinnedList.push({ ...base, kind: cur <= 0 ? "quiet" : "dropping" });
      atRisk += Math.max(0, prev - cur);
      continue;
    }

    // Already written off - nothing to warn about.
    if (p.status === "Dead Lead") continue;

    // No prior activity to fall away from.
    if (prev <= 0) continue;

    if (cur <= 0) {
      quiet.push({ ...base, kind: "quiet" });
      atRisk += prev;
    } else if (share < dropPercent / 100) {
      dropping.push({ ...base, kind: "dropping" });
      atRisk += prev - cur;
    }
  }

  // Biggest losses first - that is the order to work them in.
  quiet.sort((a, b) => b.previous - a.previous);
  dropping.sort((a, b) => b.previous - b.current - (a.previous - a.current));
  pinnedList.sort((a, b) => b.previous - b.current - (a.previous - a.current));

  return {
    quiet,
    dropping,
    watched: pinnedList,
    atRisk,
    windowDays,
    configured,
    basis,
    basisLabel,
  };
}
