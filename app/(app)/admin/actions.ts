"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, serviceRoleHelp } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { resolveStatus, parseCsv, guessMapping, parseDate } from "@/lib/csv";

export type AdminState = { error?: string; message?: string; warning?: string } | null;

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/today");
  revalidatePath("/book");
  revalidatePath("/stats");
}

/** Records the action, so a change to someone's access is never anonymous. */
async function audit(
  actorId: string,
  action: string,
  targetUser: string | null,
  detail: Record<string, unknown> = {}
) {
  const supabase = createClient();
  await supabase
    .from("admin_audit")
    .insert({ actor_id: actorId, action, target_user: targetUser, detail });
}

/* ------------------------------------------------------------ Create a user */

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Riga",
  "Africa/Johannesburg",
  "Asia/Manila",
  "Asia/Kolkata",
  "Australia/Sydney",
  "UTC",
];

export async function getTimezones() {
  return TIMEZONES;
}

/**
 * CREATE A PERSON.
 *
 * Two steps that must both succeed: a login in Supabase Auth, and the matching
 * row in public.users that gives them a code, a time zone and a role.
 *
 * If the second step fails the first is rolled back by deleting the login -
 * otherwise you get exactly the state that broke Support's first sign-in: an
 * account that authenticates but has no profile behind it, and an app that says
 * "account not set up" with no way to fix it from the interface.
 */
export async function createUser(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const admin = createAdminClient();
  if (!admin) return { error: `Cannot create logins yet. ${serviceRoleHelp()}` };

  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "user") === "admin" ? "admin" : "user";
  const timezone = String(formData.get("timezone") ?? "UTC");
  const defaultSource = String(formData.get("default_source") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name) return { error: "Enter a name." };
  if (!/^[A-Z]{2,4}$/.test(code)) {
    return { error: "Code must be 2-4 letters. It prefixes their player references." };
  }
  if (!email.includes("@")) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Temporary password must be at least 8 characters." };
  if (!TIMEZONES.includes(timezone)) return { error: "Pick a time zone from the list." };

  const supabase = createClient();

  const { data: clash } = await supabase
    .from("users")
    .select("name, code")
    .or(`code.eq.${code},email.eq.${email}`)
    .maybeSingle();

  if (clash) {
    return { error: `${clash.code} / that email is already used by ${clash.name}.` };
  }

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !created?.user) {
    return { error: authError?.message ?? "Could not create the login." };
  }

  const { error: profileError } = await supabase.from("users").insert({
    id: created.user.id,
    name,
    code,
    email,
    role,
    timezone,
    default_source: defaultSource || null,
    active: true,
  });

  if (profileError) {
    // Roll the login back rather than leaving a half-made account behind.
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: `Could not set up the profile, so the login was removed. ${profileError.message}` };
  }

  // Give them the standard targets straight away, so their dashboard is not
  // reading zeroes on day one.
  await supabase.from("kpi_targets").insert({
    user_id: created.user.id,
    outreach_per_day: 100,
    active_leads_per_day: 20,
    vip_transfers_per_day: 3,
    ftd_per_day: 1,
  });

  await audit(me.id, "create_user", created.user.id, { name, code, role });
  refresh();

  return {
    message: `${name} (${code}) created. Send them the temporary password and ask them to reset it on first sign-in.`,
  };
}

/* ------------------------------------------------------------ Edit a person */

export async function updateUser(
  userId: string,
  patch: {
    name?: string;
    timezone?: string;
    default_source?: string | null;
    role?: "user" | "admin";
    active?: boolean;
  }
): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  // Removing your own admin rights would lock you out of this page mid-task.
  if (userId === me.id && (patch.role === "user" || patch.active === false)) {
    return { error: "You can't remove your own access. Ask another admin." };
  }

  if (patch.timezone && !TIMEZONES.includes(patch.timezone)) {
    return { error: "Pick a time zone from the list." };
  }

  const supabase = createClient();
  const { error } = await supabase.from("users").update(patch).eq("id", userId);

  // The database refuses to leave the company without an admin. Pass that
  // message through rather than a generic failure.
  if (error) return { error: error.message };

  const admin = createAdminClient();
  if (admin && patch.active === false) {
    // Stop them signing in as well as hiding them from the app.
    await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  }
  if (admin && patch.active === true) {
    await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
  }

  await audit(me.id, "update_user", userId, patch as Record<string, unknown>);
  refresh();

  /* Say so when the login was NOT actually blocked.

     Without the service-role key the ban above is skipped, and this used to
     report a plain "Saved." - so deactivating someone who had just been fired
     looked identical whether or not the thing that matters had happened. The
     app now refuses them at the door regardless (see the layout), but an admin
     locking someone out deserves to know which locks turned. */
  if (patch.active === false && !admin) {
    return {
      warning:
        "Deactivated, and the CRM will refuse them. Their Supabase login was " +
        "NOT disabled though - that needs SUPABASE_SERVICE_ROLE_KEY set in " +
        "Vercel. Worth fixing if this person left on bad terms.",
    };
  }

  return { message: "Saved." };
}

