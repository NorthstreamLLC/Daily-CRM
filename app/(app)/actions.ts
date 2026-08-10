"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/queries";
import { startOfDayUtc } from "@/lib/time";

export type ActionState = { error?: string; message?: string; warning?: string } | null;

/** Both list pages read the same rows, so both need refreshing after a write. */
function refresh() {
  revalidatePath("/today");
  revalidatePath("/book");
  revalidatePath("/stats");
}

/* ------------------------------------------------------------ Complete task */

/**
 * COMPLETE A TASK.
 *
 * Stamps the contact, logs it, and bumps the relevant counter. When they are
 * next due is worked out on read, so there is no date to store and nothing to
 * go stale.
 *
 * Completing the same player twice in a day does nothing the second time - one
 * advance per day, which stops a double-tap counting twice.
 */
export async function completeTask(playerId: string): Promise<ActionState> {
  const supabase = createClient();
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const { data: player } = await supabase
    .from("players")
    .select(
      "id, status, roobet_username, followup_attempts, vip_fasttrack_checkins, last_contact_at"
    )
    .eq("id", playerId)
    .single();

  if (!player) return { error: "Player not found." };

  const dayStart = startOfDayUtc(me.timezone);
  if (player.last_contact_at && new Date(player.last_contact_at) >= dayStart) {
    return { message: "Already logged today." };
  }

  const patch: Record<string, unknown> = { last_contact_at: new Date().toISOString() };

  // No Roobet username yet - count the attempt. This is what eventually
  // surfaces the "ready for dead lead" prompt.
  if (!player.roobet_username?.trim()) {
    patch.followup_attempts = (player.followup_attempts ?? 0) + 1;
  }

  if (player.status === "VIP Transferred") {
    patch.vip_fasttrack_checkins = (player.vip_fasttrack_checkins ?? 0) + 1;
  }

  const { error } = await supabase.from("players").update(patch).eq("id", playerId);
  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    player_id: playerId,
    user_id: me.id,
    event_type: "task_completed",
    metadata: { status: player.status },
  });

  refresh();
  return { message: "Logged." };
}

/**
 * Undo a completion made today.
 *
 * Ticking the wrong row was irreversible in the spreadsheet. Here it clears
 * today's stamp, rolls back the counters and records the reversal - the log
 * keeps both the completion and the undo, so the history stays truthful.
 */
export async function undoCompleteTask(playerId: string): Promise<ActionState> {
  const supabase = createClient();
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const { data: player } = await supabase
    .from("players")
    .select("id, status, roobet_username, followup_attempts, vip_fasttrack_checkins, last_contact_at")
    .eq("id", playerId)
    .single();

  if (!player) return { error: "Player not found." };

  const dayStart = startOfDayUtc(me.timezone);
  if (!player.last_contact_at || new Date(player.last_contact_at) < dayStart) {
    return { error: "Nothing logged today to undo." };
  }

  // Fall back to the previous completion, if there was one.
  const { data: prior } = await supabase
    .from("activity_log")
    .select("occurred_at")
    .eq("player_id", playerId)
    .eq("event_type", "task_completed")
    .lt("occurred_at", dayStart.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    last_contact_at: prior?.occurred_at ?? null,
    followup_attempts: Math.max(0, (player.followup_attempts ?? 0) - (player.roobet_username?.trim() ? 0 : 1)),
  };
  if (player.status === "VIP Transferred") {
    patch.vip_fasttrack_checkins = Math.max(0, (player.vip_fasttrack_checkins ?? 0) - 1);
  }

  const { error } = await supabase.from("players").update(patch).eq("id", playerId);
  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    player_id: playerId,
    user_id: me.id,
    event_type: "note_added",
    metadata: { undo: "task_completed" },
  });

  refresh();
  return { message: "Undone." };
}

/* ------------------------------------------------------------ Status change */

/**
 * Writes the change to activity_log with both the old and new value. Every
 * reported number counts from that log, which is how a corrected mistake
 * removes itself from the totals instead of counting forever.
 */
