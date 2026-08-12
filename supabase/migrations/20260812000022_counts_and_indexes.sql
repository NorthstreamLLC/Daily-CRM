-- ============================================================================
-- Speed: count in the database
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
--
-- A NOTE ON INDEXES
--   The first version of this file added six. Five were wrong:
--
--     next_followup_at and missing_roobet are computed by the
--     players_enriched VIEW from last_contact_at, assigned_at and the
--     status's followup_days. They are not columns on players and cannot be
--     indexed - which is the error this file originally produced.
--
--     lower(btrim(roobet_username)), reference, (player_id, occurred_at) and
--     (period_type, period_start) were already indexed by migrations 001,
--     005, 017 and 021. Adding them again costs write speed and disk for no
--     read benefit.
--
--   The queue's own filter is already served by players_owner_contact_idx
--   (owner_id, last_contact_at) and players_owner_status_idx (owner_id,
--   status) from 001. So exactly one index below is genuinely new.
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
  select p.source::text, count(*)::bigint
    from public.players p
   where p.source is not null
   group by p.source;
$$;

revoke all on function public.player_counts_by_source() from public;
grant execute on function public.player_counts_by_source() to authenticated;


-- ---------------------------------------------------------------------------
-- The one index that is actually new.
--
-- Stats filters activity_log by person AND event type AND day, constantly.
-- 001 indexed (user_id, occurred_at) and (event_type, occurred_at) separately,
-- so Postgres could use one or the other and then filter the rest by hand.
-- This composite serves the whole condition.
--
-- CONCURRENTLY is deliberately not used: the Supabase SQL editor wraps
-- statements in a transaction and will not allow it there.
-- ---------------------------------------------------------------------------
create index if not exists activity_user_type_time_idx
  on public.activity_log (user_id, event_type, occurred_at desc);


-- ---------------------------------------------------------------------------
-- Let the planner see what changed.
-- ---------------------------------------------------------------------------
analyze public.players;
analyze public.activity_log;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
