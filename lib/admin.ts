import { createClient } from "@/lib/supabase/server";
import { getMe, type Me } from "@/lib/queries";

export type TeamMember = {
  id: string;
  name: string;
  code: string;
  email: string;
  role: "user" | "admin";
  timezone: string;
  default_source: string | null;
  active: boolean;
  created_at: string;
  bookSize: number;
  targets: {
    activeLeads: number;
    vipTransfers: number;
    ftds: number;
    outreach: number;
    effectiveFrom: string | null;
  };
};

/**
 * Confirms the caller is an admin before any admin work happens.
 *
 * Row Level Security is the real barrier, but a server action holding the
 * service role key steps around it by design - so every one of those actions
 * calls this first and refuses to continue without it.
 */
export async function requireAdmin(): Promise<Me> {
  const me = await getMe();
  if (!me) throw new Error("Not signed in.");
  if (me.role !== "admin") throw new Error("Admins only.");
  return me;
}

/** The whole team with their current targets and book sizes. */
export async function getTeam(): Promise<TeamMember[]> {
  const supabase = createClient();

  const [{ data: users }, { data: targets }, { data: players }] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, code, email, role, timezone, default_source, active, created_at")
      .order("active", { ascending: false })
      .order("name"),
    supabase
      .from("kpi_targets")
      .select(
        "user_id, outreach_per_day, active_leads_per_day, vip_transfers_per_day, ftd_per_day, effective_from"
      )
      .order("effective_from", { ascending: false }),
    /* Counting in Postgres rather than pulling every player row across the
       wire to count them here. Same numbers, one row per rep instead of one
       row per player. */
    supabase
      .rpc("player_counts_by_owner")
      .then((r) => ({ data: (r.data ?? []) as { owner_id: string; players: number }[] })),
  ]);

  const bookSize = new Map<string, number>(
    (players ?? []).map((row) => [row.owner_id, Number(row.players)])
  );

  // Targets are dated; the newest row for each person is the one in force.
  // Ordered newest-first above, so the first row seen per person wins.
  type TargetRow = {
    user_id: string;
    outreach_per_day: number;
    active_leads_per_day: number;
    vip_transfers_per_day: number;
    ftd_per_day: number;
    effective_from: string;
  };

  const current = new Map<string, TargetRow>();
  for (const t of (targets ?? []) as TargetRow[]) {
    if (!current.has(t.user_id)) current.set(t.user_id, t);
  }

  return (users ?? []).map((u) => {
    const t = current.get(u.id);
    return {
      ...u,
      role: u.role as "user" | "admin",
      bookSize: bookSize.get(u.id) ?? 0,
      targets: {
        activeLeads: t?.active_leads_per_day ?? 0,
        vipTransfers: t?.vip_transfers_per_day ?? 0,
        ftds: t?.ftd_per_day ?? 0,
        outreach: t?.outreach_per_day ?? 0,
        effectiveFrom: t?.effective_from ?? null,
      },
    } as TeamMember;
  });
}

/* --------------------------------------------------------------- Settings */

export type Setting = {
  key: string;
  value: string;
  value_type: "int" | "text" | "bool" | "json";
  label: string;
  description: string | null;
  category: string;
  sort_order: number;
};

export async function getAllSettings(): Promise<Setting[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("settings")
    .select("key, value, value_type, label, description, category, sort_order")
    .order("category")
    .order("sort_order");
  return (data ?? []) as Setting[];
}

export type FunnelStage = {
  name: string;
  sort_order: number;
  followup_days: number;
  next_action: string;
  counts_as_lead: boolean;
  is_ftd: boolean;
  is_dead: boolean;
  playerCount: number;
};

export async function getFunnelStages(): Promise<FunnelStage[]> {
  const supabase = createClient();

  const [{ data: stages }, { data: players }] = await Promise.all([
    supabase
      .from("statuses")
      .select("name, sort_order, followup_days, next_action, counts_as_lead, is_ftd, is_dead")
      .order("sort_order"),
    supabase
      .rpc("player_counts_by_status")
      .then((r) => ({ data: (r.data ?? []) as { status: string; players: number }[] })),
  ]);

  const counts = new Map<string, number>(
    (players ?? []).map((row) => [row.status, Number(row.players)])
  );

  return (stages ?? []).map((s) => ({
    ...s,
    playerCount: counts.get(s.name) ?? 0,
  })) as FunnelStage[];
}

export type LookupRow = { name: string; sort_order: number; active: boolean; inUse: number };

/** Sources with a usage count, so retiring one is an informed decision. */
export async function getSourcesAdmin(): Promise<LookupRow[]> {
  const supabase = createClient();
  const [{ data: rows }, { data: players }] = await Promise.all([
    supabase.from("sources").select("name, sort_order, active").order("sort_order"),
    supabase
      .rpc("player_counts_by_source")
      .then((r) => ({ data: (r.data ?? []) as { source: string; players: number }[] })),
  ]);

  const counts = new Map<string, number>(
    (players ?? []).map((row) => [row.source, Number(row.players)])
  );

  return (rows ?? []).map((r) => ({ ...r, inUse: counts.get(r.name) ?? 0 }));
}

/* ------------------------------------------------------- Company pipelines */

