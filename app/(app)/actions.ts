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
    .select("id, status, first_deposit_at, vip_fasttrack_started_at, vip_transferred_at")
    .eq("id", playerId)
    .single();

  if (!player) return { error: "Player not found." };
  if (player.status === newStatus) return { message: "No change." };

  const patch: Record<string, unknown> = { status: newStatus };

  if (newStatus === "VIP Transferred") {
    if (!player.vip_fasttrack_started_at) {
      patch.vip_fasttrack_started_at = new Date().toISOString();
      patch.vip_fasttrack_checkins = 0;
    }

    /* Tick the box too.

       There are two ways to say "VIP transfer" - this dropdown and the tick
       box on the player - and until now only the tick box set the flag. So a
       rep who moved the status saw the event counted on Stats while the
       checkbox beside it stayed empty, and the player page disagreed with the
       stats page about the same fact.

       coalesce, not overwrite: if they were already ticked with a corrected
       date, moving the status must not quietly stamp it to today. */
    if (!player.vip_transferred_at) {
      patch.vip_transferred_at = new Date().toISOString();
    }
  }

  if (
    (newStatus === "First Deposit" || newStatus === "Active") &&
    !player.first_deposit_at
  ) {
    patch.first_deposit_at = new Date().toISOString();
  }

  const { error } = await supabase.from("players").update(patch).eq("id", playerId);
  if (error) return { error: error.message };

  /* A milestone happens once per player, and the database now enforces that
     (migration 053). Moving a status back and forth used to write a second
     event each time - Chella was counted for 24 VIP transfers across 13
     players before anyone noticed, on the figure commission is paid from.

     So a rejected duplicate is the constraint doing its job, not a failure.
     The status change itself has already been saved; only the second copy of
     the event is refused. */
  const { error: logError } = await supabase.from("activity_log").insert({
    player_id: playerId,
    user_id: me.id,
    event_type: "status_change",
    from_status: player.status,
    to_status: newStatus,
  });

  if (logError && !/duplicate key|unique constraint/i.test(logError.message)) {
    return { error: logError.message };
  }

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
    .select("id, status, first_deposit_at, vip_fasttrack_started_at, vip_transferred_at")
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

/* ------------------------------------------------------------ Delete players */

/**
 * REMOVE PLAYERS FOR GOOD.
 *
 * This exists for scammers, duplicates and typos - not for tidying. It is
 * permanent: the schema cascades their messages and their wager readings, and
 * detaches their activity log. There is no undo.
 *
 * WHO CAN DELETE WHAT
 *   Admins   - anything.
 *   A rep    - their own players, while no wager and no first deposit is
 *              recorded against them.
 *
 *   The line is money, not ownership. A rep who could delete any of their
 *   players could delete one who had wagered, by mis-click or otherwise, and
 *   commission is paid off exactly that figure. A scammer, a duplicate and a
 *   typo have all wagered nothing, so the rule costs a rep nothing they
 *   actually wanted to do.
 *
 *   The same rule is enforced by the players_delete policy in migration 026,
 *   which is what holds if somebody calls this action directly. The check
 *   below exists to say WHICH rows were refused and why - a policy can only
 *   decline to delete them, silently.
 *
 * WHY THE HANDLES GO INTO THE AUDIT ROW
 *   After the delete there is nothing left to name. Recording what was removed
 *   at the moment of removal is the only chance to answer "where did they go?"
 *   later, and that question does get asked.
 */
