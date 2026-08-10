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
    supabase.from("players").select("owner_id").limit(100000),
  ]);

  const bookSize = new Map<string, number>();
  for (const p of players ?? []) {
    bookSize.set(p.owner_id, (bookSize.get(p.owner_id) ?? 0) + 1);
  }

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
    supabase.from("players").select("status").limit(100000),
  ]);

  const counts = new Map<string, number>();
  for (const p of players ?? []) {
    counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
  }

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
    supabase.from("players").select("source").limit(100000),
  ]);

  const counts = new Map<string, number>();
  for (const p of players ?? []) {
    if (p.source) counts.set(p.source, (counts.get(p.source) ?? 0) + 1);
  }

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
};

export async function getImportHistory(): Promise<ImportBatch[]> {
  const supabase = createClient();
  const [{ data }, names] = await Promise.all([
    supabase
      .from("import_batches")
      .select(
        "id, filename, rows_total, rows_imported, rows_rejected, rejections, created_at, target_user_id"
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