export type CompanyPlayer = {
  id: string;
  reference: string;
  handle: string;
  roobet_username: string | null;
  status: string;
  source: string | null;
  owner_id: string;
  ownerName: string;
  last_contact_at: string | null;
  first_deposit_at: string | null;
  vip_fasttrack_started_at: string | null;
  vip_fasttrack_checkins: number;
  next_followup_at: string | null;
  missing_roobet: boolean;
};

async function ownerNames() {
  const supabase = createClient();
  const { data } = await supabase.from("users").select("id, name");
  return new Map((data ?? []).map((u) => [u.id as string, u.name as string]));
}

const COMPANY_FIELDS =
  "id, reference, handle, roobet_username, status, source, owner_id, " +
  "last_contact_at, first_deposit_at, vip_fasttrack_started_at, " +
  "vip_fasttrack_checkins, next_followup_at, missing_roobet";

/** Supabase cannot infer a shape for a view, so the result is named here. */
type CompanyRow = Omit<CompanyPlayer, "ownerName">;

/**
 * Everyone currently sitting at VIP Transferred, across every rep.
 *
 * This is the list the master spreadsheet was trying to be. Ordered oldest
 * first, because a VIP transfer that has been waiting a week is the most
 * expensive thing in the company to leave alone.
 */
export async function getCompanyVip(): Promise<CompanyPlayer[]> {
  const supabase = createClient();
  const [{ data }, names] = await Promise.all([
    supabase
      .from("players_enriched")
      .select(COMPANY_FIELDS)
      .eq("status", "VIP Transferred")
      .order("vip_fasttrack_started_at", { ascending: true, nullsFirst: true })
      .limit(2000),
    ownerNames(),
  ]);

  return ((data ?? []) as unknown as CompanyRow[]).map((p) => ({
    ...p,
    ownerName: names.get(p.owner_id) ?? "—",
  }));
}

/** Every first deposit the company has ever taken, newest first. */
export async function getCompanyDeposits(): Promise<CompanyPlayer[]> {
  const supabase = createClient();
  const [{ data }, names] = await Promise.all([
    supabase
      .from("players_enriched")
      .select(COMPANY_FIELDS)
      .not("first_deposit_at", "is", null)
      .order("first_deposit_at", { ascending: false })
      .limit(2000),
    ownerNames(),
  ]);

  return ((data ?? []) as unknown as CompanyRow[]).map((p) => ({
    ...p,
    ownerName: names.get(p.owner_id) ?? "—",
  }));
}

/* ----------------------------------------------------------------- Imports */

export type ImportBatch = {
  id: string;
  filename: string | null;
  rows_total: number;
  rows_imported: number;
  rows_rejected: number;
  rejections: { row: number; reason: string; handle?: string }[];
  created_at: string;
  target_user_id: string | null;
  targetName: string;
  /** Set once the import has been reversed. Null while its players are here. */
  undone_at: string | null;
};

export async function getImportHistory(): Promise<ImportBatch[]> {
  const supabase = createClient();
  const [{ data }, names] = await Promise.all([
    supabase
      .from("import_batches")
      .select(
        "id, filename, rows_total, rows_imported, rows_rejected, rejections, created_at, target_user_id, undone_at"
      )
      .order("created_at", { ascending: false })
      .limit(25),
    ownerNames(),
  ]);

  return (data ?? []).map((b) => ({
    ...b,
    rejections: (b.rejections ?? []) as ImportBatch["rejections"],
    targetName: b.target_user_id ? names.get(b.target_user_id) ?? "—" : "—",
  })) as ImportBatch[];
}

/* ------------------------------------------------------------ Wager stats */

export type WagerByRep = {
  userId: string;
  name: string;
  code: string;
  matchedPlayers: number;
  today: number;
  week: number;
  month: number;
  allTime: number;
};

export type TopWagerPlayer = {
  id: string;
  handle: string;
  reference: string;
  roobet_username: string | null;
  ownerName: string;
  allTime: number;
  month: number;
};

export type SignalPlayer = {
  id: string;
  handle: string;
  reference: string;
  ownerId: string;
  ownerName: string;
  status: string;
  wager: number;
};

export type DepositSignals = {
  /** Distinct usernames that have ever wagered on your codes. */
  allTimeWagerers: number;
  /**
   * Genuinely new: first wager on or after the baseline date. Null when no
   * baseline is set, because without one these numbers only describe when our
   * sync first noticed someone.
   */
  newSinceBaseline: number | null;
  newMonth: number | null;
  newWeek: number | null;
  baseline: string;
  /** Wagering on your codes but never marked deposited - likely missed FTDs. */
  missed: { count: number; sample: SignalPlayer[] };
  /** Marked deposited by a rep but zero wager on your codes. */
  unverified: { count: number; sample: SignalPlayer[] };
};

export type CodeTotals = {
  source: string;
  today: number;
  week: number;
  month: number;
  allTime: number;
  wagerers: number;
};

export type UnclaimedWagerer = {
  username: string;
  sources: string;
  month: number;
  allTime: number;
};

export type WagerOverview = {
  /** Company-wide, from the ledger - includes the general book. */
  totals: { today: number; week: number; month: number; allTime: number };
  byCode: CodeTotals[];
  unclaimed: {
    /** Everyone unclaimed. */
    count: number;
    /** How many match the current search. */
    matching: number;
    total: number;
    page: number;
    pageCount: number;
    sample: UnclaimedWagerer[];
  };
  byRep: WagerByRep[];
  topPlayers: TopWagerPlayer[];
  snapshotCount: number;
  signals: DepositSignals;
};