export async function deletePlayers(playerIds: string[]): Promise<ActionState> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };
  if (playerIds.length === 0) return { error: "Nothing selected." };
  if (playerIds.length > 200) {
    return { error: "Delete 200 or fewer at a time - this cannot be undone." };
  }

  const supabase = createClient();

  /* Read them BEFORE deleting. Doing it after would name nothing, and doing it
     as part of the delete would not survive a partial failure. */
  const { data: doomed } = await supabase
    .from("players")
    /* One string literal, deliberately. Supabase infers the row type by
       parsing this at compile time, so splitting it across a `+` turns every
       field into GenericStringError and the whole thing stops type-checking. */
    .select("id, handle, reference, roobet_username, owner_id, status, weighted_wager, first_deposit_at")
    .in("id", playerIds);

  if (!doomed || doomed.length === 0) {
    return { error: "Those players no longer exist." };
  }

  /* A rep's limits, explained rather than silently applied.

     Without this the policy would simply delete fewer rows than were selected
     and report a cheerful count, which is the worst possible outcome: it looks
     like it worked. */
  if (me.role !== "admin") {
    const notMine = doomed.filter((p) => p.owner_id !== me.id);
    if (notMine.length > 0) {
      return {
        error:
          notMine.length === 1
            ? `${notMine[0].handle} is not in your book, so you can't delete them.`
            : `${notMine.length} of those are not in your book, so you can't delete them.`,
      };
    }

    const earned = doomed.filter(
      (p) => Number(p.weighted_wager ?? 0) > 0 || p.first_deposit_at !== null
    );
    if (earned.length > 0) {
      const names = earned.slice(0, 3).map((p) => p.handle).join(", ");
      return {
        error:
          `${
            earned.length === 1 ? `${names} has` : `${earned.length} of those have`
          } wagered or deposited, so an admin has to remove ${
            earned.length === 1 ? "them" : "those"
          } - commission is worked out from that figure.` +
          (earned.length > 3 ? ` (${names}, and ${earned.length - 3} more.)` : ""),
      };
    }
  }

  const { error, count } = await supabase
    .from("players")
    .delete({ count: "exact" })
    .in("id", playerIds);

  if (error) return { error: error.message };

  /* The record of what just happened. Migration 026 widened the audit insert
     policy so a rep can write this - before that it was admin-only, which
     would have left rep deletions as the only unrecorded ones. */
  const { error: auditError } = await supabase.from("admin_audit").insert({
    actor_id: me.id,
    action: "delete_players",
    detail: {
      count: count ?? doomed.length,
      players: doomed.map((p) => ({
        reference: p.reference,
        handle: p.handle,
        roobet_username: p.roobet_username,
        status: p.status,
        owner_id: p.owner_id,
      })),
    },
  });

  /* Stats, Today and the Calendar all counted these people a moment ago.
     The caller must ALSO call router.refresh() - see the note on refresh(). */
  refresh();

  const n = count ?? doomed.length;
  const what =
    n === 1 ? `Deleted ${doomed[0].handle}.` : `Deleted ${n} players.`;

  /* Say so if the audit row did not land. The players are gone either way -
     pretending the record was written would be worse than admitting it was
     not, because the whole point of it is being able to trust it later. */
  if (auditError) {
    return {
      warning: `${what} It could not be written to the audit log (${auditError.message}).`,
    };
  }

  return { message: `${what} That cannot be undone.` };
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
      /* Adding somebody straight in at VIP Transferred IS a transfer. Without
         this the box beside them stays empty and their stat reads zero. */
      vip_transferred_at: status === "VIP Transferred" ? now : null,
      first_deposit_at:
        status === "First Deposit" || status === "Active" ? now : null,
    })
    .select("id, reference")
    .single();

  if (error) return { error: error.message };

  /* player_created, AND the milestone if they were added already at one.
     
     A rep who adds someone straight in at VIP Transferred or First Deposit has
     done that thing - but the stats count milestones from status_change rows,
     and creating a player only ever wrote player_created. So the work happened,
     the funnel showed it, and the rep's VIP and deposit figures stayed at zero
     with nothing explaining why.
     
     Same shape as the import writing players and no history: a second way in
     that skipped the record everything is counted from. */
  const events: Record<string, unknown>[] = [
    {
      player_id: created.id,
      user_id: me.id,
      event_type: "player_created",
      to_status: status,
    },
  ];

  if (status === "VIP Transferred" || status === "First Deposit" || status === "Active") {
    events.push({
      player_id: created.id,
      user_id: me.id,
      event_type: "status_change",
      to_status: status,
      metadata: { at_creation: true },
    });
  }

  await supabase.from("activity_log").insert(events);

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
/**
 * WATCH A PLAYER, by their Roobet username.
 *
 * vip_watch is keyed on username rather than player id (migration 036), so the
 * same list covers somebody in a rep's book and somebody wagering on the codes
 * that nobody has ever claimed - which is 860 of the 880.
 *
 * Keeping the playerId signature: every caller already has a player, and the
 * username is looked up from it. Callers who only have a username use
 * setWagererWatch below.
 */
/**
 * Mark a player as handed to the VIP team - or take the mark back.
 *
 * This exists because the alternative was inferring it, and inference on this
 * number is not harmless: it feeds commission. Status could not tell a player
 * a rep transferred from one the wager sync promoted to Active because they
 * started betting on their own, and every rule I tried produced figures Isac
 * could see were wrong from across the room.
 *
 * So a rep says so. Slower, and the only version that is true.
 *
 * The database function moves the column and the activity_log row together -
 * if the app did those as two writes, a failure between them would leave a
 * ticked box that no report counted, or a counted transfer with no tick.
 */
