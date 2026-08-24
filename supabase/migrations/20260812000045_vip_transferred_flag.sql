-- ============================================================================
-- VIP transfer becomes something a rep ticks
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHY
--   A VIP transfer feeds commission, and until now nothing in the CRM recorded
--   one. It was inferred from a player's CURRENT status, which cannot tell the
--   difference between a player a rep handed to the VIP team and a player the
--   wager sync promoted to Active because they happened to start betting.
--
--   Isac caught the inference producing nonsense - "there is no chance Chella
--   even has 10 VIP transfers" - and the answer is not a cleverer rule. It is
--   to stop guessing and let the person who did the work say so.
--
-- HOW IT WORKS
--   A column, ticked from the player's detail panel. Ticking writes the
--   activity_log row too, so it lands in Stats, the trend, records and the
--   funnel exactly as a transfer logged any other way would - there is no
--   second definition of the number to drift.
--
--   Un-ticking is a correction, so it removes the event as well. A mis-tick
--   should cost nothing; the audit trail of the correction lives in the
--   activity log's own history.
--
-- ON EXISTING PLAYERS
--   Everyone starts unticked, including the 1,500 imported. Reps go back
--   through their own books and tick the ones that were genuinely transferred.
--   That is slower than a backfill and it is the only version that is true.
-- ============================================================================

alter table public.players
  add column if not exists vip_transferred_at timestamptz;

/* players_enriched is `select p.*`, and Postgres freezes that star when the
   view is created. Adding a column here does NOT add it to the view, and the
   app reads the view - so without the rebuild in migration 046 every page
   that loads a player throws. Run 046 straight after this one. */

comment on column public.players.vip_transferred_at is
  'When a rep marked this player as a VIP Transfer. Set by hand, never '
  'inferred from status - a player at Active may have got there through the '
  'wager sync without any rep transferring them.';

/* Partial: the question asked of this column is always "who HAS been
   transferred", and the nulls are the overwhelming majority. */
create index if not exists players_vip_transferred_idx
  on public.players (owner_id, vip_transferred_at)
  where vip_transferred_at is not null;


-- ---------------------------------------------------------------------------
-- Tick or untick, and keep the log in step.
--
-- One function rather than an update from the app, because the column and the
-- activity_log row must move together. Two separate writes from the client is
-- how a figure ends up disagreeing with the history behind it.
-- ---------------------------------------------------------------------------
drop function if exists public.set_vip_transferred(uuid, boolean);

create function public.set_vip_transferred(p_player uuid, p_on boolean)
returns timestamptz
language plpgsql
security invoker          -- RLS decides whose players this may touch
set search_path = public
as $$
declare
  v_owner uuid;
  v_when  timestamptz;
begin
  /* security invoker, so this select returns nothing at all if the player is
     not visible to the caller. A rep cannot tick somebody else's player, and
     the check is RLS's rather than a role test written out again here. */
  select owner_id into v_owner from public.players where id = p_player;
  if v_owner is null then
    raise exception 'That player is not yours.';
  end if;

  if p_on then
    v_when := now();

    update public.players
       set vip_transferred_at = coalesce(vip_transferred_at, v_when)
     where id = p_player
     returning vip_transferred_at into v_when;

    -- Not twice. Ticking an already-ticked player is a no-op, not a second
    -- transfer on somebody's commission.
    if not exists (
      select 1 from public.activity_log
       where player_id = p_player
         and event_type = 'status_change'
         and to_status = 'VIP Transferred'
    ) then
      insert into public.activity_log
        (player_id, user_id, event_type, to_status, occurred_at, metadata)
      values
        (p_player, v_owner, 'status_change', 'VIP Transferred', v_when,
         jsonb_build_object('marked_by_rep', true));
    end if;

    return v_when;
  end if;

  -- Untick: a correction, so the event goes with it.
  update public.players set vip_transferred_at = null where id = p_player;

  delete from public.activity_log
   where player_id = p_player
     and event_type = 'status_change'
     and to_status = 'VIP Transferred';

  return null;
end $$;

revoke all on function public.set_vip_transferred(uuid, boolean) from public;
grant execute on function public.set_vip_transferred(uuid, boolean) to authenticated;