/**
 * DELETE AN ACCOUNT THAT NEVER DID ANYTHING.
 *
 * This is for test accounts, and only test accounts. If the person has a
 * single player, a single logged action or a single message, it refuses and
 * tells you to reassign and deactivate instead.
 *
 * WHY IT REFUSES RATHER THAN CASCADES
 *   Somebody leaving - even being fired - is not a reason to erase them. Their
 *   activity log is who contacted which player and when, and commission is
 *   argued from it. Deleting a departed rep would silently rewrite the history
 *   of players who are still in somebody's book.
 *
 *   The database already takes this position: players.owner_id,
 *   activity_log.user_id and messages.user_id are all `on delete restrict`, so
 *   Postgres would refuse anyway. This check exists to refuse in a sentence
 *   that explains itself, rather than a foreign key violation.
 *
 * The correct flow for a leaver is the one already on this page:
 *   1. Move their book to someone else
 *   2. Deactivate them - which bans the login and locks the CRM
 */
export async function deleteUser(userId: string): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  if (userId === me.id) return { error: "You can't delete your own account." };

  const supabase = createClient();

  const { data: target } = await supabase
    .from("users")
    .select("id, name, email")
    .eq("id", userId)
    .maybeSingle();

  if (!target) return { error: "That account no longer exists." };

  /* Count everything that would be orphaned, in one round trip. head:true asks
     for the count without shipping any rows. */
  const [players, activity, messages] = await Promise.all([
    supabase.from("players").select("id", { count: "exact", head: true }).eq("owner_id", userId),
    supabase.from("activity_log").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  const playerCount = players.count ?? 0;
  const activityCount = activity.count ?? 0;
  const messageCount = messages.count ?? 0;

  if (playerCount > 0 || activityCount > 0 || messageCount > 0) {
    const parts = [
      playerCount > 0 && `${playerCount} player${playerCount === 1 ? "" : "s"}`,
      activityCount > 0 && `${activityCount} logged action${activityCount === 1 ? "" : "s"}`,
      messageCount > 0 && `${messageCount} message${messageCount === 1 ? "" : "s"}`,
    ].filter(Boolean);

    return {
      error:
        `${target.name} has ${parts.join(", ")} - deleting them would take that ` +
        `history with it, and commission is argued from it. Move their book to ` +
        `someone else, then Deactivate: that bans the login and locks them out ` +
        `of the CRM, and keeps the record of what they did.`,
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      error:
        "Deleting an account needs SUPABASE_SERVICE_ROLE_KEY set in Vercel - " +
        "without it the profile would go and the login would linger. " +
        "Deactivate instead, or add the key and redeploy.",
    };
  }

  /* Delete the LOGIN, and let the database remove the profile.

     public.users.id is `references auth.users(id) on delete cascade`, so this
     one call takes both. Deleting the profile first and the login second would
     be two operations that can half-fail, and the half-failed state is the bad
     one: a login with no profile can still sign in and reach the app.

     One call, one outcome. */
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    return {
      error:
        `Could not delete ${target.name}: ${authError.message}. Nothing was ` +
        `changed - they are still here and can still sign in.`,
    };
  }

  await audit(me.id, "delete_user", null, {
    deleted_id: userId,
    name: target.name,
    email: (target as { email?: string }).email ?? null,
  });
  refresh();

  return { message: `${target.name} deleted.` };
}

/**
 * Send someone a password reset link.
 *
 * Deliberately does not set a password on their behalf. A reset link goes to
 * their inbox and only they see the new password - an admin typing one in and
 * messaging it over is how shared passwords start.
 */
