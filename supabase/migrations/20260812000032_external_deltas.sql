-- ============================================================================
-- The actual 8.4 seconds
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- THE MEASUREMENT
--   overview 8710ms · extDay 8377ms · extWeek 8377ms · extMonth 8377ms ·
--   periods 616ms · churn 578ms · report 567ms · ledgerLatest 539ms · ...
--
--   Three calls, identical timings, everything else under 620ms. That is one
--   function, called three times, and it is wager_external_deltas.
--
-- WHY IT WAS SLOW
--   For every (username, code) pair seen in the window it ran THREE correlated
--   subqueries:
--
--     (select wagered from wager_external
--       where lower(username) = pr.uname and source = pr.source
--         and captured_at <= p_start
--       order by captured_at desc limit 1)          -- the baseline
--     ...and two more for the first and last reading inside the window.
--
--   The index does match - it is on (lower(username), source, captured_at) -
--   so this is not a missing-index problem, which is what made it hard to see
--   by reading. It is a shape problem: ~860 pairs x 3 subqueries is roughly
--   2,600 separate index lookups per call, each one re-checking the row
--   security policy, and the page makes three calls.
--
--   Rewritten as three DISTINCT ON passes joined together: 2,600 lookups
--   become 3 ordered scans that the same index already supports.
--
-- WHY security definer NOW
--   Under `security invoker` the admin-only policy on wager_external was
--   evaluated throughout all those nested scans. This version checks once, at
--   the top, and returns nothing for a non-admin - which is exactly what the
--   policy did, without paying for it 2,600 times.
--
--   It RETURNS EMPTY rather than raising, deliberately: that is what a rep hit
--   before, and a page that renders zeroes is better than one that 500s.
-- ============================================================================

drop function if exists public.wager_external_deltas(timestamptz, timestamptz);

create function public.wager_external_deltas(
  p_start timestamptz,
  p_end   timestamptz
)
returns table (username text, source text, delta numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Company-wide money. Same answer the row policy gave, decided once.
  if not public.is_admin() then
    return;
  end if;

  return query
  with rel as (
    select lower(we.username) as uname,
           we.source,
           we.wagered,
           we.captured_at
      from public.wager_external we
     where we.captured_at <= p_end
  ),
  base as (
    -- Where they stood when the window opened.
    select distinct on (r.uname, r.source) r.uname, r.source, r.wagered
      from rel r
     where r.captured_at <= p_start
     order by r.uname, r.source, r.captured_at desc
  ),
  first_in as (
    -- Their first reading inside it - the fallback when there is no baseline,
    -- so somebody who appeared mid-window is not credited with their whole
    -- lifetime total.
    select distinct on (r.uname, r.source) r.uname, r.source, r.wagered
      from rel r
     where r.captured_at > p_start
     order by r.uname, r.source, r.captured_at asc
  ),
  last_in as (
    select distinct on (r.uname, r.source) r.uname, r.source, r.wagered
      from rel r
     where r.captured_at > p_start
     order by r.uname, r.source, r.captured_at desc
  )
  select l.uname,
         l.source,
         greatest(l.wagered - coalesce(b.wagered, f.wagered), 0)
    from last_in l
    left join first_in f on f.uname = l.uname and f.source = l.source
    left join base     b on b.uname = l.uname and b.source = l.source;
end $$;

revoke all on function public.wager_external_deltas(timestamptz, timestamptz) from public;
grant execute on function public.wager_external_deltas(timestamptz, timestamptz) to authenticated;


-- ============================================================================
-- The same bug, one book away from mattering
--
-- wager_deltas has the identical shape over wager_snapshots: three correlated
-- subqueries per (player, source) pair. It measured 507ms today, which looks
-- fine - because there are 251 players. At thirteen books it is the same
-- 8-second query, and wager_snapshots grows every thirty minutes forever.
--
-- Worse: wager_snapshots has NO INDEX beyond its primary key, so each of those
-- subqueries is a sequential scan of a table that only gets bigger.
--
-- Fixed now rather than after the next twelve imports, because "it is fine at
-- this size" is what the last one said too.
--
-- STILL security invoker, on purpose. The join to players means Row Level
-- Security applies: a rep gets their own players' figures and nobody else's.
-- Making this definer, as the external version above safely can, would hand
-- every rep the whole company's numbers.
-- ============================================================================

create index if not exists wager_snapshots_pair_idx
  on public.wager_snapshots (player_id, source, captured_at desc);

create index if not exists wager_snapshots_time_idx
  on public.wager_snapshots (captured_at);

drop function if exists public.wager_deltas(timestamptz, timestamptz);

create function public.wager_deltas(p_start timestamptz, p_end timestamptz)
returns table (player_id uuid, owner_id uuid, delta numeric)
language sql
stable
security invoker
as $$
  with rel as (
    select ws.player_id, ws.source, ws.wagered, ws.captured_at
      from public.wager_snapshots ws
     where ws.captured_at <= p_end
  ),
  base as (
    select distinct on (r.player_id, r.source) r.player_id, r.source, r.wagered
      from rel r
     where r.captured_at <= p_start
     order by r.player_id, r.source, r.captured_at desc
  ),
  first_in as (
    select distinct on (r.player_id, r.source) r.player_id, r.source, r.wagered
      from rel r
     where r.captured_at > p_start
     order by r.player_id, r.source, r.captured_at asc
  ),
  last_in as (
    select distinct on (r.player_id, r.source) r.player_id, r.source, r.wagered
      from rel r
     where r.captured_at > p_start
     order by r.player_id, r.source, r.captured_at desc
  ),
  per_pair as (
    -- No baseline means the first in-window snapshot is the baseline, so a
    -- brand-new player's history never counts as this window's activity.
    -- greatest(0) guards against a leaderboard reset going negative.
    select l.player_id,
           greatest(l.wagered - coalesce(b.wagered, f.wagered), 0) as d
      from last_in l
      left join first_in f on f.player_id = l.player_id and f.source = l.source
      left join base     b on b.player_id = l.player_id and b.source = l.source
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

revoke all on function public.wager_deltas(timestamptz, timestamptz) from public;
grant execute on function public.wager_deltas(timestamptz, timestamptz) to authenticated;
