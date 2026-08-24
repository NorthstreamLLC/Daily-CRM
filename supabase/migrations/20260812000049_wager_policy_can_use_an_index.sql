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
--   WHAT I GOT WRONG FIRST
--     I blamed this policy:
--
--       exists (select 1 from players
--                where lower(btrim(roobet_username)) = lower(btrim(wager_periods.username))
--                  and owner_id = auth.uid())
--
--     saying lower(btrim(..)) forced a sequential scan of every player, once
--     per row. The planner says otherwise:
--
--       Index Scan using players_owner_status_contact_idx
--         Index Cond: (owner_id = ...)
--         Filter: (lower(btrim(roobet_username)) = ...)
--
--     Because the policy always pins owner_id, the existing owner index
--     already handles it and the expression never mattered. Cost 2.50.
--
--   WHAT IS ACTUALLY KNOWN
--     The cron, which runs as the service role and skips RLS entirely, has
--     never timed out. The manual sync, which ran under the admin's session
--     with RLS on, did. The difference between the two IS the RLS evaluation
--     on an upsert of tens of thousands of rows - every row checked against
--     both policies on the table, plus the with-check on the way in.
--
--     Which specific clause exhausted the budget, I have not proved. The fix
--     does not depend on knowing: the sync now runs as the service role, like
--     the cron, so it evaluates none of it. The route already checked that the
--     caller is an admin.
--
-- WHY THESE INDEXES ARE STILL WORTH ADDING
--   Not for the policy above - that one is fine. For the places that match on
--   lower(btrim(roobet_username)) with NO owner filter to lean on:
--
--     player_by_roobet     distinct on (lower(btrim(roobet_username))) across
--                          every player, read by all four wager report
--                          functions
--     duplicate_players    groups the whole table by the same expression
--     the wager joins      match usernames company-wide
--
--   Those genuinely have nothing but the expression to work with, and a
--   function around a column discards every plain index on it.
--
-- THE FIX
--   Expression indexes matching what those queries actually ask for.
--
--   Worth remembering generally: a function around a column in a WHERE clause
--   discards every plain index on that column - but check the plan before
--   assuming that is what is hurting, because another column in the same
--   predicate may already be carrying it.
-- ============================================================================

create index if not exists players_roobet_lower_owner_idx
  on public.players (lower(btrim(roobet_username)), owner_id)
  where roobet_username is not null and btrim(roobet_username) <> '';

comment on index public.players_roobet_lower_owner_idx is
  'For the company-wide matches on lower(btrim(roobet_username)) - '
  'player_by_roobet, duplicate_players, the wager report joins. The rep RLS '
  'policy does not need it: that one pins owner_id and the owner index serves '
  'it already.';
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
-- NO owner_id here, on purpose. The first version of this check included one,
-- which let the owner index answer it and told me nothing about the index I
-- had just built. A test that passes for the wrong reason is worse than none.
-- ---------------------------------------------------------------------------
explain
select 1 from public.players p
 where lower(btrim(p.roobet_username)) = 'someusername';

explain
select count(*) from public.player_by_roobet;