export async function sendPasswordReset(
  userId: string,
  email: string,
  origin: string
): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) return { error: error.message };

  await audit(me.id, "password_reset_sent", userId, { email });
  return { message: `Reset link sent to ${email}.` };
}

/** Move a whole book to someone else - used before deactivating a leaver. */
export async function reassignBook(
  fromUserId: string,
  toUserId: string
): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("reassign_players", {
    p_from: fromUserId,
    p_to: toUserId,
  });

  if (error) return { error: error.message };

  await supabase.rpc("sync_reference_counter", { p_user: toUserId });
  await audit(me.id, "reassign_book", fromUserId, { to: toUserId, count: data });

  /* The receiving rep needs to know. Waking up to a hundred extra players
     with no explanation is how a handover turns into a complaint. */
  if ((data ?? 0) > 0) {
    await supabase.from("notifications").insert({
      user_id: toUserId,
      kind: "book_assigned",
      title: `${data} players moved into your book`,
      body: "An admin reassigned them. They appear in your queue on their normal cadence.",
    });
  }

  refresh();
  return { message: `${data ?? 0} players moved.` };
}

/* ----------------------------------------------------------------- Targets */

/**
 * SET SOMEONE'S TARGETS.
 *
 * Written as a new dated row rather than an edit. Raising a target in March
 * must not make February look like a failure, so past performance is always
 * measured against the target that was actually in force.
 */
export async function setTargets(
  userId: string,
  targets: { activeLeads: number; vipTransfers: number; ftds: number; outreach: number }
): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const clean = {
    active_leads_per_day: Math.max(0, Math.round(targets.activeLeads || 0)),
    vip_transfers_per_day: Math.max(0, Math.round(targets.vipTransfers || 0)),
    ftd_per_day: Math.max(0, Math.round(targets.ftds || 0)),
    outreach_per_day: Math.max(0, Math.round(targets.outreach || 0)),
  };

  const supabase = createClient();
  const { error } = await supabase.from("kpi_targets").upsert(
    {
      user_id: userId,
      ...clean,
      effective_from: new Date().toISOString().slice(0, 10),
    },
    { onConflict: "user_id,effective_from" }
  );

  if (error) return { error: error.message };

  await audit(me.id, "set_targets", userId, clean);
  refresh();
  return { message: "Targets updated from today." };
}

/* ---------------------------------------------------------------- Settings */

export async function updateSetting(key: string, value: string): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const supabase = createClient();
  const { data: setting } = await supabase
    .from("settings")
    .select("value_type, label")
    .eq("key", key)
    .single();

  if (!setting) return { error: "No such setting." };

  const trimmed = value.trim();

  // Validate against the setting's own declared type rather than trusting the
  // form - a text box that should hold a number is one paste away from "3 days".
  if (setting.value_type === "int" && !/^\d+$/.test(trimmed)) {
    return { error: `${setting.label} must be a whole number.` };
  }
  if (setting.value_type === "bool" && !["true", "false"].includes(trimmed)) {
    return { error: `${setting.label} must be on or off.` };
  }
  if (setting.value_type === "text" && key.endsWith("_schedule")) {
    if (!/^\d+(,\d+)*$/.test(trimmed)) {
      return { error: `${setting.label} must be numbers separated by commas, like 1,7,14.` };
    }
  }

  const { error } = await supabase.from("settings").update({ value: trimmed }).eq("key", key);
  if (error) return { error: error.message };

  await audit(me.id, "update_setting", null, { key, value: trimmed });
  refresh();
  return { message: "Saved." };
}

/* ------------------------------------------------------------ Funnel stages */

export async function updateStage(
  name: string,
  patch: { followup_days?: number; next_action?: string; sort_order?: number }
): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  if (patch.followup_days !== undefined) {
    if (!Number.isFinite(patch.followup_days) || patch.followup_days < 0 || patch.followup_days > 365) {
      return { error: "Follow-up days must be between 0 and 365." };
    }
    patch.followup_days = Math.round(patch.followup_days);
  }

  const supabase = createClient();
  const { error } = await supabase.from("statuses").update(patch).eq("name", name);
  if (error) return { error: error.message };

  await audit(me.id, "update_stage", null, { name, ...patch });
  refresh();
  return { message: "Saved. Every player at this stage now uses the new cadence." };
}

