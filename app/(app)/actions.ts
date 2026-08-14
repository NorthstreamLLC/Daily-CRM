"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/queries";
import { startOfDayUtc } from "@/lib/time";

export type ActionState = { error?: string; message?: string; warning?: string } | null;

/**
 * Every page that reads a player needs refreshing after a write.
 *
 * Missing one is how a status change shows on Today but not on the Calendar,
 * and the two then disagree about the same player - the exact class of bug the
 * spreadsheet was full of.
 */
/*  HALF THE JOB, AND THE HALF THAT IS EASY TO FORGET.
 *
 *  revalidatePath marks the server cache stale. It does NOT re-render a page
 *  that is already on screen. Any CLIENT component calling one of these
 *  actions must also call router.refresh(), or the write lands in the database
 *  and the user watches nothing happen.
 *
 *  This has been found three separate times - the status dropdown, the
 *  settings rows, and Add player, where a new lead appeared in the queue while
 *  the Active Leads counter above it still read zero. If you add an action and
 *  call refresh() here, check the caller. */
function refresh() {
  revalidatePath("/today");
  revalidatePath("/book");
  revalidatePath("/stats");
  revalidatePath("/calendar");
  revalidatePath("/admin", "layout");
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
      "id, status, roobet_username, followup_attempts, vip_fasttrack_checkins, last_contact_at, owner_id"
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

  /* Credit the player's OWNER, not whoever clicked. An admin working through
     a rep's day is helping, not earning - logging it against the admin would
     take the touch off the rep's stats and put it on someone whose targets do
     not include it. Who actually clicked is kept in the metadata, so the
     record is still honest. */
  await supabase.from("activity_log").insert({
    player_id: playerId,
    user_id: player.owner_id,
    event_type: "task_completed",
    metadata: {
      status: player.status,
      ...(player.owner_id !== me.id ? { logged_by: me.id } : {}),
    },
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
    .select(
      "id, status, roobet_username, followup_attempts, vip_fasttrack_checkins, last_contact_at, owner_id"
    )
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
    user_id: player.owner_id ?? me.id,
    event_type: "note_added",
    metadata: {
      undo: "task_completed",
      ...(player.owner_id && player.owner_id !== me.id ? { logged_by: me.id } : {}),
    },
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

  /* SAVING A USERNAME CHECKS THE LEDGER IMMEDIATELY.
     Waiting for the next sync meant a player with real wager sat showing $0
     and looked broken. This attaches whatever history already exists and says
     what it found, so a typo is obvious within a second rather than an hour. */
  if (field === "roobet_username" && trimmed) {
    const { data, error: attachError } = await supabase.rpc("attach_wager_history", {
      p_player: playerId,
    });

    const result = Array.isArray(data) ? data[0] : data;

    refresh();

    if (attachError) {
      return {
        message: "Saved.",
        warning:
          "Couldn't check wager for that username - run migration " +
          "20260812000013_attach_wager.sql, then re-save.",
      };
    }

    if (result?.matched) {
      const total = Number(result.total ?? 0);
      return {
        message:
          `Saved. Matched on your codes — $${total.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })} wagered, history attached.`,
      };
    }

    return {
      message: "Saved.",
      warning:
        `No wager found for "${trimmed}" on any of your codes yet. Either they ` +
        `haven't played, or the spelling doesn't match Roobet exactly.`,
    };
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

/* --------------------------------------------------- Corrections & wager */

/**
 * REVERSE A MISTAKEN DEPOSIT.
 *
 * The first-deposit stamp is permanent on purpose - a real depositor who later
 * goes dead still deposited. But a status set by mistake needs undoing, and
 * activity_log is append-only, so the correction is a new event rather than a
 * deletion. Reported numbers subtract reversals; the history keeps both the
 * original claim and the correction.
 */
export async function reverseFirstDeposit(playerId: string): Promise<ActionState> {
  const supabase = createClient();
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const { data: player } = await supabase
    .from("players")
    .select("id, handle, first_deposit_at, status")
    .eq("id", playerId)
    .single();

  if (!player) return { error: "Player not found." };
  if (!player.first_deposit_at) return { message: "They aren't marked as deposited." };

  const { error } = await supabase
    .from("players")
    .update({ first_deposit_at: null })
    .eq("id", playerId);

  if (error) return { error: error.message };

  const { error: logError } = await supabase.from("activity_log").insert({
    player_id: playerId,
    user_id: me.id,
    event_type: "deposit_reversed",
    from_status: player.status,
    metadata: { was: player.first_deposit_at },
  });

  if (logError) {
    return {
      error:
        "Cleared the date, but couldn't record the correction - run migration " +
        "20260812000014_corrections.sql so the deposit count updates too.",
    };
  }

  refresh();
  return { message: `${player.handle} is no longer counted as a deposit.` };
}

/**
 * Re-check a player against the wager ledger.
 *
 * Useful after a backfill: the ledger gains months of history, and this pulls
 * the new readings onto the player so their windowed figures fill in.
 */
export async function refreshPlayerWager(playerId: string): Promise<ActionState> {
  const supabase = createClient();
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const { data, error } = await supabase.rpc("attach_wager_history", {
    p_player: playerId,
  });

  if (error) return { error: error.message };

  const result = Array.isArray(data) ? data[0] : data;
  refresh();

  if (!result?.matched) {
    return {
      warning:
        "No wager found for that Roobet username on any code. Check the spelling against Roobet.",
    };
  }

  const total = Number(result.total ?? 0);
  const added = Number(result.rows_added ?? 0);

  return {
    message:
      `$${total.toLocaleString(undefined, { maximumFractionDigits: 0 })} wagered` +
      (added > 0 ? ` — ${added} new reading${added === 1 ? "" : "s"} attached.` : " — already up to date."),
  };
}

/* ------------------------------------------------------------- Bulk assign */

/**
 * Move selected players to another rep - admin only.
 *
 * References stay as they are: MH-0088 keeps its number under a new owner, so
 * anything written down elsewhere still finds the right person. The receiving
 * rep picks them up in their queue on the players' normal cadence.
 */
export async function bulkAssignOwner(
  playerIds: string[],
  toUserId: string
): Promise<ActionState> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };
  if (me.role !== "admin") return { error: "Only admins can reassign players." };
  if (playerIds.length === 0) return { error: "Nothing selected." };
  if (playerIds.length > 500) return { error: "Select 500 or fewer at a time." };

  const supabase = createClient();

  const { data: target } = await supabase
    .from("users")
    .select("id, name, active")
    .eq("id", toUserId)
    .maybeSingle();

  if (!target) return { error: "That person no longer exists." };
  if (!target.active) return { error: `${target.name} is deactivated - reactivate them first.` };

  const { error, count } = await supabase
    .from("players")
    .update({ owner_id: toUserId }, { count: "exact" })
    .in("id", playerIds);

  if (error) return { error: error.message };

  await supabase.from("admin_audit").insert({
    actor_id: me.id,
    action: "bulk_assign_players",
    target_user: toUserId,
    detail: { count: count ?? playerIds.length },
  });

  refresh();
  return { message: `${count ?? playerIds.length} players moved to ${target.name}.` };
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
 * Adding someone counts as the first contact, so last_contact_at is stamped
 * now. You found them and reached out - being asked to then tick "I contacted
 * them" on the same person the same day is the app not believing you. They
 * appear under Added today for the rest of the day, and become a real task
 * tomorrow on their stage's normal cadence.
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
  const contacted = String(formData.get("contacted") ?? "") === "1";
  const requestedStatus = String(formData.get("status") ?? "").trim();

  if (!handle) return { error: "Enter a player handle." };

  // The status has to be a real stage - it is a foreign key, and an invalid
  // one would fail with a database error rather than something readable.
  const { data: stage } = await supabase
    .from("statuses")
    .select("name")
    .eq("name", requestedStatus || "Initial Contact")
    .maybeSingle();

  const status = stage?.name ?? "Initial Contact";

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

  const now = new Date().toISOString();

  const { data: created, error } = await supabase
    .from("players")
    .insert({
      owner_id: me.id,
      handle,
      source: source || null,
      roobet_username: roobet || null,
      notes: notes || null,
      status,
      assigned_at: now,
      // Stamped only if you actually spoke to them. Left empty, they are a real
      // task and appear in the queue tomorrow morning with a tick.
      last_contact_at: contacted ? now : null,
      vip_fasttrack_started_at: status === "VIP Transferred" ? now : null,
      first_deposit_at:
        status === "First Deposit" || status === "Active" ? now : null,
    })
    .select("id, reference")
    .single();

  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    player_id: created.id,
    user_id: me.id,
    event_type: "player_created",
    to_status: status,
  });

  refresh();

  const note = contacted
    ? "Contact logged — they're due again on their normal cadence."
    : "Not contacted yet, so they're in today's queue.";

  return { message: `Added ${created.reference} — ${handle}. ${note}` };
}


