-- ============================================================================
-- Pruning must not eat the backfill
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once. Replaces the version from 033.
--
-- WHAT WAS WRONG
--   033 deleted every snapshot older than 100 days except the most recent per
--   (player, source). That is correct for the live sync, which writes a row
--   every thirty minutes and produces enormous redundancy.
--
--   It is wrong for the BACKFILL, which writes one row per player per source
--   per past month-end. Backfilling to January would write seven months of
--   history and the next nightly prune would delete five of them - everything
--   older than 100 days - leaving the newest two and the all-time row.
--
--   The month-by-month view survives either way, because it reads
--   wager_periods and nothing prunes that. But any window query over an old
--   month reads snapshots, and those would be gone. The backfill would appear
--   to work, and quietly hollow out overnight.
--
-- THE RULE NOW
--   Keep ONE snapshot per (player, source) per CALENDAR MONTH - the last one
--   in that month - plus everything inside the retention window.
--
--   So:
--     - the last 100 days keep full half-hourly detail
--     - older than that collapses to a monthly skeleton, forever
--     - the backfill's month-end rows ARE that skeleton, so they survive by
--       construction rather than by exception
--
--   That is the shape the data actually wants: recent detail for windows,
--   long history for trends, and none of the 48-rows-a-day noise in between.
-- ============================================================================

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
  with keepers as (
    /* The last snapshot of each calendar month, per pair. Older months
       collapse to one row each; the current month is inside the retention
       window anyway. This is also exactly what the backfill writes, so
       backfilled history is preserved without special-casing it. */
    select distinct on (ws.player_id, ws.source, date_trunc('month', ws.captured_at))
           ws.id
      from public.wager_snapshots ws
     order by ws.player_id,
              ws.source,
              date_trunc('month', ws.captured_at),
              ws.captured_at desc
  ),
  gone as (
    delete from public.wager_snapshots ws
     where ws.captured_at < v_cutoff
       and ws.id not in (select id from keepers)
    returning 1
  )
  select count(*) into v_deleted from gone;

  return v_deleted;
end $$;

revoke all on function public.prune_wager_snapshots(integer) from public;

comment on function public.prune_wager_snapshots(integer) is
  'Full detail for p_keep_days, then one row per player per code per calendar '
  'month forever. Preserves backfilled history, which is written at past '
  'month-ends. Minimum 45 days enforced.';