/* ----------------------------------------------------------------- Sources */

export async function addSource(name: string): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a source name." };

  const supabase = createClient();
  const { error } = await supabase
    .from("sources")
    .insert({ name: trimmed, sort_order: 99, active: true });

  if (error) return { error: error.message };
  await audit(me.id, "add_source", null, { name: trimmed });
  refresh();
  return { message: `"${trimmed}" added.` };
}

export async function setSourceActive(name: string, active: boolean): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const supabase = createClient();
  const { error } = await supabase.from("sources").update({ active }).eq("name", name);
  if (error) return { error: error.message };

  await audit(me.id, active ? "enable_source" : "retire_source", null, { name });
  refresh();
  return {
    message: active
      ? `"${name}" is selectable again.`
      : `"${name}" retired. Existing players keep it; it just won't be offered for new ones.`,
  };
}

/* ------------------------------------------------------------------ Import */

export type ImportPreview = {
  ok: boolean;
  error?: string;
  filename: string;
  headers: string[];
  mapping: Record<string, number>;
  totalRows: number;
  sample: Record<string, string>[];
  problems: { row: number; reason: string; handle?: string }[];
  willImport: number;
};

const MAX_IMPORT_ROWS = 20000;

/**
 * DRY RUN.
 *
 * Every row is validated and reported on before anything is written. Importing
 * blind and finding out afterwards is how a book ends up with three hundred
 * rows nobody trusts, and the spreadsheet gave no way to tell which ones.
 */