/* --------------------------------------------------------- VIP watch list */

/**
 * Pin a player to the fallen-away list, or take them off it.
 *
 * Detection catches the obvious slides. It cannot know a whale said something
 * worrying on a call, which is why a person can put someone on the list
 * directly - and why a pinned player stays until someone takes them off,
 * rather than being silently re-evaluated each night.
 *
 * Row Level Security decides who may pin whom: a rep their own players, an
 * admin anyone's.
 */
export async function setVipWatch(
  playerId: string,
  watching: boolean,
  note?: string
): Promise<{ error?: string; message?: string }> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const supabase = createClient();

  if (!watching) {
    /* Resolved rather than deleted - "we watched them and they came back" is
       worth keeping. */
    const { error } = await supabase
      .from("vip_watch")
      .update({ resolved_at: new Date().toISOString() })
      .eq("player_id", playerId)
      .is("resolved_at", null);

    if (error) return { error: watchError(error.message) };
    refresh();
    return { message: "Off the watch list." };
  }

  const { error } = await supabase.from("vip_watch").upsert(
    {
      player_id: playerId,
      added_by: me.id,
      added_at: new Date().toISOString(),
      note: note?.trim() || null,
      resolved_at: null,
    },
    { onConflict: "player_id" }
  );

  if (error) return { error: watchError(error.message) };
  refresh();
  return { message: "Added to the watch list." };
}