export async function changeStatus(
  playerId: string,
  newStatus: string
): Promise<ActionState> {
  const supabase = createClient();
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const { data: player } = await supabase
    .from("players")
    .select("id, status, first_deposit_at, vip_fasttrack_started_at")
    .eq("id", playerId)
    .single();

  if (!player) return { error: "Player not found." };
  if (player.status === newStatus) return { message: "No change." };

  const patch: Record<string, unknown> = { status: newStatus };

  if (newStatus === "VIP Transferred" && !player.vip_fasttrack_started_at) {
    patch.vip_fasttrack_started_at = new Date().toISOString();
    patch.vip_fasttrack_checkins = 0;
  }

  if (
    (newStatus === "First Deposit" || newStatus === "Active") &&
    !player.first_deposit_at
  ) {
    patch.first_deposit_at = new Date().toISOString();
  }

  const { error } = await supabase.from("players").update(patch).eq("id", playerId);
  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    player_id: playerId,
    user_id: me.id,
    event_type: "status_change",
    from_status: player.status,
    to_status: newStatus,
  });

  refresh();
  return { message: "Status updated." };
}

/* --------------------------------------------------------------- Field edits */

const EDITABLE = [
  "handle",
  "source",
  "roobet_username",
  "notes",
  "kyc_status",
  "deposit_status",
] as const;

export type EditableField = (typeof EDITABLE)[number];

/**
 * Save a single field on a player.
 *
 * One action rather than one per column, so the Book table can make every cell
 * editable without needing a new server action each time a column is added.
 * The allow-list is what keeps that safe - a field name arriving from the
 * browser can only ever be one of these six.
 */
export async function updatePlayerField(
  playerId: string,
  field: EditableField,
  value: string
): Promise<ActionState> {
  const supabase = createClient();
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  if (!EDITABLE.includes(field)) return { error: "That field cannot be edited." };

  const trimmed = value.trim();

  if (field === "handle" && !trimmed) {
    return { error: "A player needs a handle." };
  }

  const patch: Record<string, unknown> = { [field]: trimmed || null };

  // Filling in the Roobet username clears the chase - they stop resurfacing
  // daily and the attempt count goes back to zero.
  if (field === "roobet_username" && trimmed) {
    patch.followup_attempts = 0;
  }

  const { error } = await supabase.from("players").update(patch).eq("id", playerId);
  if (error) return { error: error.message };

  if (field === "notes") {
    await supabase.from("activity_log").insert({
      player_id: playerId,
      user_id: me.id,
      event_type: "note_added",
      metadata: { length: trimmed.length },
    });
  }

  refresh();
  return { message: "Saved." };
}

/** Kept as its own action because the queue calls it directly. */
export async function saveRoobetUsername(playerId: string, username: string) {
  return updatePlayerField(playerId, "roobet_username", username);
}

export async function saveNotes(playerId: string, notes: string) {
  return updatePlayerField(playerId, "notes", notes);
}

/* ---------------------------------------------------------------- Bulk edit */

/**
 * Change the status of several players at once.
 *
 * Every row still gets its own log entry, so a bulk change is as traceable as
 * fifty individual ones and the stats stay correct.
 */