export async function previewImport(
  _prev: ImportPreview | null,
  formData: FormData
): Promise<ImportPreview> {
  const empty: ImportPreview = {
    ok: false,
    filename: "",
    headers: [],
    mapping: {},
    totalRows: 0,
    sample: [],
    problems: [],
    willImport: 0,
  };

  try {
    await requireAdmin();
  } catch (e) {
    return { ...empty, error: (e as Error).message };
  }

  /* The destination is needed to check anything useful, so it is required
     here and not only at the point of writing. */
  if (!String(formData.get("target_user_id") ?? "")) {
    return { ...empty, error: "Choose whose book this is going into first." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ...empty, error: "Choose a CSV file." };
  }
  if (file.size > 15_000_000) {
    return { ...empty, error: "That file is over 15MB. Split it and import in parts." };
  }

  const text = await file.text();
  const { headers, rows } = parseCsv(text);

  if (headers.length === 0) {
    return { ...empty, filename: file.name, error: "That file has no header row." };
  }
  if (rows.length === 0) {
    return { ...empty, filename: file.name, error: "That file has a header but no data." };
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      ...empty,
      filename: file.name,
      error: `${rows.length.toLocaleString()} rows is over the ${MAX_IMPORT_ROWS.toLocaleString()} limit. Split the file.`,
    };
  }

  const mapping = guessMapping(headers);
  if (mapping.handle === undefined) {
    return {
      ...empty,
      filename: file.name,
      headers,
      error:
        "Couldn't find a player handle column. Rename it to 'Handle' and try again.",
    };
  }

  const targetUserId = String(formData.get("target_user_id") ?? "");

  const supabase = createClient();
  const [{ data: statuses }, { data: sources }, { data: everyone }] = await Promise.all([
    supabase.from("statuses").select("name"),
    supabase.from("sources").select("name"),
    /* EVERY player already in the system, not just the target's book.

       Two different collisions matter and they have different consequences:

         same handle, same book      - the row is a no-op, it gets skipped
         same Roobet username, ANY   - the wager is attributed to whichever
         book                          row was updated most recently, which is
                                       arbitrary, and commission is paid on it

       The second one is the expensive one and nothing was looking for it.
       Importing thirteen books one at a time, a player who appears in two
       reps' sheets is not a hypothetical. */
    supabase
      .from("players")
      .select("handle, roobet_username, owner_id")
      .limit(100000),
  ]);

  const validStatuses = new Set((statuses ?? []).map((s) => s.name as string));
  const validSources = new Set((sources ?? []).map((s) => s.name as string));

  const { data: team } = await supabase.from("users").select("id, name");
  const nameOf = new Map((team ?? []).map((u) => [u.id as string, u.name as string]));

  const inTargetBook = new Set<string>();
  const handleElsewhere = new Map<string, string>();
  const roobetTaken = new Map<string, string>();

  for (const p of everyone ?? []) {
    const owner = p.owner_id as string;
    const h = ((p.handle as string) ?? "").trim().toLowerCase();
    const r = ((p.roobet_username as string) ?? "").trim().toLowerCase();

    if (h) {
      if (owner === targetUserId) inTargetBook.add(h);
      else if (!handleElsewhere.has(h)) {
        handleElsewhere.set(h, nameOf.get(owner) ?? "another rep");
      }
    }
    if (r && !roobetTaken.has(r)) {
      roobetTaken.set(r, nameOf.get(owner) ?? "another rep");
    }
  }

  const problems: ImportPreview["problems"] = [];
  const seen = new Set<string>();
  /* Two rows in the SAME file sharing a Roobet username is the same
     misattribution as sharing one with another book, and an old sheet
     copy-pasted from another old sheet is exactly where it comes from. */
  const seenRoobet = new Map<string, string>();
  const sample: Record<string, string>[] = [];
  let willImport = 0;

  rows.forEach((cells, index) => {
    const rowNumber = index + 2; // +1 for the header, +1 for 1-based counting
    const get = (field: string) =>
      mapping[field] !== undefined ? (cells[mapping[field]] ?? "").trim() : "";

    const handle = get("handle");
    if (!handle) {
      problems.push({ row: rowNumber, reason: "No player handle" });
      return;
    }

    const key = handle.toLowerCase();
    if (seen.has(key)) {
      problems.push({ row: rowNumber, reason: "Duplicate of an earlier row in this file", handle });
      return;
    }
    seen.add(key);

    /* Already in the destination book - the import will skip this row.
       Reported here so the count in the preview is the count you get. */
    if (inTargetBook.has(key)) {
      problems.push({
        row: rowNumber,
        reason: "Already in this book — will be skipped",
        handle,
      });
      return;
    }

    // Same person, someone else's book. Imported, but somebody should look.
    const elsewhere = handleElsewhere.get(key);
    if (elsewhere) {
      problems.push({
        row: rowNumber,
        reason: `Also in ${elsewhere}'s book — two reps have this player`,
        handle,
      });
    }

    /* THE EXPENSIVE ONE.

       Two players sharing a Roobet username means the wager report attributes
       the money to whichever row was updated last. That is arbitrary, and
       commission is paid from it. */
    const roobet = get("roobet_username").trim().toLowerCase();
    if (roobet) {
      const twin = seenRoobet.get(roobet);
      if (twin) {
        problems.push({
          row: rowNumber,
          reason:
            `Roobet username "${get("roobet_username")}" is also on "${twin}" ` +
            `earlier in this file — the same person twice under two handles.`,
          handle,
        });
      } else {
        seenRoobet.set(roobet, handle);
      }

      const taken = roobetTaken.get(roobet);
      if (taken) {
        problems.push({
          row: rowNumber,
          reason:
            `Roobet username "${get("roobet_username")}" is already on a player in ` +
            `${taken}'s book — their wager would be counted against whichever ` +
            `record was touched most recently. Fix before importing.`,
          handle,
        });
      }
    }

    const status = get("status");
    const resolved = resolveStatus(status, validStatuses);
    if (resolved.renamedFrom) {
      problems.push({
        row: rowNumber,
        reason: `"${resolved.renamedFrom}" is no longer a status — importing as ${resolved.status}`,
        handle,
      });
    }

    const source = get("source");
    if (source && !validSources.has(source)) {
      problems.push({
        row: rowNumber,
        reason: `Unknown source "${source}" — will be kept as text`,
        handle,
      });
    }

    for (const field of ["assigned_at", "last_contact_at"]) {
      const value = get(field);
      if (value) {
        const { error } = parseDate(value);
        if (error) problems.push({ row: rowNumber, reason: error, handle });
      }
    }

    willImport += 1;
    if (sample.length < 8) {
      sample.push({
        handle,
        roobet_username: get("roobet_username"),
        source,
        status: resolved.status,
        last_contact_at: get("last_contact_at"),
      });
    }
  });

  return {
    ok: willImport > 0,
    filename: file.name,
    headers,
    mapping,
    totalRows: rows.length,
    sample,
    problems: problems.slice(0, 200),
    willImport,
  };
}

