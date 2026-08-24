-- ============================================================================
-- players_enriched has to be rebuilt to see a new column
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once. Run this NOW - the app is down without it.
--
-- WHAT BROKE
--   Migration 045 added players.vip_transferred_at. The column exists. The app
--   still threw "a server-side exception has occurred" on every page that
--   loads players.
--
-- WHY
--   players_enriched is defined as `select p.*, ...`. Postgres expands that
--   star ONCE, when the view is created, and stores the resulting column list.
--   It is not a live wildcard. Adding a column to players afterwards does
--   nothing to the view - the view keeps the columns it had on the day it was
--   written.
--
--   So: the column was really there, the app really asked for it, and the view
--   it asked through really did not have it. PostgREST returned "column does
--   not exist" and the pages threw.
--
--   This is the thing to remember about `select *` in a view: it reads like a
--   promise to follow the table, and it is the opposite - a snapshot of the
--   table taken at creation and frozen.
--
-- WHY NOT create or replace
--   The new column lands at the end of players, so `p.*` now expands to put it
--   BEFORE followup_days rather than after everything. create or replace can
--   only append columns, never reorder them, so it refuses. It has to be
--   dropped and rebuilt.
--
--   Nothing is lost by dropping it: a view holds no data, RLS policies live on
--   the tables underneath, and the functions that read it (outstanding_by_owner
--   and friends) are resolved at call time, not bound to the view object.
-- ============================================================================

drop view if exists public.players_enriched;

create view public.players_enriched with (security_invoker = true) as
select
  p.*,
  s.followup_days,
  s.next_action,
  s.is_dead,
  s.is_ftd,
  s.counts_as_lead,
  (coalesce(p.last_contact_at, p.assigned_at) + make_interval(days => s.followup_days)) as next_followup_at,
  (p.roobet_username is null or btrim(p.roobet_username) = '')                          as missing_roobet
from public.players p
join public.statuses s on s.name = p.status;

comment on view public.players_enriched is
  'The Book with each status''s rules applied. security_invoker, so it obeys '
  'the same row rules as players - reps see their own. NOTE: `p.*` is frozen '
  'at creation, so this view must be rebuilt whenever a column is added to '
  'players, or the app will ask for a column the view does not have.';

grant select on public.players_enriched to authenticated;


-- ---------------------------------------------------------------------------
-- Tell PostgREST the shape changed.
--
-- It caches the schema, and until it re-reads, a column that now exists is
-- still reported as missing - which looks exactly like the migration not
-- having run and sends you looking in the wrong place.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Prove it, rather than assuming.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'players_enriched'
       and column_name = 'vip_transferred_at'
  ) then
    raise exception 'players_enriched still has no vip_transferred_at - did migration 045 run?';
  end if;
  raise notice 'players_enriched now exposes vip_transferred_at. The app should load.';
end $$;
