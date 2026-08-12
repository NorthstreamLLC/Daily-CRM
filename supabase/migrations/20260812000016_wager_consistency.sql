-- ============================================================================
-- One definition of a player's wager
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- THE BUG
--   Two code paths disagreed about a player who appears on more than one code.
--   The sync took the LARGEST figure across codes; attach_wager_history SUMMED
--   them. The same player's total therefore changed depending on which path
--   last touched them - the kind of quiet inconsistency that destroys trust in
--   a number.
--
--   Largest wins, everywhere. A Roobet account belongs to one referral code, so
--   the same player showing on two leaderboards is the same wagering reported
--   twice, not twice the wagering. Adding them would inflate the figure the
--   business is paid on.
-- ============================================================================

drop function if exists public.attach_wager_history(uuid);

create function public.attach_wager_history(p_player uuid)
returns table (matched boolean, total numeric, rows_added int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_owner    uuid;
  v_added    int := 0;
  v_total    numeric := 0;
begin
  select btrim(p.roobet_username), p.owner_id
    into v_username, v_owner
    from public.players p
   where p.id = p_player;

  if v_username is null or v_username = '' then
    return query select false, 0::numeric, 0;
    return;
  end if;

  if not (v_owner = auth.uid() or public.is_admin()) then
    raise exception 'Not permitted';
  end if;

  with incoming as (
    select we.wagered, we.source, we.captured_at
      from public.wager_external we
     where lower(btrim(we.username)) = lower(v_username)
  ),
  fresh as (
    select i.* from incoming i
    where not exists (
      select 1 from public.wager_snapshots ws
       where ws.player_id = p_player
         and ws.source = i.source
         and ws.captured_at = i.captured_at
    )
  ),
  inserted as (
    insert into public.wager_snapshots (player_id, wagered, source, captured_at)
    select p_player, f.wagered, f.source, f.captured_at from fresh f
    returning 1
  )
  select count(*) into v_added from inserted;

  -- LARGEST latest reading across codes, matching the sync and wager_deltas.
  select coalesce(max(latest.wagered), 0) into v_total
    from (
      select distinct on (ws.source) ws.wagered
        from public.wager_snapshots ws
       where ws.player_id = p_player
       order by ws.source, ws.captured_at desc
    ) latest;

  update public.players
     set weighted_wager = v_total
   where id = p_player;

  return query select (v_total > 0), v_total, v_added;
end $$;

revoke all on function public.attach_wager_history(uuid) from public;
grant execute on function public.attach_wager_history(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