/**
 * COMMIT THE IMPORT.
 *
 * Rows that fail validation are skipped and recorded with a reason, rather than
 * failing the whole file. Everything written is tagged with a batch id, so an
 * import that turns out to be wrong can be found and removed as a unit.
 */
export async function runImport(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const targetUserId = String(formData.get("target_user_id") ?? "");
  const file = formData.get("file");

  if (!targetUserId) return { error: "Choose whose book this goes into." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };

  const supabase = createClient();

  const { data: target } = await supabase
    .from("users")
    .select("id, name")
    .eq("id", targetUserId)
    .single();

  if (!target) return { error: "That person no longer exists." };

  const text = await file.text();
  const { headers, rows } = parseCsv(text);
  const mapping = guessMapping(headers);

  if (mapping.handle === undefined) return { error: "No player handle column found." };
  if (rows.length > MAX_IMPORT_ROWS) return { error: "Too many rows. Split the file." };

  const [{ data: statuses }, { data: existing }] = await Promise.all([
    supabase.from("statuses").select("name"),
    supabase.from("players").select("handle").eq("owner_id", targetUserId).limit(100000),
  ]);

  const validStatuses = new Set((statuses ?? []).map((s) => s.name as string));
  const alreadyThere = new Set(
    (existing ?? []).map((p) => (p.handle as string).trim().toLowerCase())
  );

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      user_id: me.id,
      target_user_id: targetUserId,
      filename: file.name,
      rows_total: rows.length,
    })
    .select("id")
    .single();

  if (batchError || !batch) return { error: batchError?.message ?? "Could not start the import." };

  const rejections: { row: number; reason: string; handle?: string }[] = [];
  const toInsert: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  rows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const get = (field: string) =>
      mapping[field] !== undefined ? (cells[mapping[field]] ?? "").trim() : "";

    const handle = get("handle");
    if (!handle) {
      rejections.push({ row: rowNumber, reason: "No player handle" });
      return;
    }

    const key = handle.toLowerCase();
    if (seen.has(key)) {
      rejections.push({ row: rowNumber, reason: "Duplicate within the file", handle });
      return;
    }
    if (alreadyThere.has(key)) {
      rejections.push({ row: rowNumber, reason: "Already in this book", handle });
      return;
    }
    seen.add(key);

    const status = get("status");
    const assigned = parseDate(get("assigned_at"));
    const lastContact = parseDate(get("last_contact_at"));

    if (assigned.error) rejections.push({ row: rowNumber, reason: assigned.error, handle });
    if (lastContact.error) {
      rejections.push({ row: rowNumber, reason: lastContact.error, handle });
    }

    toInsert.push({
      owner_id: targetUserId,
      handle,
      roobet_username: get("roobet_username") || null,
      source: get("source") || null,
      status: resolveStatus(status, validStatuses).status,
      notes: get("notes") || null,
      assigned_at: (assigned.date ?? new Date()).toISOString(),
      last_contact_at: lastContact.date ? lastContact.date.toISOString() : null,
      import_batch_id: batch.id,
    });
  });

  // Inserted in chunks. One 20,000-row statement is a single point of failure;
  // 500 at a time means a problem costs one chunk, not the whole file.
  let imported = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const { error, count } = await supabase
      .from("players")
      .insert(chunk, { count: "exact" });

    if (error) {
      rejections.push({
        row: i + 2,
        reason: `Rows ${i + 2}-${i + chunk.length + 1} failed: ${error.message}`,
      });
    } else {
      imported += count ?? chunk.length;
    }
  }

  await supabase
    .from("import_batches")
    .update({
      rows_imported: imported,
      rows_rejected: rows.length - imported,
      rejections: rejections.slice(0, 500),
    })
    .eq("id", batch.id);

  // Push the reference counter past anything the import created.
  await supabase.rpc("sync_reference_counter", { p_user: targetUserId });

  await audit(me.id, "import", targetUserId, {
    filename: file.name,
    imported,
    rejected: rows.length - imported,
  });

  refresh();

  const skipped = rows.length - imported;
  return {
    message: `${imported.toLocaleString()} imported into ${target.name}'s book.${
      skipped > 0 ? ` ${skipped.toLocaleString()} skipped — see the report below.` : ""
    }`,
  };
}

/**
 * Retire every currently unclaimed wagerer.
 *
 * Hundreds of usernames were wagering before the CRM existed and will never be
 * claimed. They stay in every company total; this just clears them out of the
 * working list so the few genuinely new names are visible.
 */
