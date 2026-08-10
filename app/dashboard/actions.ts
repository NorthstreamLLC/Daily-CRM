"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/queries";

export type ActionState = { error?: string; message?: string } | null;

/**
 * COMPLETE A TASK.
 *
 * Stamps the contact, logs it, and bumps the relevant counter. Recalculating
 * when they are next due happens on read, so there is no date to store and
 * nothing to go stale.
 *
 * Completing the same player twice in a day does nothing the second time -
 * one advance per day, which stops a double-tap counting twice.
 */
export async function completeTask(playerId: string): Promise<ActionState> {
  const supabase = createClient();
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const { data: player } = await supabase
    .from("players")
    .select("id, status, roobet_username, followup_attempts, vip_fasttrack_checkins, last_contact_at")
    .eq("id", playerId)
    .single();

  if (!player) return { error: "Player not found." };

  // Already contacted today? Do nothing rather than counting it twice.
  const { startOfDayUtc } = await import("@/lib/time");
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

  // On the VIP fast-track, advance the check-in counter.
  if (player.status === "VIP Transferred") {
    patch.vip_fasttrack_checkins = (player.vip_fasttrack_checkins ?? 0) + 1;
  }

  const { error: updateError } = await supabase
    .from("players")
    .update(patch)
    .eq("id", playerId);

  if (updateError) return { error: updateError.message };

  await supabase.from("activity_log").insert({
    player_id: playerId,
    user_id: me.id,
    event_type: "task_completed",
    metadata: { status: player.status },
  });

  revalidatePath("/dashboard");
  return { message: "Logged." };
}

/**
 * CHANGE A STATUS.
 *
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

  // Anchor the VIP fast-track the first time they enter it.
  if (newStatus === "VIP Transferred" && !player.vip_fasttrack_started_at) {
    patch.vip_fasttrack_started_at = new Date().toISOString();
    patch.vip_fasttrack_checkins = 0;
  }

  // Record when they first deposited, and never overwrite it afterwards.
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

  revalidatePath("/dashboard");
  return { message: "Status updated." };
}

/** Notes save as the rep types, so nothing is lost by navigating away. */
export async function saveNotes(playerId: string, notes: string): Promise<ActionState> {
  const supabase = createClient();
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const { error } = await supabase
    .from("players")
    .update({ notes })
    .eq("id", playerId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { message: "Saved." };
}

/** Filling in the Roobet username resets the attempt counter. */
export async function saveRoobetUsername(
  playerId: string,
  username: string
): Promise<ActionState> {
  const supabase = createClient();
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const trimmed = username.trim();
  const { error } = await supabase
    .from("players")
    .update({
      roobet_username: trimmed || null,
      ...(trimmed ? { followup_attempts: 0 } : {}),
    })
    .eq("id", playerId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { message: "Saved." };
}

/**
 * ADD A PLAYER.
 *
 * The reference (MH-0088) is generated by the database, not here - a trigger
 * takes and increments a per-person counter under a row lock, so two players
 * created at the same instant cannot collide on a number.
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

  if (!handle) return { error: "Enter a player handle." };

  // Warn on a handle this rep already has, rather than silently creating a
  // duplicate that both then get worked.
  const { data: existing } = await supabase
    .from("players")
    .select("reference")
    .eq("owner_id", me.id)
    .ilike("handle", handle)
    .maybeSingle();

  if (existing) {
    return { error: `You already have ${handle} as ${existing.reference}.` };
  }

  const { data: created, error } = await supabase
    .from("players")
    .insert({
      owner_id: me.id,
      handle,
      source: source || null,
      roobet_username: roobet || null,
      status: "Initial Contact",
      assigned_at: new Date().toISOString(),
      last_contact_at: new Date().toISOString(),
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

  revalidatePath("/dashboard");
  return { message: `Added ${created.reference} — ${handle}.` };
}
