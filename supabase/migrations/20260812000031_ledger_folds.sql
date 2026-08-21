-- ============================================================================
-- Stop downloading the whole ledger to add it up
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- THE MEASUREMENT
--   Wager: data fetched in 8455ms
--   overview 8447ms · periods 535ms · report 507ms · repPeriods 448ms ·
--   team 423ms · churn 400ms
--
--   Everything else on that page is under 550ms. getWagerOverview is 8.4
--   seconds on its own, and it is 94% of the page.
--
-- WHY
--   It fetches the ENTIRE wager_external ledger twice, over HTTP, on every
--   page load:
--
--     select username, captured_at   from wager_external where wagered > 0
--       order by captured_at limit 300000
--
--     select username, source, wagered, captured_at from wager_external
--       order by captured_at limit 300000
--
--   ...and then folds them in JavaScript to find (a) the latest reading per
--   username+code and (b) the first time each username wagered anything.
--
--   Both are one line of SQL. Postgres answers them from ~1,700 and ~900 rows
--   respectively; the app was moving up to 600,000 rows across the network to
--   compute the same two maps by hand.
--
--   This is what the ledger looked like before wager_periods existed, and it
--   survived because nothing was measuring it. The page grew a second, faster
--   source of truth and kept paying for the first one.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Latest reading per username per code.
--
-- Every dollar figure derived from the ledger starts here: per-code totals,
-- the company all-time figure, and the unclaimed list.
-- ---------------------------------------------------------------------------
drop function if exists public.wager_ledger_latest();

create function public.wager_ledger_latest()
returns table (username text, source text, wagered numeric)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (lower(btrim(we.username)), we.source)
         we.username,
         we.source,
         we.wagered
    from public.wager_external we
   order by lower(btrim(we.username)),
            we.source,
            we.captured_at desc;
$$;

revoke all on function public.wager_ledger_latest() from public;
grant execute on function public.wager_ledger_latest() to authenticated;


-- ---------------------------------------------------------------------------
-- When each username first wagered anything at all.
--
-- Roobet does not report deposits, but nobody wagers without one - so a
-- username's first nonzero ledger entry is a dated deposit confirmation. It
-- drives "wagering players, all time" and the new-player counts.
-- ---------------------------------------------------------------------------
drop function if exists public.wager_first_seen();

create function public.wager_first_seen()
returns table (username text, first_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (lower(btrim(we.username)))
         we.username,
         we.captured_at
    from public.wager_external we
   where we.wagered > 0
   order by lower(btrim(we.username)), we.captured_at asc;
$$;

revoke all on function public.wager_first_seen() from public;
grant execute on function public.wager_first_seen() to authenticated;


-- ---------------------------------------------------------------------------
-- Indexes matching what those two actually sort by.
--
-- wager_external_pair_idx is on (username, source, captured_at) - raw
-- username, not lower(btrim(...)) - so neither DISTINCT ON above could use it
-- and both would sort the whole table. These match the expressions exactly.
-- ---------------------------------------------------------------------------
create index if not exists wager_external_latest_idx
  on public.wager_external (lower(btrim(username)), source, captured_at desc);

create index if not exists wager_external_first_idx
  on public.wager_external (lower(btrim(username)), captured_at asc)
  where wagered > 0;