export async function retireUnclaimedWagerers(): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("retire_unclaimed_wagerers");

  if (error) {
    return {
      error: /does not exist|schema cache/i.test(error.message)
        ? "Run migration 20260812000014_corrections.sql first."
        : error.message,
    };
  }

  await audit(me.id, "retire_unclaimed_wagerers", null, { count: data });
  refresh();

  return {
    message:
      `${data ?? 0} pre-existing wagerers retired. They still count in company ` +
      `totals — only new names will appear in this list from now on.`,
  };
}

/**
 * Mark one wagerer as pre-existing, or put them back.
 *
 * Same idea as the bulk action, one row at a time - which is what makes it
 * usable from the main player list rather than needing a separate panel. It
 * hides rather than deletes: the money stays in every company total.
 */
export async function setWagererPreExisting(
  username: string,
  preExisting: boolean
): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const clean = username.trim();
  if (!clean) return { error: "No username given." };

  const supabase = createClient();
  const { error } = await supabase.rpc(
    preExisting ? "retire_one_wagerer" : "unretire_one_wagerer",
    { p_username: clean }
  );

  if (error) {
    return {
      error: /does not exist|schema cache/i.test(error.message)
        ? "Run migration 20260812000019_wager_report.sql first."
        : error.message,
    };
  }

  await audit(me.id, preExisting ? "wagerer_pre_existing" : "wagerer_restored", null, {
    username: clean,
  });
  refresh();

  return {
    message: preExisting
      ? `${clean} marked pre-existing.`
      : `${clean} back on the list.`,
  };
}

/* ------------------------------------------------------------ Wager sources */

/**
 * Add a leaderboard source.
 *
 * The key goes straight into the admin-only table and is never echoed back -
 * every read after this masks it to the last four characters.
 */
export async function addWagerSource(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const apiKey = String(formData.get("api_key") ?? "").trim();
  const authStyle = String(formData.get("auth_style") ?? "bearer");
  const headerName = String(formData.get("header_name") ?? "x-api-key").trim();

  if (!name) return { error: "Give the source a name — e.g. RoobetCasinoRewards." };
  if (!/^https:\/\//.test(url)) return { error: "The URL must start with https://." };
  if (!apiKey) return { error: "Paste the API key." };
  if (!["bearer", "header", "query"].includes(authStyle)) {
    return { error: "Pick how the key is sent." };
  }

  const supabase = createClient();
  const { error } = await supabase.from("wager_sources").insert({
    name,
    url,
    api_key: apiKey,
    auth_style: authStyle,
    header_name: headerName || "x-api-key",
  });

  if (error) {
    return error.message.includes("duplicate")
      ? { error: `A source called "${name}" already exists.` }
      : { error: error.message };
  }

  await audit(me.id, "add_wager_source", null, { name, url });
  refresh();
  return { message: `"${name}" added. Run a sync to test it.` };
}

export async function setWagerSourceActive(
  sourceId: string,
  active: boolean
): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("wager_sources")
    .update({ active })
    .eq("id", sourceId);

  if (error) return { error: error.message };
  await audit(me.id, active ? "enable_wager_source" : "disable_wager_source", null, {
    sourceId,
  });
  refresh();
  return { message: active ? "Source enabled." : "Source paused — it will be skipped." };
}

export async function deleteWagerSource(sourceId: string): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const supabase = createClient();
  const { error } = await supabase.from("wager_sources").delete().eq("id", sourceId);
  if (error) return { error: error.message };

  await audit(me.id, "delete_wager_source", null, { sourceId });
  refresh();
  return { message: "Source removed. Its past snapshots are kept." };
}

/** Undo an import completely, as long as nobody has worked those players yet. */
export async function undoImport(batchId: string): Promise<AdminState> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const supabase = createClient();

  const { count: worked } = await supabase
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("import_batch_id", batchId)
    .not("last_contact_at", "is", null);

  if ((worked ?? 0) > 0) {
    return {
      error: `${worked} of those players have already been contacted. Remove them individually rather than undoing the whole import.`,
    };
  }

  const { error } = await supabase.from("players").delete().eq("import_batch_id", batchId);
  if (error) return { error: error.message };

  await audit(me.id, "undo_import", null, { batchId });
  refresh();
  return { message: "Import removed." };
}