export async function bulkChangeStatus(
  playerIds: string[],
  newStatus: string
): Promise<ActionState> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };
  if (playerIds.length === 0) return { error: "Nothing selected." };
  if (playerIds.length > 500) return { error: "Select 500 or fewer at a time." };

  const supabase = createClient();

  const { data: players } = await supabase
    .from("players")
    .select("id, status, first_deposit_at, vip_fasttrack_started_at")
    .in("id", playerIds);

  const changing = (players ?? []).filter((p) => p.status !== newStatus);
  if (changing.length === 0) return { message: "Already set." };

  const now = new Date().toISOString();
  const setsVip = newStatus === "VIP Transferred";
  const setsFtd = newStatus === "First Deposit" || newStatus === "Active";

  // Rows needing a milestone stamp are updated separately from those that do
  // not, so an existing first-deposit date is never overwritten.
  const plain = changing.filter(
    (p) => !(setsVip && !p.vip_fasttrack_started_at) && !(setsFtd && !p.first_deposit_at)
  );
  const stamped = changing.filter((p) => !plain.includes(p));

  if (plain.length) {
    await supabase
      .from("players")
      .update({ status: newStatus })
      .in("id", plain.map((p) => p.id));
  }

  for (const p of stamped) {
    const patch: Record<string, unknown> = { status: newStatus };
    if (setsVip && !p.vip_fasttrack_started_at) {
      patch.vip_fasttrack_started_at = now;
      patch.vip_fasttrack_checkins = 0;
    }
    if (setsFtd && !p.first_deposit_at) patch.first_deposit_at = now;
    await supabase.from("players").update(patch).eq("id", p.id);
  }

  await supabase.from("activity_log").insert(
    changing.map((p) => ({
      player_id: p.id,
      user_id: me.id,
      event_type: "status_change",
      from_status: p.status,
      to_status: newStatus,
    }))
  );

  refresh();
  return { message: `${changing.length} moved to ${newStatus}.` };
}

/* -------------------------------------------------------------- Add a player */

type HandleMatch = { reference: string; owner_name: string; status: string; is_mine: boolean };

/**
 * Is this handle already in somebody's book?
 *
 * Row Level Security stops a rep reading another rep's players, so this asks
 * the database a single narrow question through a security-definer function.
 * It returns the owner's name and the status and nothing else.
 *
 * If that function is not installed yet - the migration adding it may not have
 * been run - this falls back to checking the caller's own book. Losing the
 * team-wide warning is acceptable; silently losing the duplicate check
 * altogether is not.
 */
export async function checkHandle(handle: string): Promise<HandleMatch[]> {
  const trimmed = handle.trim();
  if (trimmed.length < 2) return [];

  const supabase = createClient();
  const { data, error } = await supabase.rpc("find_handle_owner", {
    p_handle: trimmed,
  });

  if (!error) return (data ?? []) as HandleMatch[];

  const me = await getMe();
  if (!me) return [];

  const { data: mine } = await supabase
    .from("players")
    .select("reference, status")
    .eq("owner_id", me.id)
    .ilike("handle", trimmed)
    .limit(1);

  return (mine ?? []).map((p) => ({
    reference: p.reference as string,
    owner_name: me.name,
    status: p.status as string,
    is_mine: true,
  }));
}

/**
 * ADD A PLAYER.
 *
 * The reference (MH-0088) is generated by the database, not here - a trigger
 * takes and increments a per-person counter under a row lock, so two players
 * created at the same instant cannot collide on a number.
 *
 * last_contact_at is deliberately left null. Adding someone to your book is not
 * the same as having spoken to them, so they land straight in today's queue and
 * only leave once you tick them off.
 */
export async function addPlayer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const handle = String(formData.get("handle") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim() || me.default_source;
  const roobet = String(formData.get("roobet_username") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const force = String(formData.get("force") ?? "") === "1";

  if (!handle) return { error: "Enter a player handle." };

  const matches = await checkHandle(handle);
  const mine = matches.find((m) => m.is_mine);
  if (mine) {
    return { error: `You already have ${handle} as ${mine.reference} (${mine.status}).` };
  }

  const theirs = matches.find((m) => !m.is_mine);
  if (theirs && !force) {
    return {
      warning:
        `${handle} is already in ${theirs.owner_name}'s book as ${theirs.status}. ` +
        `Add anyway only if you're sure it's a different person.`,
    };
  }

  const { data: created, error } = await supabase
    .from("players")
    .insert({
      owner_id: me.id,
      handle,
      source: source || null,
      roobet_username: roobet || null,
      notes: notes || null,
      status: "Initial Contact",
      assigned_at: new Date().toISOString(),
    })
    .select("id, reference")
    .single();

  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    player_id: created.id,
    user_id: me.id,
    event_type: "player_created",
    to_status: "Initial Contact",
  });

  refresh();
  return { message: `Added ${created.reference} — ${handle}.` };
}
