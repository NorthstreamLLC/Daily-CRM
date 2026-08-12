import { createClient } from "@/lib/supabase/server";
import { startOfDayPlusUtc } from "@/lib/time";

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
};

export type ChurnReport = {
  quiet: ChurnPlayer[];
  dropping: ChurnPlayer[];
  /** Wager at risk: what the flagged players produced last period. */
  atRisk: number;
  windowDays: number;
  configured: boolean;
};

type Delta = { player_id: string; owner_id: string; delta: number };

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

  const windowDays = Math.max(1, Number(setting.get("churn_quiet_days") ?? 7) || 7);
  const dropPercent = Math.min(
    99,
    Math.max(1, Number(setting.get("churn_drop_percent") ?? 50) || 50)
  );
  const minWager = Math.max(0, Number(setting.get("churn_min_wager") ?? 100) || 0);

  const now = new Date();
  const currentStart = startOfDayPlusUtc(timezone, -(windowDays - 1), now);
  const previousStart = startOfDayPlusUtc(timezone, -(windowDays * 2 - 1), now);

  const [current, previous, { data: players }, { data: users }] = await Promise.all([
    supabase
      .rpc("wager_deltas", {
        p_start: currentStart.toISOString(),
        p_end: now.toISOString(),
      })
      .then((r) => (r.data ?? []) as Delta[]),
    supabase
      .rpc("wager_deltas", {
        p_start: previousStart.toISOString(),
        p_end: currentStart.toISOString(),
      })
      .then((r) => (r.data ?? []) as Delta[]),
    supabase
      .from("players")
      .select("id, handle, reference, roobet_username, status, owner_id, weighted_wager")
      .gt("weighted_wager", minWager)
      .limit(50000),
    supabase.from("users").select("id, name"),
  ]);

  const names = new Map((users ?? []).map((u) => [u.id as string, u.name as string]));
  const currentBy = new Map(current.map((d) => [d.player_id, Number(d.delta)]));
  const previousBy = new Map(previous.map((d) => [d.player_id, Number(d.delta)]));

  const quiet: ChurnPlayer[] = [];
  const dropping: ChurnPlayer[] = [];
  let atRisk = 0;

  for (const p of players ?? []) {
    if (ownerId && p.owner_id !== ownerId) continue;
    // Already written off - nothing to warn about.
    if (p.status === "Dead Lead") continue;

    const cur = currentBy.get(p.id) ?? 0;
    const prev = previousBy.get(p.id) ?? 0;

    // No prior activity to fall away from.
    if (prev <= 0) continue;

    const share = prev > 0 ? cur / prev : 1;

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
    };

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

  return { quiet, dropping, atRisk, windowDays, configured };
}