function watchError(message: string) {
  return /does not exist|schema cache/i.test(message)
    ? "Run migration 20260812000020_vip_watch.sql first."
    : message;
}


/* ------------------------------------------------------------- Message log */

export type MessageState = { error?: string; message?: string };

const CHANNELS = ["discord", "telegram", "twitter", "email", "sms", "call", "other"];

/**
 * Log what was said to a player.
 *
 * An outbound message counts as contact - the database trigger moves
 * last_contact_at forward - so a rep logs the conversation once instead of
 * logging it and then separately ticking the task. That double entry is
 * exactly what the spreadsheet forced.
 *
 * Row Level Security decides who may log against whom.
 */
export async function logMessage(
  playerId: string,
  body: string,
  channel = "other",
  direction: "out" | "in" = "out",
  occurredAt?: string
): Promise<MessageState> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const text = body.trim();
  if (!text) return { error: "Nothing to log." };
  if (text.length > 5000) return { error: "That is too long to store as one message." };

  const supabase = createClient();

  const when = occurredAt ? new Date(occurredAt) : new Date();
  if (Number.isNaN(when.getTime())) return { error: "That date is not valid." };
  // A message cannot have been sent in the future.
  const stamp = (when > new Date() ? new Date() : when).toISOString();

  const { error } = await supabase.from("player_messages").insert({
    player_id: playerId,
    user_id: me.id,
    direction,
    channel: CHANNELS.includes(channel) ? channel : "other",
    body: text,
    occurred_at: stamp,
  });

  if (error) {
    return {
      error: /does not exist|schema cache/i.test(error.message)
        ? "Run migration 20260812000021_messages.sql first."
        : error.message,
    };
  }

  /* The timeline is the record of what happened; the message log is what was
     said. Both want this event, and writing it here rather than in a trigger
     keeps activity_log's meaning - things a person did - intact.
  
     Counted once per player per day, not once per message. Three messages in
     an afternoon is one player worked, and every stat on the Stats page reads
     task_completed as "touches" - so writing one per message would quietly
     inflate the number the team is measured on. */
  if (direction === "out") {
    const dayStart = startOfDayUtc(me.timezone).toISOString();

    const { data: already } = await supabase
      .from("activity_log")
      .select("id")
      .eq("player_id", playerId)
      .eq("user_id", me.id)
      .eq("event_type", "task_completed")
      .gte("occurred_at", dayStart)
      .limit(1)
      .maybeSingle();

    await supabase.from("activity_log").insert({
      player_id: playerId,
      user_id: me.id,
      event_type: already ? "outreach" : "task_completed",
      metadata: { via: "message_log", channel },
    });
  }

  refresh();
  return { message: direction === "out" ? "Logged, and marked as contacted." : "Reply logged." };
}

/** Correct a message. Keeps the original time and marks it edited. */
export async function editMessage(id: string, body: string): Promise<MessageState> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const text = body.trim();
  if (!text) return { error: "A message cannot be emptied - delete it instead." };

  const supabase = createClient();
  const { error } = await supabase
    .from("player_messages")
    .update({ body: text, edited_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };
  refresh();
  return { message: "Message updated." };
}

/** Remove a message logged by mistake. */
export async function deleteMessage(id: string): Promise<MessageState> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const supabase = createClient();
  const { error } = await supabase.from("player_messages").delete().eq("id", id);

  if (error) return { error: error.message };
  refresh();
  return { message: "Message removed." };
}

/** The team's snippets, plus this rep's own. */
export async function getTemplates(): Promise<{ id: string; name: string; body: string }[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("message_templates")
    .select("id, name, body")
    .eq("active", true)
    .order("sort_order")
    .order("name");

  if (error) return [];
  return (data ?? []) as { id: string; name: string; body: string }[];
}
