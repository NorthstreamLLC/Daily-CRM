import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * WAGER SYNC - the shared core.
 *
 * Called two ways: an admin pressing the button, and the hourly cron. Both run
 * exactly this code, so a scheduled run can never quietly behave differently
 * from the one you tested by hand.
 *
 * Runs every active source in Admin > Settings > Wager sources, matches
 * leaderboard entries to players by Roobet username, writes a dated snapshot
 * per match and updates each player's current figure.
 *
 * One bad source does not stop the others - each reports its own result, and
 * that result is stored on the source row so the settings screen always shows
 * how the last run went.
 *
 * The parser is deliberately tolerant about where the array lives and what the
 * fields are called, because leaderboard endpoints vary. Whatever happens, the
 * response says exactly what matched and what did not - a sync that cannot
 * explain itself is a sync nobody will trust.
 */

type Entry = { username: string; wagered: number };

type SourceRow = {
  id: string;
  name: string;
  url: string;
  api_key: string;
  auth_style: "bearer" | "header" | "query";
  header_name: string;
  query_param: string;
};

export type SourceResult = {
  name: string;
  entries: number;
  matched: number;
  unmatchedSample: string[];
  error?: string;
};

function findArray(payload: unknown, depth = 0): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (depth > 2 || !payload || typeof payload !== "object") return null;
  for (const key of ["data", "leaderboard", "entries", "results", "players", "items"]) {
    const value = (payload as Record<string, unknown>)[key];
    const found = findArray(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function readEntry(raw: unknown): Entry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const username = [r.username, r.name, r.user, r.player, r.roobet_username].find(
    (v) => typeof v === "string" && v.trim()
  ) as string | undefined;

  // weightedWagered first: Roobet reports both, and weighted is the figure the
  // business runs on - it is what the old spreadsheets tracked.
  const wageredRaw = [
    r.weightedWagered,
    r.weighted_wagered,
    r.wagered,
    r.wager,
    r.totalWagered,
    r.total_wagered,
    r.amount,
  ].find((v) => typeof v === "number" || (typeof v === "string" && v.trim() !== ""));

  const wagered =
    typeof wageredRaw === "number"
      ? wageredRaw
      : Number(String(wageredRaw).replace(/[$,]/g, ""));

  if (!username || !Number.isFinite(wagered)) return null;
  return { username: username.trim(), wagered };
}

async function fetchSource(
  source: SourceRow,
  startIso?: string,
  endIso?: string
): Promise<Entry[] | { error: string }> {
  let url = source.url;
  const headers: Record<string, string> = { Accept: "application/json" };

  if (source.auth_style === "bearer") {
    headers.Authorization = `Bearer ${source.api_key}`;
  } else if (source.auth_style === "header") {
    headers[source.header_name || "x-api-key"] = source.api_key;
  } else {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}${encodeURIComponent(source.query_param || "key")}=${encodeURIComponent(source.api_key)}`;
  }

  // Roobet returns an empty list without an explicit window, so one is always
  // supplied. The caller passes the period it wants; the default is all-time.
  if (!/[?&]startDate=/.test(url)) {
    const sep = url.includes("?") ? "&" : "?";
    url =
      `${url}${sep}startDate=${encodeURIComponent(startIso ?? "2020-01-01T00:00:00.000Z")}` +
      `&endDate=${encodeURIComponent(endIso ?? new Date().toISOString())}`;
  }

  let payload: unknown;
  try {
    const response = await fetch(url, { headers, cache: "no-store" });
    if (!response.ok) {
      return { error: `answered ${response.status} — check the URL and key` };
    }
    payload = await response.json();
  } catch (e) {
    return { error: `unreachable: ${(e as Error).message}` };
  }

  const rawEntries = findArray(payload);
  if (!rawEntries) {
    return {
      error:
        "responded, but no player list found in the JSON. Send me a sample response and I'll match the format.",
    };
  }

  return rawEntries.map(readEntry).filter((e): e is Entry => e !== null);
}

export type SyncOutcome =
  | { error: string }
  | { results: SourceResult[]; advanced: number; periodsWritten?: number };

/* ------------------------------------------------------------ UTC periods */

/** Midnight UTC on the 1st of the month containing `d`. */
function monthStartUtc(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Midnight UTC on the Monday of the ISO week containing `d`. */
function weekStartUtc(d: Date) {
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)
  );
  return monday;
}

function dayStartUtc(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The periods the sync refreshes every run.
 *
 * All UTC, because Roobet reports in UTC - a month here is Roobet's month, the
 * same figure the affiliate panel shows and commission is paid on.
 */
export function currentPeriods(now = new Date()) {
  return [
    { type: "all" as const, start: new Date("2020-01-01T00:00:00Z"), key: "1970-01-01" },
    { type: "month" as const, start: monthStartUtc(now), key: ymd(monthStartUtc(now)) },
    { type: "week" as const, start: weekStartUtc(now), key: ymd(weekStartUtc(now)) },
    { type: "day" as const, start: dayStartUtc(now), key: ymd(dayStartUtc(now)) },
  ];
}

/**
 * Ask one source for one window and store it as a fact.
 *
 * Upserted on (username, source, period_type, period_start), so re-running
 * refreshes the figure rather than accumulating duplicates. That is what makes
 * a half-hourly sync safe: today's row is simply overwritten with today's
 * latest total.
 */
export async function refreshPeriod(
  supabase: SupabaseClient,
  source: SourceRow,
  period: { type: "all" | "month" | "week" | "day"; start: Date; key: string },
  now = new Date()
): Promise<{ rows: number } | { error: string }> {
  const outcome = await fetchSource(source, period.start.toISOString(), now.toISOString());
  if ("error" in outcome) return { error: outcome.error };

  const rows = outcome
    .filter((e) => e.wagered > 0)
    .map((e) => ({
      username: e.username,
      source: source.name,
      period_type: period.type,
      period_start: period.key,
      wagered: e.wagered,
      refreshed_at: now.toISOString(),
    }));

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from("wager_periods")
      .upsert(rows.slice(i, i + 500), {
        onConflict: "username,source,period_type,period_start",
      });
    if (error) {
      return {
        error: /does not exist|schema cache/i.test(error.message)
          ? "wager_periods table missing - run migration 20260812000017_wager_periods.sql"
          : error.message,
      };
    }
  }

  return { rows: rows.length };
}

export async function runWagerSync(
  supabase: SupabaseClient,
  actorId: string,
  trigger: "manual" | "scheduled" | "auto"
): Promise<SyncOutcome> {
  const { data: sources } = await supabase
    .from("wager_sources")
    .select("id, name, url, api_key, auth_style, header_name, query_param")
    .eq("active", true)
    .order("name");

  if (!sources || sources.length === 0) {
    return { error: "No active sources. Add one first." };
  }

  // Every player with a Roobet username, whoever owns them. Status and current
  // wager come too - the automatic advance needs both.
  const { data: players } = await supabase
    .from("players")
    .select("id, roobet_username, status, weighted_wager, first_deposit_at, owner_id")
    .not("roobet_username", "is", null)
    .limit(100000);

  type PlayerRow = {
    id: string;
    roobet_username: string | null;
    status: string;
    weighted_wager: number | null;
    first_deposit_at: string | null;
    owner_id: string;
  };

  const byUsername = new Map<string, PlayerRow>(
    ((players ?? []) as PlayerRow[])
      .filter((p) => p.roobet_username?.trim())
      .map((p) => [p.roobet_username!.trim().toLowerCase(), p])
  );

  // Settings for the automatic advance.
  const { data: settingRows } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["auto_active_on_wager", "auto_active_min_wager", "auto_active_from_dead"]);

  const setting = new Map((settingRows ?? []).map((s) => [s.key, s.value]));
  const autoAdvance = (setting.get("auto_active_on_wager") ?? "true") === "true";
  const minIncrease = Math.max(0, Number(setting.get("auto_active_min_wager") ?? 1) || 1);
  const reviveDead = (setting.get("auto_active_from_dead") ?? "true") === "true";

  // Advancing to a stage that does not exist would fail on the foreign key.
  const { data: activeStage } = await supabase
    .from("statuses")
    .select("name")
    .eq("name", "Active")
    .maybeSingle();

  const canAdvance = autoAdvance && Boolean(activeStage);
  const advanced: { playerId: string; ownerId: string; from: string; wagered: number }[] = [];

  // Which (player, source) pairs already have history - a matched player
  // without any is a fresh claim, whose ledger history gets copied across.
  const { data: existingSnaps } = await supabase
    .from("wager_snapshots")
    .select("player_id, source")
    .limit(200000);

  const hasHistory = new Set(
    (existingSnaps ?? []).map((s) => `${s.player_id}|${s.source}`)
  );

  const results: SourceResult[] = [];
  // The latest figure per player across all sources this run - if two
  // leaderboards report the same player, the larger total wins the display.
  const latest = new Map<string, number>();

  for (const source of sources as SourceRow[]) {
    const outcome = await fetchSource(source);

    if ("error" in outcome) {
      results.push({
        name: source.name,
        entries: 0,
        matched: 0,
        unmatchedSample: [],
        error: outcome.error,
      });
      await supabase
        .from("wager_sources")
        .update({ last_synced_at: new Date().toISOString(), last_status: `Failed: ${outcome.error}` })
        .eq("id", source.id);
      continue;
    }

    let matched = 0;
    const unmatched: string[] = [];
    const snapshots: { player_id: string; wagered: number; source: string }[] = [];
    const ledger: { username: string; wagered: number; source: string }[] = [];
    const freshClaims: { playerId: string; username: string }[] = [];

    for (const entry of outcome) {
      // EVERY entry goes in the ledger - the general book is most of the money.
      ledger.push({ username: entry.username, wagered: entry.wagered, source: source.name });

      const player = byUsername.get(entry.username.toLowerCase());
      if (!player) {
        if (unmatched.length < 15) unmatched.push(entry.username);
        continue;
      }
      const playerId = player.id;
      matched += 1;
      snapshots.push({ player_id: playerId, wagered: entry.wagered, source: source.name });
      latest.set(playerId, Math.max(latest.get(playerId) ?? 0, entry.wagered));

      if (!hasHistory.has(`${playerId}|${source.name}`)) {
        freshClaims.push({ playerId, username: entry.username });
      }

      /* WAGER PROVES PLAY. A rise past the threshold means they deposited and
         are playing, so anyone not already Active moves there. Recorded once
         per sync per player - the guard below stops a second source repeating
         the same move. */
      if (
        canAdvance &&
        player.status !== "Active" &&
        (reviveDead || player.status !== "Dead Lead") &&
        entry.wagered - Number(player.weighted_wager ?? 0) >= minIncrease &&
        !advanced.some((a) => a.playerId === playerId)
      ) {
        advanced.push({
          playerId,
          ownerId: player.owner_id,
          from: player.status,
          wagered: entry.wagered,
        });
      }
    }

    /* The ledger holds the company-wide picture, so a failed write here is the
       difference between real totals and zeroes. Report it rather than letting
       the sync claim success on data it never stored. */
    let ledgerError: string | null = null;
    for (let i = 0; i < ledger.length; i += 500) {
      const { error } = await supabase
        .from("wager_external")
        .insert(ledger.slice(i, i + 500));
      if (error) {
        ledgerError = /does not exist|schema cache/i.test(error.message)
          ? "the wager_external table is missing - run migration 20260811000010_wager_external.sql"
          : error.message;
        break;
      }
    }

    if (ledgerError) {
      results.push({
        name: source.name,
        entries: outcome.length,
        matched: 0,
        unmatchedSample: [],
        error: `couldn't store company wager: ${ledgerError}`,
      });
      await supabase
        .from("wager_sources")
        .update({
          last_synced_at: new Date().toISOString(),
          last_status: `Failed: ${ledgerError}`,
        })
        .eq("id", source.id);
      continue;
    }

    if (snapshots.length > 0) {
      const { error } = await supabase.from("wager_snapshots").insert(snapshots);
      if (error) {
        results.push({
          name: source.name,
          entries: outcome.length,
          matched: 0,
          unmatchedSample: [],
          error: error.message,
        });
        continue;
      }
    }

    /* CLAIMING BRINGS HISTORY. A player matched for the first time may have
       months of ledger history from before anyone put them in a book - copy it
       onto the player, so their wager record starts when their wagering did,
       not when someone typed their name in. */
    for (let i = 0; i < freshClaims.length; i += 100) {
      const chunk = freshClaims.slice(i, i + 100);
      const { data: history } = await supabase
        .from("wager_external")
        .select("username, wagered, captured_at")
        .eq("source", source.name)
        .in("username", chunk.map((c) => c.username))
        .lt("captured_at", new Date(Date.now() - 60_000).toISOString());

      if (!history || history.length === 0) continue;

      const idFor = new Map(chunk.map((c) => [c.username.toLowerCase(), c.playerId]));
      const copies = history
        .map((h) => ({
          player_id: idFor.get(h.username.toLowerCase()),
          wagered: h.wagered,
          source: source.name,
          captured_at: h.captured_at,
        }))
        .filter((c): c is typeof c & { player_id: string } => Boolean(c.player_id));

      for (let j = 0; j < copies.length; j += 500) {
        await supabase.from("wager_snapshots").insert(copies.slice(j, j + 500));
      }
      for (const c of chunk) hasHistory.add(`${c.playerId}|${source.name}`);
    }

    const status = `Matched ${matched} of ${outcome.length}`;
    await supabase
      .from("wager_sources")
      .update({ last_synced_at: new Date().toISOString(), last_status: status })
      .eq("id", source.id);

    results.push({
      name: source.name,
      entries: outcome.length,
      matched,
      unmatchedSample: unmatched,
    });
  }

  /* EXACT PERIOD TOTALS.
     Asking Roobet directly for "1 Aug 00:00 UTC to now" gives August's figure
     as a fact. Deriving it from snapshot differences needed two readings and
     showed $0 until the second sync - correct arithmetic, useless answer. */
  const periods = currentPeriods(new Date());
  let periodsWritten = 0;

  for (const source of sources as SourceRow[]) {
    for (const period of periods) {
      const outcome = await refreshPeriod(supabase, source, period);
      if ("error" in outcome) {
        const existing = results.find((r) => r.name === source.name);
        if (existing && !existing.error) {
          existing.error = `periods: ${outcome.error}`;
        }
        break;
      }
      periodsWritten += outcome.rows;
    }
  }

  for (const [playerId, wagered] of Array.from(latest.entries())) {
    await supabase.from("players").update({ weighted_wager: wagered }).eq("id", playerId);
  }

  /* AUTOMATIC ADVANCE.
     Applied after every source has run, so a player on two leaderboards moves
     once. The log entry is written against the player's OWNER, not the admin
     who pressed sync - the rep worked this lead, so the rep's numbers should
     show it. */
  const now = new Date().toISOString();

  for (const move of advanced) {
    const player = Array.from(byUsername.values()).find((p) => p.id === move.playerId);

    const patch: Record<string, unknown> = { status: "Active" };
    if (!player?.first_deposit_at) patch.first_deposit_at = now;

    const { error } = await supabase
      .from("players")
      .update(patch)
      .eq("id", move.playerId);

    if (error) continue;

    await supabase.from("activity_log").insert({
      player_id: move.playerId,
      user_id: move.ownerId,
      event_type: "status_change",
      from_status: move.from,
      to_status: "Active",
      metadata: { automatic: true, trigger: "wager", wagered: move.wagered },
    });
  }

  await supabase.from("admin_audit").insert({
    actor_id: actorId,
    action: trigger === "scheduled" ? "wager_sync_scheduled" : "wager_sync",
    detail: {
      sources: results.map((r) => ({ name: r.name, matched: r.matched, error: r.error ?? null })),
      advanced: advanced.length,
    },
  });

  return { results, advanced: advanced.length, periodsWritten };
}
