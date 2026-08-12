-- ============================================================================
-- Speed: count in the database, and index what we filter on
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once. Independent of 017-021.
--
-- WHAT WAS SLOW
--   Several pages needed nothing but counts - how many players each rep has,
--   how many sit at each status, how many use each source - and got them by
--   selecting every player row and counting in JavaScript. At a few hundred
--   players that is invisible. At thirteen books it is megabytes crossing the
--   wire on every page load to produce about twenty numbers.
--
--   Postgres can count. These do it there, and return one row per group.
-- ============================================================================

drop function if exists public.player_counts_by_owner();

create function public.player_counts_by_owner()
returns table (owner_id uuid, players bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.owner_id, count(*)::bigint
    from public.players p
   group by p.owner_id;
$$;

revoke all on function public.player_counts_by_owner() from public;
grant execute on function public.player_counts_by_owner() to authenticated;


drop function if exists public.player_counts_by_status();

create function public.player_counts_by_status()
returns table (status text, players bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.status, count(*)::bigint
    from public.players p
   group by p.status;
$$;

revoke all on function public.player_counts_by_status() from public;
grant execute on function public.player_counts_by_status() to authenticated;


drop function if exists public.player_counts_by_source();

create function public.player_counts_by_source()
returns table (source text, players bigint)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.source, '')::text, count(*)::bigint
    from public.players p
   where p.source is not null
   group by p.source;
$$;

revoke all on function public.player_counts_by_source() from public;
grant execute on function public.player_counts_by_source() to authenticated;


-- ---------------------------------------------------------------------------
-- Indexes for the paths that run on every page load.
--
-- Each of these backs a filter or a join that currently makes Postgres read
-- the whole table. CONCURRENTLY is deliberately NOT used: the Supabase SQL
-- editor runs statements in a transaction, and CONCURRENTLY is not allowed
-- inside one. These tables are small enough that a brief lock is nothing.
-- ---------------------------------------------------------------------------

-- The queue's own condition: never contacted, or due.
create index if not exists players_queue_idx
  on public.players (owner_id, last_contact_at, next_followup_at);

-- Matching a Roobet username to a player happens on every sync and every
-- wager read. Without this it is a full scan per lookup.
create index if not exists players_roobet_lower_idx
  on public.players (lower(btrim(roobet_username)))
  where roobet_username is not null;

-- Book search by handle and by reference.
create index if not exists players_reference_idx on public.players (reference);

-- The message log, newest first per player.
create index if not exists player_messages_recent_idx
  on public.player_messages (player_id, occurred_at desc);

-- Stats read activity_log by person and day, constantly.
create index if not exists activity_user_type_time_idx
  on public.activity_log (user_id, event_type, occurred_at desc);

-- Wager period lookups by type and date - the headline cards, every load.
create index if not exists wager_periods_type_start_idx
  on public.wager_periods (period_type, period_start);

-- ---------------------------------------------------------------------------
-- Done. Worth running ANALYZE afterwards so the planner sees the new indexes:
--   analyze public.players;
--   analyze public.activity_log;
--   analyze public.wager_periods;
-- ---------------------------------------------------------------------------
