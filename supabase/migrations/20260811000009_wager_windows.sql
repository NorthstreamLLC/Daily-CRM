-- ============================================================================
-- Wager over a date window
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- THE PROBLEM THIS SOLVES
--   The leaderboard reports a RUNNING TOTAL per player, not per-day figures.
--   "Wagered this week" is therefore a subtraction: the last snapshot in the
--   window minus the last snapshot before it. That is why every sync keeps a
--   dated snapshot instead of overwriting one number.
--
--   A player's very first snapshot is a baseline, not activity - their whole
--   history arrives in one number, and counting it as "today" would make the
--   first sync look like the biggest day ever. First snapshots set the floor;
--   growth is measured from there.
-- ============================================================================

drop function if exists public.wager_deltas(timestamptz, timestamptz);

create function public.wager_deltas(p_start timestamptz, p_end timestamptz)
returns table (player_id uuid, owner_id uuid, delta numeric)
language sql
stable
security invoker
as $$
  with pairs as (
    -- Every (player, source) that has at least one snapshot inside the window.
    select distinct ws.player_id, ws.source
    from public.wager_snapshots ws
    where ws.captured_at > p_start and ws.captured_at <= p_end
  ),
  measured as (
    select
      pr.player_id,
      -- Last reading before the window opened: the baseline.
      (select w.wagered from public.wager_snapshots w
        where w.player_id = pr.player_id and w.source = pr.source
          and w.captured_at <= p_start
        order by w.captured_at desc limit 1) as baseline,
      -- First and last readings inside the window.
      (select w.wagered from public.wager_snapshots w
        where w.player_id = pr.player_id and w.source = pr.source
          and w.captured_at > p_start and w.captured_at <= p_end
        order by w.captured_at asc limit 1) as first_in,
      (select w.wagered from public.wager_snapshots w
        where w.player_id = pr.player_id and w.source = pr.source
          and w.captured_at > p_start and w.captured_at <= p_end
        order by w.captured_at desc limit 1) as last_in
    from pairs pr
  ),
  per_pair as (
    -- No baseline means the first in-window snapshot is the baseline, so a
    -- brand-new player's history never counts as this window's activity.
    -- greatest(0) guards against a leaderboard reset going negative.
    select
      m.player_id,
      greatest(m.last_in - coalesce(m.baseline, m.first_in), 0) as d
    from measured m
    where m.last_in is not null
  ),
  per_player as (
    -- The same player on two leaderboards reports the same wagering twice;
    -- take the largest movement rather than summing duplicates.
    select pp.player_id, max(pp.d) as delta
    from per_pair pp
    group by pp.player_id
  )
  select per_player.player_id, p.owner_id, per_player.delta
  from per_player
  join public.players p on p.id = per_player.player_id;
$$;

-- SECURITY INVOKER + the join to players means Row Level Security still
-- applies: a rep calling this gets their own players' figures and nobody
-- else's; an admin gets everyone.
revoke all on function public.wager_deltas(timestamptz, timestamptz) from public;
grant execute on function public.wager_deltas(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
