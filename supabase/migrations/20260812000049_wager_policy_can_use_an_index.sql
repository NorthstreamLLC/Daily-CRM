-- ============================================================================
-- The rep's wager policy scans 1,500 players for every row it checks
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHAT THIS IS FIXING
--   The manual wager sync failed with
--
--       Daily: periods: canceling statement due to statement timeout
--
--   and five days of August never got a wager_periods row - so the wager page
--   simply had no 23rd, 19th, 18th, 16th or 13th, which looked like quiet days
--   rather than missing ones.
--
--   The cause was this policy:
--
--       exists (select 1 from players
--                where lower(btrim(roobet_username)) = lower(btrim(wager_periods.username))
--                  and owner_id = auth.uid())
--
--   Postgres runs it once per row. lower(btrim(..)) on the players side means
--   no plain index on roobet_username can serve it, so every single row costs a
--   sequential scan of the whole players table. At 1,500 players and thousands
--   of rows per period, the statement runs out of time.
--
--   The sync itself is fixed in the app - it now runs as the service role, like
--   the cron always did, so it does not pay for a permission check the route
--   has already done.
--
--   But REPS still read through this policy every time they open a page with a
--   wager figure on it, and they will keep paying the same cost. That is what
--   this migration is for.
--
-- THE FIX
--   An expression index matching the policy's expression exactly. An index on
--   roobet_username does nothing here; the planner needs one on
--   lower(btrim(roobet_username)), because that is what the comparison actually
--   asks for.
--
--   Worth remembering generally: a function around a column in a WHERE clause
--   silently discards every index on that column, and RLS policies are WHERE
--   clauses that run on every row of every query.
-- ============================================================================

create index if not exists players_roobet_lower_owner_idx
  on public.players (lower(btrim(roobet_username)), owner_id)
  where roobet_username is not null and btrim(roobet_username) <> '';

comment on index public.players_roobet_lower_owner_idx is
  'Serves the wager_periods_own RLS policy, which matches on '
  'lower(btrim(roobet_username)). Without it that policy scans every player '
  'once per row checked.';

/* The same shape appears in player_by_roobet, the duplicate finder and the
   wager report joins - all of them match on lower(btrim(roobet_username)) and
   all of them were doing it without an index. */
analyze public.players;


-- ---------------------------------------------------------------------------
-- And the other side of the join.
-- ---------------------------------------------------------------------------
create index if not exists wager_periods_username_lower_idx
  on public.wager_periods (lower(btrim(username)), period_type, period_start);

analyze public.wager_periods;


-- ---------------------------------------------------------------------------
-- Did it work? Ask the planner rather than assuming.
--
-- Look for "Index Scan using players_roobet_lower_owner_idx". If it still says
-- "Seq Scan on players", the index is not being used and the timeout will come
-- back.
-- ---------------------------------------------------------------------------
explain
select 1 from public.players p
 where lower(btrim(p.roobet_username)) = 'someusername'
   and p.owner_id = '00000000-0000-0000-0000-000000000000'::uuid;