export async function setVipTransferred(
  playerId: string,
  on: boolean,
  when?: string | null
): Promise<{ error?: string; message?: string }> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const supabase = createClient();
  const { error } = await supabase.rpc("set_vip_transferred", {
    p_player: playerId,
    p_on: on,
    p_when: when ? dayToTimestamp(when) : null,
  });

  if (error) return { error: error.message };

  refresh();
  return { message: on ? "VIP Transfer recorded." : "VIP Transfer removed." };
}

/**
 * Correct the day a lead was added.
 *
 * Worth knowing before using it: assigned_at feeds next_followup_at for anyone
 * never contacted, so moving this date moves that player in or out of today's
 * queue. That is the right behaviour - a lead that really arrived in March
 * really is overdue - but the queue will change underneath you.
 */
export async function setAddedDate(
  playerId: string,
  day: string
): Promise<{ error?: string; message?: string }> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const supabase = createClient();
  const { error } = await supabase.rpc("set_added_date", {
    p_player: playerId,
    p_when: dayToTimestamp(day),
  });

  if (error) return { error: error.message };

  refresh();
  return { message: "Added date updated." };
}

/**
 * A date picker gives back "2026-03-14" with no time and no zone.
 *
 * Midday UTC, deliberately. Midnight would land on the previous calendar day
 * for anyone west of Greenwich - a rep in New York picking the 14th would see
 * it counted on the 13th - and every zone the team works in is within twelve
 * hours of noon, so noon is the only choice that cannot shift the day.
 */
function dayToTimestamp(day: string): string {
  return new Date(`${day}T12:00:00Z`).toISOString();
}

export async function setVipWatch(
  playerId: string,
  watching: boolean,
  note?: string
): Promise<{ error?: string; message?: string }> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const supabase = createClient();

  const { data: player } = await supabase
    .from("players")
    .select("roobet_username")
    .eq("id", playerId)
    .maybeSingle();

  const username = (player?.roobet_username ?? "").trim();
  if (!username) {
    return {
      error:
        "This player has no Roobet username yet, so there is nothing to track " +
        "their wagering against. Add one first.",
    };
  }

  return setWagererWatch(username, watching, note);
}

/**
 * WATCH A ROOBET USERNAME, whether or not anyone owns them.
 *
 * This is the one the Wager page uses: the whole point is flagging a wagerer
 * who is in nobody's book, so there is no player to key on and no owner to
 * scope by. Admin only, enforced in the function itself.
 */
export async function setWagererWatch(
  username: string,
  watching: boolean,
  note?: string
): Promise<{ error?: string; message?: string }> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };
  if (me.role !== "admin") return { error: "Only admins manage the watch list." };

  const trimmed = username.trim();
  if (!trimmed) return { error: "No username given." };

  const supabase = createClient();
  const { error } = await supabase.rpc("set_wagerer_watch", {
    p_username: trimmed,
    p_watching: watching,
    p_note: note?.trim() || null,
  });

  if (error) return { error: watchError(error.message) };

  refresh();
  return {
    message: watching
      ? `${trimmed} added to the watch list.`
      : `${trimmed} taken off the watch list.`,
  };
}