/**
 * COMPANY WAGER, cut by window and by rep.
 *
 * All-time comes straight off each player's current figure. The windows come
 * from wager_deltas() in the database - the leaderboard reports running
 * totals, so a window is the movement between snapshots, and a player's first
 * ever snapshot is a baseline rather than activity.
 */
export const UNCLAIMED_PAGE_SIZE = 50;
export const UNCLAIMED_MAX_PAGES = 10;

export async function getWagerOverview(
  timezone: string,
  /** Filters the unclaimed wagerer list. */
  search = "",
  /** 1-based page of the unclaimed list. */
  page = 1
): Promise<WagerOverview> {
  const supabase = createClient();
  const now = new Date();
  const nowIso = now.toISOString();

  const { startOfDayUtc, startOfDayPlusUtc, ymdInZone, dayStartFromYmd } = await import(
    "@/lib/time"
  );

  const todayStart = startOfDayUtc(timezone, now).toISOString();
  const weekStart = startOfDayPlusUtc(timezone, -6, now).toISOString();
  const monthYmd = `${ymdInZone(now, timezone).slice(0, 7)}-01`;
  const monthStart = (dayStartFromYmd(monthYmd, timezone) ?? now).toISOString();

  type Delta = { player_id: string; owner_id: string; delta: number };

  type ExternalDelta = { username: string; source: string; delta: number };

  const externalRpc = (start: string) =>
    supabase
      .rpc("wager_external_deltas", { p_start: start, p_end: nowIso })
      .then((r) => (r.data ?? []) as ExternalDelta[]);

  const [
    { data: users },
    { data: players },
    { count: snapshotCount },
    firstWagers,
    ledgerRows,
    extDay,
    extWeek,
    extMonth,
    dayDeltas,
    weekDeltas,
    monthDeltas,
  ] = await Promise.all([
    supabase.from("users").select("id, name, code").eq("active", true).order("name"),
    supabase
      .from("players")
      .select(
        "id, handle, reference, roobet_username, owner_id, weighted_wager, status, first_deposit_at"
      )
      .limit(100000),
    supabase.from("wager_snapshots").select("id", { count: "exact", head: true }),
    /* First nonzero wager per username - a dated deposit confirmation.

       Was: fetch up to 300,000 ledger rows ordered by time and keep the first
       occurrence of each username in JavaScript. Now one DISTINCT ON, which
       returns about 900 rows instead. */
    supabase
      .rpc("wager_first_seen")
      .then((r) => (r.data ?? []) as { username: string; first_at: string }[]),

    /* Latest reading per username per code.

       Was: fetch the ENTIRE ledger - up to 300,000 rows - and fold it down to
       the last row per pair by hand. Together these two queries were 8.4 of
       the page's 8.5 seconds, moving 600,000 rows over the network to build
       two maps Postgres can build from ~2,600. */
    supabase
      .rpc("wager_ledger_latest")
      .then(
        (r) => (r.data ?? []) as { username: string; source: string; wagered: number }[]
      ),
    externalRpc(todayStart),
    externalRpc(weekStart),
    externalRpc(monthStart),
    supabase
      .rpc("wager_deltas", { p_start: todayStart, p_end: nowIso })
      .then((r) => (r.data ?? []) as Delta[]),
    supabase
      .rpc("wager_deltas", { p_start: weekStart, p_end: nowIso })
      .then((r) => (r.data ?? []) as Delta[]),
    supabase
      .rpc("wager_deltas", { p_start: monthStart, p_end: nowIso })
      .then((r) => (r.data ?? []) as Delta[]),
  ]);

  const sum = (rows: Delta[]) => rows.reduce((a, r) => a + Number(r.delta), 0);
  const byOwner = (rows: Delta[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.owner_id, (m.get(r.owner_id) ?? 0) + Number(r.delta));
    return m;
  };
  const byPlayer = (rows: Delta[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.player_id, Number(r.delta));
    return m;
  };

  const dayByOwner = byOwner(dayDeltas);
  const weekByOwner = byOwner(weekDeltas);
  const monthByOwner = byOwner(monthDeltas);
  const monthByPlayer = byPlayer(monthDeltas);

  const allTimeByOwner = new Map<string, number>();
  const matchedByOwner = new Map<string, number>();
  let allTimeTotal = 0;

  for (const p of players ?? []) {
    const w = Number(p.weighted_wager ?? 0);
    if (w > 0) {
      allTimeTotal += w;
      allTimeByOwner.set(p.owner_id, (allTimeByOwner.get(p.owner_id) ?? 0) + w);
    }
    if (p.roobet_username?.trim() && w > 0) {
      matchedByOwner.set(p.owner_id, (matchedByOwner.get(p.owner_id) ?? 0) + 1);
    }
  }

  const byRep: WagerByRep[] = (users ?? [])
    .map((u) => ({
      userId: u.id,
      name: u.name,
      code: u.code,
      matchedPlayers: matchedByOwner.get(u.id) ?? 0,
      today: dayByOwner.get(u.id) ?? 0,
      week: weekByOwner.get(u.id) ?? 0,
      month: monthByOwner.get(u.id) ?? 0,
      allTime: allTimeByOwner.get(u.id) ?? 0,
    }))
    .sort((a, b) => b.allTime - a.allTime);

  const names = new Map((users ?? []).map((u) => [u.id as string, u.name as string]));

  const topPlayers: TopWagerPlayer[] = (players ?? [])
    .filter((p) => Number(p.weighted_wager ?? 0) > 0)
    .sort((a, b) => Number(b.weighted_wager) - Number(a.weighted_wager))
    .slice(0, 15)
    .map((p) => ({
      id: p.id,
      handle: p.handle,
      reference: p.reference,
      roobet_username: p.roobet_username,
      ownerName: names.get(p.owner_id) ?? "—",
      allTime: Number(p.weighted_wager),
      month: monthByPlayer.get(p.id) ?? 0,
    }));

  /* THE LEDGER - company-wide truth, general book included.
     Latest reading per (username, source) is that pair's all-time total;
     window figures come from the external deltas RPC. */
  const claimed = new Set(
    (players ?? [])
      .filter((p) => p.roobet_username?.trim())
      .map((p) => p.roobet_username!.trim().toLowerCase())
  );

  /* Retired usernames were already wagering before the CRM existed. They stay
     in every company total but leave the working list, so the handful of
     genuinely new names are visible instead of buried under hundreds. */
  const { data: ignoredRows } = await supabase.from("wager_ignored").select("username");
  const ignored = new Set(
    (ignoredRows ?? []).map((r) => String(r.username).trim().toLowerCase())
  );

  type PairInfo = { display: string; source: string; latest: number };
  const latestByPair = new Map<string, PairInfo>();
  for (const row of ledgerRows ?? []) {
    /* One row per pair already - the "keep overwriting until the newest wins"
       loop that used to be here is now the DISTINCT ON in the function. */
    const key = `${String(row.username).trim().toLowerCase()}|${row.source}`;
    latestByPair.set(key, {
      display: String(row.username),
      source: row.source,
      latest: Number(row.wagered),
    });
  }

  const codeAgg = new Map<string, CodeTotals>();
  const codeOf = (source: string) => {
    let c = codeAgg.get(source);
    if (!c) {
      c = { source, today: 0, week: 0, month: 0, allTime: 0, wagerers: 0 };
      codeAgg.set(source, c);
    }
    return c;
  };

  /* Per code, every pair counts - that is what each code produced.
     Company-wide, the same player on two codes is the same wagering reported
     twice, so take their largest reading rather than adding them. */
  const bestByUsername = new Map<string, number>();

  latestByPair.forEach((info, key) => {
    const uname = key.slice(0, key.lastIndexOf("|"));
    bestByUsername.set(uname, Math.max(bestByUsername.get(uname) ?? 0, info.latest));

    const c = codeOf(info.source);
    c.allTime += info.latest;
    c.wagerers += 1;
  });

  let companyAllTime = 0;
  bestByUsername.forEach((v) => {
    companyAllTime += v;
  });

  const sumExt = (rows: ExternalDelta[]) => rows.reduce((a, r) => a + Number(r.delta), 0);
  for (const r of extDay) codeOf(r.source).today += Number(r.delta);
  for (const r of extWeek) codeOf(r.source).week += Number(r.delta);
  for (const r of extMonth) codeOf(r.source).month += Number(r.delta);

  const byCode = Array.from(codeAgg.values()).sort((a, b) => b.allTime - a.allTime);

  // Unclaimed: wagering on your codes, in nobody's book.
  const monthByUsername = new Map<string, number>();
  for (const r of extMonth) {
    monthByUsername.set(
      r.username,
      (monthByUsername.get(r.username) ?? 0) + Number(r.delta)
    );
  }

  const unclaimedAgg = new Map<string, UnclaimedWagerer & { srcSet: Set<string> }>();
  latestByPair.forEach((info, key) => {
    const uname = key.slice(0, key.lastIndexOf("|"));
    if (claimed.has(uname) || ignored.has(uname)) return;
    let u = unclaimedAgg.get(uname);
    if (!u) {
      u = {
        username: info.display,
        sources: "",
        month: monthByUsername.get(uname) ?? 0,
        allTime: 0,
        srcSet: new Set(),
      };
      unclaimedAgg.set(uname, u);
    }
    u.allTime = Math.max(u.allTime, info.latest);
    u.srcSet.add(info.source);
  });

  const allUnclaimed = Array.from(unclaimedAgg.values())
    .map((u) => ({ ...u, sources: Array.from(u.srcSet).join(", ") }))
    .sort((a, b) => b.allTime - a.allTime);

  // The total is of everyone unclaimed, not just the filtered view - a search
  // narrows what you read, it does not change what you are owed.
  const unclaimedTotal = allUnclaimed.reduce((a, u) => a + u.allTime, 0);

  const needle = search.trim().toLowerCase();
  const unclaimedList = needle
    ? allUnclaimed.filter((u) => u.username.toLowerCase().includes(needle))
    : allUnclaimed;

  // Capped at ten pages: past 500 rows, searching beats paging.
  const unclaimedPageCount = Math.min(
    UNCLAIMED_MAX_PAGES,
    Math.max(1, Math.ceil(unclaimedList.length / UNCLAIMED_PAGE_SIZE))
  );
  const safePage = Math.min(Math.max(1, page), unclaimedPageCount);

  /* Deposit signals - wager as proof of deposit.
     Roobet does not expose deposits, but nobody wagers without one, so a
     username's first nonzero ledger entry is a dated deposit confirmation. */
  const firstWagerAt = new Map<string, string>();
  for (const f of firstWagers ?? []) {
    // Already the earliest per username - no need to guard against overwriting.
    firstWagerAt.set(String(f.username).trim().toLowerCase(), f.first_at);
  }

  // Compared as instants, not strings - Postgres timestamps arrive in a
  // different ISO flavour than JavaScript produces.
  const weekMs = new Date(weekStart).getTime();
  const monthMs = new Date(monthStart).getTime();

  /* THE BASELINE.
     Without it, "new players" really means "players our sync noticed for the
     first time" - which, the day after importing history, is everybody. Anyone
     whose first wager predates the baseline was already playing before we
     started watching and is never counted as new. */
  const { data: baselineRow } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "wager_new_player_baseline")
    .maybeSingle();

  const baseline = String(baselineRow?.value ?? "").trim();
  const baselineMs = /^\d{4}-\d{2}-\d{2}$/.test(baseline)
    ? new Date(`${baseline}T00:00:00Z`).getTime()
    : null;

  const allTimeWagerers = firstWagerAt.size;

  let newSinceBaseline: number | null = null;
  let newWeek: number | null = null;
  let newMonth: number | null = null;

  if (baselineMs !== null) {
    newSinceBaseline = 0;
    newWeek = 0;
    newMonth = 0;
    firstWagerAt.forEach((at) => {
      const t = new Date(at).getTime();
      if (t < baselineMs) return;
      newSinceBaseline! += 1;
      if (t >= weekMs) newWeek! += 1;
      if (t >= monthMs) newMonth! += 1;
    });
  }

  const toSignal = (p: {
    id: string;
    handle: string;
    reference: string;
    owner_id: string;
    status: string;
    weighted_wager: number | null;
  }): SignalPlayer => ({
    id: p.id,
    handle: p.handle,
    reference: p.reference,
    ownerId: p.owner_id,
    ownerName: names.get(p.owner_id) ?? "—",
    status: p.status,
    wager: Number(p.weighted_wager ?? 0),
  });

  const missedRows = (players ?? [])
    .filter((p) => Number(p.weighted_wager ?? 0) > 0 && !p.first_deposit_at)
    .sort((a, b) => Number(b.weighted_wager) - Number(a.weighted_wager));

  const unverifiedRows = (players ?? []).filter(
    (p) => p.first_deposit_at && Number(p.weighted_wager ?? 0) === 0
  );

  // Player-based sums are still computed for byRep; the company totals come
  // from the ledger so the general book counts.
  void sum;
  void allTimeTotal;

  return {
    totals: {
      today: sumExt(extDay),
      week: sumExt(extWeek),
      month: sumExt(extMonth),
      allTime: companyAllTime,
    },
    byCode,
    unclaimed: {
      count: allUnclaimed.length,
      matching: unclaimedList.length,
      total: unclaimedTotal,
      page: safePage,
      pageCount: unclaimedPageCount,
      sample: unclaimedList.slice(
        (safePage - 1) * UNCLAIMED_PAGE_SIZE,
        safePage * UNCLAIMED_PAGE_SIZE
      ),
    },
    byRep,
    topPlayers,
    snapshotCount: snapshotCount ?? 0,
    signals: {
      allTimeWagerers,
      newSinceBaseline,
      newWeek,
      newMonth,
      baseline,
      missed: { count: missedRows.length, sample: missedRows.slice(0, 10).map(toSignal) },
      unverified: {
        count: unverifiedRows.length,
        sample: unverifiedRows.slice(0, 10).map(toSignal),
      },
    },
  };
}

