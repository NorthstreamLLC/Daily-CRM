-- ============================================================================
-- Two things that only get worse with time
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- 1. wager_snapshots grows forever and nothing prunes it.
-- 2. The Wager page runs eleven queries to display three numbers.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. PRUNE THE SNAPSHOTS
--
-- Migration 024 prunes daily wager_periods rows. Nothing has ever pruned
-- wager_snapshots, which gains a row every thirty minutes for every matched
-- player on every code. At one book that is a few thousand rows a day. At
-- thirteen it is tens of thousands, forever, and every window calculation
-- reads it.
--
-- WHAT MUST SURVIVE
--   The MOST RECENT row per (player, source), whatever its age. That single
--   row is the player's all-time figure - attach_wager_history reads it, and
--   deleting it would silently zero somebody's lifetime wager. A dormant
--   player who last wagered in March must keep their March reading forever.
--
--   Everything older than the cutoff that is NOT the latest for its pair is
--   history nobody reads: the windows only ever look back as far as the
--   current month.
-- ---------------------------------------------------------------------------
drop function if exists public.prune_wager_snapshots(integer);

create function public.prune_wager_snapshots(p_keep_days integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
  v_cutoff  timestamptz := now() - make_interval(days => greatest(p_keep_days, 45));
begin
  with latest as (
    -- The row that must never be deleted, per pair.
    select distinct on (ws.player_id, ws.source) ws.id
      from public.wager_snapshots ws
     order by ws.player_id, ws.source, ws.captured_at desc
  ),
  gone as (
    delete from public.wager_snapshots ws
     where ws.captured_at < v_cutoff
       and ws.id not in (select id from latest)
    returning 1
  )
  select count(*) into v_deleted from gone;

  return v_deleted;
end $$;

revoke all on function public.prune_wager_snapshots(integer) from public;

comment on function public.prune_wager_snapshots(integer) is
  'Deletes snapshots older than p_keep_days EXCEPT the most recent per '
  '(player, source), which is that player all-time figure and must survive '
  'regardless of age. Minimum 45 days enforced, so a mistaken 1 cannot '
  'destroy the current month is baselines.';


-- ---------------------------------------------------------------------------
-- 2. ONE NUMBER INSTEAD OF ELEVEN QUERIES
--
-- The Wager page called getWagerOverview - eleven queries building per-rep
-- totals, top players, per-code breakdowns and deposit signals - and then
-- used exactly three values from it: a count of unclaimed wagerers, and two
-- more that only answered "is there any data at all yet?", which the period
-- totals already answer.
--
-- The rest was computed, serialised, and thrown away on every page load. This
-- returns the one number that page actually needs.
--
-- Unclaimed means: wagering on our codes, matched to nobody's book, and not
-- marked as pre-existing.
-- ---------------------------------------------------------------------------
drop function if exists public.unclaimed_wagerer_count();

create function public.unclaimed_wagerer_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from (
      select distinct lower(btrim(we.username)) as uname
        from public.wager_external we
    ) all_names
   where not exists (
           select 1 from public.players pl
            where lower(btrim(pl.roobet_username)) = all_names.uname
         )
     and not exists (
           select 1 from public.wager_ignored wi
            where lower(btrim(wi.username)) = all_names.uname
         );
$$;

revoke all on function public.unclaimed_wagerer_count() from public;
grant execute on function public.unclaimed_wagerer_count() to authenticated;