function watchError(message: string) {
  return /does not exist|schema cache/i.test(message)
    ? "Run migration 20260812000036_watch_by_username.sql first."
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


/* ----------------------------------------------------------- Bulk add */

export type BulkAddResult = {
  error?: string;
  message?: string;
  added: string[];
  duplicates: { handle: string; where: string }[];
};

/**
 * Paste a list of handles, get a list of players.
 *
 * A rep pulling twenty names out of a Discord thread was filling in the same
 * form twenty times, changing one field each pass. Source and status are the
 * same for the whole batch by definition - they came from the same place at
 * the same time - so they are asked once.
 *
 * Duplicates are reported rather than skipped silently, because "I pasted 20
 * and got 17" needs an answer, and the answer is usually "you already have
 * these three".
 */
export async function bulkAddPlayers(
  raw: string,
  source: string,
  status: string,
  contacted: boolean
): Promise<BulkAddResult> {
  const me = await getMe();
  if (!me) return { error: "Not signed in.", added: [], duplicates: [] };

  /* One per line, but commas and tabs are just as likely from a paste, and a
     leading @ is how half of these get copied. */
  const handles = Array.from(
    new Set(
      raw
        .split(/[\n,\t]+/)
        .map((h) => h.trim().replace(/^@/, ""))
        .filter(Boolean)
    )
  );

  if (handles.length === 0) {
    return { error: "Nothing to add - paste some handles first.", added: [], duplicates: [] };
  }
  if (handles.length > 200) {
    return {
      error: `That is ${handles.length} handles. Add up to 200 at a time so a mistake stays small.`,
      added: [],
      duplicates: [],
    };
  }

  const supabase = createClient();
  const now = new Date().toISOString();

  // Everything this rep already has, in one query rather than one per handle.
  const { data: existing } = await supabase
    .from("players")
    .select("handle, reference, status")
    .eq("owner_id", me.id)
    .limit(100000);

  const mine = new Map(
    (existing ?? []).map((p) => [String(p.handle).toLowerCase(), p])
  );

  const duplicates: { handle: string; where: string }[] = [];
  const toInsert: Record<string, unknown>[] = [];

  for (const handle of handles) {
    const hit = mine.get(handle.toLowerCase());
    if (hit) {
      duplicates.push({ handle, where: `already yours - ${hit.reference} (${hit.status})` });
      continue;
    }
    toInsert.push({
      owner_id: me.id,
      handle,
      source: source || null,
      status,
      assigned_at: now,
      last_contact_at: contacted ? now : null,
      vip_fasttrack_started_at: status === "VIP Transferred" ? now : null,
      /* Adding somebody straight in at VIP Transferred IS a transfer. Without
         this the box beside them stays empty and their stat reads zero. */
      vip_transferred_at: status === "VIP Transferred" ? now : null,
      first_deposit_at: status === "First Deposit" || status === "Active" ? now : null,
    });
  }

  if (toInsert.length === 0) {
    return {
      message: "Every one of those is already in your book.",
      added: [],
      duplicates,
    };
  }

  const { data: created, error } = await supabase
    .from("players")
    .insert(toInsert)
    .select("id, handle, reference");

  if (error) return { error: error.message, added: [], duplicates };

  // The stats read activity_log, so every player needs their event.
  await supabase.from("activity_log").insert(
    (created ?? []).map((c) => ({
      player_id: c.id,
      user_id: me.id,
      event_type: "player_created",
      to_status: status,
      metadata: { via: "bulk" },
    }))
  );

  refresh();

  return {
    message:
      `Added ${created?.length ?? 0}` +
      (duplicates.length ? `, skipped ${duplicates.length} you already had.` : "."),
    added: (created ?? []).map((c) => `${c.reference} — ${c.handle}`),
    duplicates,
  };
}


/* --------------------------------------------------------- Notifications */

/** Opening the panel is reading them. No separate dismiss step. */
export async function markNotificationsRead(): Promise<{ error?: string }> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const supabase = createClient();
  const { error } = await supabase.rpc("mark_notifications_read");

  if (error) {
    return {
      error: /does not exist|schema cache/i.test(error.message)
        ? "Run migration 20260812000025_notifications.sql first."
        : error.message,
    };
  }
  return {};
}

/* ------------------------------------------------------ Message templates */

export type Template = { id: string; name: string; body: string; shared: boolean };

/** Shared snippets plus this rep's own. */
export async function listTemplates(): Promise<Template[]> {
  const me = await getMe();
  if (!me) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("message_templates")
    .select("id, name, body, owner_id")
    .eq("active", true)
    .order("sort_order")
    .order("name");

  if (error) return [];
  return (data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    body: t.body as string,
    shared: t.owner_id === null,
  }));
}

/**
 * Save a snippet.
 *
 * A rep's own by default. Only an admin can make one shared, because a
 * template everybody sees is a decision about how the team talks, not a
 * personal shortcut.
 */
export async function saveTemplate(
  name: string,
  body: string,
  shared = false
): Promise<{ error?: string; message?: string }> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const cleanName = name.trim();
  const cleanBody = body.trim();
  if (!cleanName) return { error: "Give it a name so you can find it." };
  if (!cleanBody) return { error: "The template is empty." };

  const supabase = createClient();
  const { error } = await supabase.from("message_templates").insert({
    name: cleanName,
    body: cleanBody,
    owner_id: shared && me.role === "admin" ? null : me.id,
  });

  if (error) {
    return {
      error: /does not exist|schema cache/i.test(error.message)
        ? "Run migration 20260812000021_messages.sql first."
        : error.message,
    };
  }

  refresh();
  return { message: `Saved "${cleanName}".` };
}

/** Remove one. RLS stops a rep deleting a shared template. */
export async function deleteTemplate(id: string): Promise<{ error?: string }> {
  const me = await getMe();
  if (!me) return { error: "Not signed in." };

  const supabase = createClient();
  const { error } = await supabase.from("message_templates").delete().eq("id", id);
  if (error) return { error: error.message };

  refresh();
  return {};
}