/* ---------------------------------------------------------- Wager periods */

export type PeriodTotals = {
  total: number;
  claimed: number;
  unclaimed: number;
  wagerers: number;
  byCode: { source: string; total: number; wagerers: number }[];
};

export type MonthRow = { month: string; label: string; total: number; wagerers: number };

/** One bar on the "wagered over time" chart, whatever the grain. */
export type HistoryPoint = {
  /** ISO date of the period start - the day, the Monday, or the 1st. */
  start: string;
  label: string;
  total: number;
  wagerers: number;
};

export type WagerHistory = {
  day: HistoryPoint[];
  week: HistoryPoint[];
  month: HistoryPoint[];
};

export type HistoryGrain = keyof WagerHistory;

export type WagerPeriods = {
  all: PeriodTotals;
  month: PeriodTotals;
  week: PeriodTotals;
  day: PeriodTotals;
  months: MonthRow[];
  /* The same facts as `months`, plus days and weeks. "Month by month" showed
     one row because syncing started this month; days show the shape of a week
     straight away. */
  history: WagerHistory;
  /** Which UTC month, week and day these figures cover. */
  labels: { month: string; week: string; day: string };
  ready: boolean;
  lastSyncedAt: string | null;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function utcMonthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function utcWeekStart(d: Date) {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}
function utcDayStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * EXACT WAGER PER PERIOD.
 *
 * Read straight from what Roobet was asked for, rather than derived from the
 * difference between two snapshots. Every figure here is a fact the API
 * returned for that exact UTC window, which is why "this month" is right on
 * the first sync instead of the second.
 *
 * UTC throughout, because Roobet reports in UTC - so a month here is the same
 * month the affiliate panel shows and commission is paid on.
 */
export async function getWagerPeriods(): Promise<WagerPeriods> {
  const supabase = createClient();
  const now = new Date();

  const monthKey = isoDay(utcMonthStart(now));
  const weekKey = isoDay(utcWeekStart(now));
  const dayKey = isoDay(utcDayStart(now));

  type Row = {
    source: string;
    wagerers: number;
    total: number;
    claimed_total: number;
    unclaimed_total: number;
  };

  const totalsFor = (type: string, start: string) =>
    supabase
      .rpc("wager_period_totals", { p_type: type, p_start: start })
      .then((r) => (r.data ?? []) as Row[]);

  const [allRows, monthRows, weekRows, dayRows, historyRes] = await Promise.all([
    totalsFor("all", "1970-01-01"),
    totalsFor("month", monthKey),
    totalsFor("week", weekKey),
    totalsFor("day", dayKey),
    supabase
      .rpc("wager_month_history")
      .then((r) => (r.data ?? []) as { period_start: string; total: number; wagerers: number }[]),
  ]);

  /* Day, week and month series. Asked for separately from the totals above
     because those are "right now" and these are "over time" - different
     questions, and only these three need a row limit.

     60 days is what migration 024 keeps (75, with room to spare). 26 weeks and
     24 months are simply more than anyone reads on one screen. */
  type HistRow = { period_start: string; total: number; wagerers: number };

  /* One call for all three grains. It was three, each scanning the same table
     for the same rows and differing only in which period_type they wanted -
     three round trips and three scans to answer one question. */
  const { data: histAll } = await supabase.rpc("wager_all_history", {
    p_days: 60,
    p_weeks: 26,
    p_months: 24,
  });

  const grouped = { day: [] as HistRow[], week: [] as HistRow[], month: [] as HistRow[] };
  for (const r of (histAll ?? []) as (HistRow & { grain: HistoryGrain })[]) {
    grouped[r.grain]?.push(r);
  }
  const dayHist = grouped.day;
  const weekHist = grouped.week;
  const monthHist = grouped.month;

  const fold = (rows: Row[]): PeriodTotals => ({
    total: rows.reduce((a, r) => a + Number(r.total), 0),
    claimed: rows.reduce((a, r) => a + Number(r.claimed_total), 0),
    unclaimed: rows.reduce((a, r) => a + Number(r.unclaimed_total), 0),
    wagerers: rows.reduce((a, r) => a + Number(r.wagerers), 0),
    byCode: rows.map((r) => ({
      source: r.source,
      total: Number(r.total),
      wagerers: Number(r.wagerers),
    })),
  });

  const months: MonthRow[] = (historyRes ?? []).map((m) => {
    const ym = String(m.period_start).slice(0, 7);
    return {
      month: ym,
      label: `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`,
      total: Number(m.total),
      wagerers: Number(m.wagerers),
    };
  });

  const prettyUtc = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(d);

  const point = (grain: HistoryGrain) => (r: HistRow): HistoryPoint => {
    const d = new Date(String(r.period_start).slice(0, 10) + "T00:00:00Z");
    const label =
      grain === "month"
        ? prettyUtc(d, { month: "short", year: "numeric" })
        : grain === "week"
          ? "w/c " + prettyUtc(d, { day: "numeric", month: "short" })
          : prettyUtc(d, { day: "numeric", month: "short" });
    return {
      start: String(r.period_start).slice(0, 10),
      label,
      total: Number(r.total),
      wagerers: Number(r.wagerers),
    };
  };

  /* Already oldest-first: wager_all_history picks the most recent n with a
     window function, then orders ascending, so no reversing here. */
  const series = (rows: HistRow[], grain: HistoryGrain) =>
    rows.map(point(grain));

  return {
    all: fold(allRows),
    month: fold(monthRows),
    week: fold(weekRows),
    day: fold(dayRows),
    months,
    history: {
      day: series(dayHist, "day"),
      week: series(weekHist, "week"),
      month: series(monthHist, "month"),
    },
    labels: {
      month: prettyUtc(utcMonthStart(now), { month: "long", year: "numeric" }),
      week: `week of ${prettyUtc(utcWeekStart(now), { day: "numeric", month: "short" })}`,
      day: prettyUtc(now, { day: "numeric", month: "short" }),
    },
    ready: allRows.length > 0 || monthRows.length > 0,
    lastSyncedAt: await newestSyncTime(),
  };
}

export type RepPeriod = {
  userId: string;
  name: string;
  players: number;
  wagered: number;
};

/**
 * Contribution by rep for one period, from the same stored facts as the
 * totals. Only players actually in a book count, which is what commission is
 * paid on.
 */
export async function getRepPeriods(now = new Date()): Promise<{
  reps: { userId: string; name: string; day: number; week: number; month: number; all: number; players: number }[];
  allTotal: number;
}> {
  const supabase = createClient();

  const call = (type: string, start: string) =>
    supabase
      .rpc("wager_period_by_rep", { p_type: type, p_start: start })
      .then((r) => (r.data ?? []) as { owner_id: string; owner_name: string; players: number; wagered: number }[]);

  const [all, month, week, day] = await Promise.all([
    call("all", "1970-01-01"),
    call("month", isoDay(utcMonthStart(now))),
    call("week", isoDay(utcWeekStart(now))),
    call("day", isoDay(utcDayStart(now))),
  ]);

  const pick = (rows: { owner_id: string; wagered: number }[], id: string) =>
    Number(rows.find((r) => r.owner_id === id)?.wagered ?? 0);

  const reps = all.map((r) => ({
    userId: r.owner_id,
    name: r.owner_name,
    players: Number(r.players),
    all: Number(r.wagered),
    month: pick(month, r.owner_id),
    week: pick(week, r.owner_id),
    day: pick(day, r.owner_id),
  }));

  return {
    reps,
    allTotal: reps.reduce((a, r) => a + r.all, 0),
  };
}

/** When any source last reported in - drives the freshness indicator. */
async function newestSyncTime(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("wager_sources")
    .select("last_synced_at")
    .eq("active", true)
    .not("last_synced_at", "is", null)
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.last_synced_at ?? null;
}

export type PeriodPlayer = {
  username: string;
  wagered: number;
  sources: string;
  playerId: string | null;
  ownerName: string | null;
  status: string | null;
  /** Recognised as wagering before the CRM existed - hidden, not deleted. */
  ignored: boolean;
};

export type PeriodPlayers = {
  rows: PeriodPlayer[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

/** Resolve a period choice from the URL into the key wager_periods stores. */
export function resolvePeriodKey(choice: string, now = new Date()) {
  if (/^\d{4}-\d{2}$/.test(choice)) {
    return { type: "month" as const, start: `${choice}-01` };
  }
  if (choice === "day") return { type: "day" as const, start: isoDay(utcDayStart(now)) };
  if (choice === "week") return { type: "week" as const, start: isoDay(utcWeekStart(now)) };
  if (choice === "month") return { type: "month" as const, start: isoDay(utcMonthStart(now)) };
  // All time is the default: it is the figure that does not move under you.
  return { type: "all" as const, start: "1970-01-01" };
}

/**
 * Who wagered it. Same period vocabulary as the totals above, so the list and
 * the headline figure can never be measuring different things.
 */
export async function getPeriodPlayers(
  type: string,
  start: string,
  search = "",
  page = 1,
  pageSize = 50
): Promise<PeriodPlayers> {
  const supabase = createClient();
  const safePage = Math.max(1, page);

  const { data } = await supabase.rpc("wager_period_players", {
    p_type: type,
    p_start: start,
    p_search: search.trim(),
    p_limit: pageSize,
    p_offset: (safePage - 1) * pageSize,
  });

  const rows = (data ?? []) as {
    username: string;
    wagered: number;
    sources: string;
    player_id: string | null;
    owner_name: string | null;
    status: string | null;
    ignored: boolean;
    total_count: number;
  }[];

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

  return {
    rows: rows.map((r) => ({
      username: r.username,
      wagered: Number(r.wagered),
      sources: r.sources,
      playerId: r.player_id,
      ownerName: r.owner_name,
      status: r.status,
      ignored: Boolean(r.ignored),
    })),
    total,
    page: safePage,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/* ------------------------------------------------------------ Wager report */

/**
 * PER-PLAYER WAGER FOR A DATE WINDOW.
 *
 * The report behind weekly and monthly reviews: who produced what, between two
 * dates. Row Level Security scopes it automatically - a rep calling this sees
 * their own players, an admin sees everyone - so the same function serves both
 * the Stats page and the Admin wager tab.
 */
/**
 * THE REPORT - now covering everyone.
 *
 * It used to read wager_deltas: the difference between two snapshots. That is
 * why it showed $0 next to $81m, and why it only ever counted players already
 * in a book. It now reads the same stored period facts as everything else on
 * the page, and includes unowned usernames, because money that arrived is
 * money that arrived.
 *
 * Periods, not arbitrary dates. Roobet is asked for whole UTC windows, so
 * those are the windows that can be answered exactly. A year is just every
 * month in it added up.
 */
export type ReportPeriod =
  | { kind: "all" }
  | { kind: "day"; start: string }
  | { kind: "week"; start: string }
  | { kind: "month"; from: string; to: string };

/**
 * The stats page offers rolling windows (7 days, 30 days) but Roobet is only
 * ever asked for whole UTC periods, so those are the only windows that can be
 * answered exactly. This maps a rolling choice onto the nearest true period
 * rather than inventing a figure - the label on screen says which one it is.
 */
export function reportChoiceFor(rangeKey: string): string {
  switch (rangeKey) {
    case "today":
      return "day";
    case "7d":
      return "week";
    case "30d":
    case "mtd":
      return "month";
    case "90d":
      return "quarter";
    case "ytd":
      return "ytd";
    case "all":
      return "all";
    default:
      return "month";
  }
}

export function resolveReportPeriod(choice: string, now = new Date()): {
  period: ReportPeriod;
  label: string;
  slug: string;
} {
  const year = now.getUTCFullYear();

  if (/^\d{4}-\d{2}$/.test(choice)) {
    const label = `${MONTH_NAMES[Number(choice.slice(5, 7)) - 1]} ${choice.slice(0, 4)}`;
    return {
      period: { kind: "month", from: `${choice}-01`, to: `${choice}-01` },
      label,
      slug: choice,
    };
  }

  if (/^\d{4}$/.test(choice)) {
    return {
      period: { kind: "month", from: `${choice}-01-01`, to: `${choice}-12-01` },
      label: choice,
      slug: choice,
    };
  }

  if (choice === "day") {
    const start = isoDay(utcDayStart(now));
    return { period: { kind: "day", start }, label: "Today", slug: `day-${start}` };
  }

  if (choice === "week") {
    const start = isoDay(utcWeekStart(now));
    return { period: { kind: "week", start }, label: "This week", slug: `week-${start}` };
  }

  if (choice === "quarter") {
    const to = utcMonthStart(now);
    const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 2, 1));
    return {
      period: { kind: "month", from: isoDay(from), to: isoDay(to) },
      label: "Last 3 months",
      slug: "last-3-months",
    };
  }

  if (choice === "month") {
    const start = isoDay(utcMonthStart(now));
    return {
      period: { kind: "month", from: start, to: start },
      label: "This month",
      slug: start.slice(0, 7),
    };
  }

  if (choice === "ytd") {
    return {
      period: { kind: "month", from: `${year}-01-01`, to: `${year}-12-01` },
      label: `${year} to date`,
      slug: `${year}-ytd`,
    };
  }

  return { period: { kind: "all" }, label: "All time", slug: "all-time" };
}

export type ReportRow = {
  username: string;
  wagered: number;
  sources: string;
  playerId: string | null;
  reference: string | null;
  handle: string | null;
  ownerId: string | null;
  ownerName: string | null;
  status: string | null;
  allTime: number;
};

export type WagerReport = {
  rows: ReportRow[];
  total: number;
  claimedTotal: number;
  unclaimedTotal: number;
  wagererCount: number;
};

export async function getWagerReport(
  period: ReportPeriod,
  ownerId?: string,
  limit = 5000
): Promise<WagerReport> {
  const supabase = createClient();

  const args =
    period.kind === "all"
      ? { p_type: "all", p_from: "1970-01-01", p_to: null }
      : period.kind === "day"
        ? { p_type: "day", p_from: period.start, p_to: null }
        : period.kind === "week"
          ? { p_type: "week", p_from: period.start, p_to: null }
          : { p_type: "month", p_from: period.from, p_to: period.to };

  /* Rows and totals asked for separately, on purpose.

     The totals used to be `rows.reduce(...)` over whatever the limit returned,
     so "500 wagerers" meant "the limit is 500" and the money figures were the
     top 500 only - disagreeing with the headline cards on the same page, which
     are a real aggregate. A total is a property of the data, not of the page
     size. */
  const [{ data }, { data: totalsData }] = await Promise.all([
    supabase.rpc("wager_report_rows", {
      ...args,
      p_owner: ownerId ?? null,
      p_limit: limit,
    }),
    supabase.rpc("wager_report_totals", {
      ...args,
      p_owner: ownerId ?? null,
    }),
  ]);

  const raw = (data ?? []) as {
    username: string;
    wagered: number;
    sources: string;
    player_id: string | null;
    reference: string | null;
    handle: string | null;
    owner_id: string | null;
    owner_name: string | null;
    status: string | null;
    all_time: number;
  }[];

  const rows: ReportRow[] = raw.map((r) => ({
    username: r.username,
    wagered: Number(r.wagered),
    sources: r.sources,
    playerId: r.player_id,
    reference: r.reference,
    handle: r.handle,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    status: r.status,
    allTime: Number(r.all_time),
  }));

  /* Fall back to the old row-derived figures only if the totals function is
     missing - i.e. migration 029 has not been run yet. Wrong-but-close beats
     a blank page, and the row count reveals it: if it exactly equals the
     limit, it is the limit you are reading. */
  const t = (totalsData ?? [])[0] as
    | { total: number; claimed: number; unclaimed: number; wagerers: number }
    | undefined;

  return {
    rows,
    total: t ? Number(t.total) : rows.reduce((a, r) => a + r.wagered, 0),
    claimedTotal: t
      ? Number(t.claimed)
      : rows.filter((r) => r.ownerId).reduce((a, r) => a + r.wagered, 0),
    unclaimedTotal: t
      ? Number(t.unclaimed)
      : rows.filter((r) => !r.ownerId).reduce((a, r) => a + r.wagered, 0),
    wagererCount: t ? Number(t.wagerers) : rows.length,
  };
}

/* ------------------------------------------------------------ Wager sources */

export type WagerSource = {
  id: string;
  name: string;
  url: string;
  keyMasked: string;      // the real key never reaches a browser
  auth_style: "bearer" | "header" | "query";
  header_name: string;
  active: boolean;
  last_synced_at: string | null;
  last_status: string | null;
};

/** Sources with their keys masked to the last four characters. */
export async function getWagerSources(): Promise<WagerSource[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("wager_sources")
    .select("id, name, url, api_key, auth_style, header_name, active, last_synced_at, last_status")
    .order("name");

  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    keyMasked: `····${String(s.api_key).slice(-4)}`,
    auth_style: s.auth_style as WagerSource["auth_style"],
    header_name: s.header_name,
    active: s.active,
    last_synced_at: s.last_synced_at,
    last_status: s.last_status,
  }));
}

/** The audit trail, for the admin overview. */
export async function getRecentAudit(limit = 10) {
  const supabase = createClient();
  const [{ data }, names] = await Promise.all([
    supabase
      .from("admin_audit")
      .select("id, actor_id, action, target_user, detail, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(limit),
    ownerNames(),
  ]);

  return (data ?? []).map((a) => ({
    ...a,
    actorName: names.get(a.actor_id) ?? "—",
    targetName: a.target_user ? names.get(a.target_user) ?? "—" : null,
  }));
}
