-- ============================================================================
-- One row per day, so the gap finder does not download the whole table
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once. Needed by the "Fill missing days" button.
--
-- WHY THIS EXISTS
--   Nothing in the app could write a past day. The live sync refreshes today,
--   and yesterday for six hours after midnight, and that is all
--   (currentPeriods). The backfill writes period_type 'month' at month-ends.
--
--   So when five days of August were missed, there was no way to recover them.
--   Isac pressed Sync three times waiting for the 23rd to come back. It could
--   not have - and nothing on the screen said so, which is the worse half.
--
--   The new endpoint asks each source for one specific whole UTC day. To know
--   WHICH days to ask for, it needs to know what is already held - and counting
--   that by downloading wager_periods would be the same "count in JavaScript
--   over a truncated fetch" mistake that made the leaderboard read Clear.
--   So the grouping happens here.
-- ============================================================================

drop function if exists public.wager_day_totals(integer);

create function public.wager_day_totals(p_days integer default 30)
returns table (day date, wagerers bigint, total numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    wp.period_start,
    count(*)::bigint,
    sum(wp.wagered)
  from public.wager_periods wp
  where wp.period_type = 'day'
    and wp.period_start >= ((now() at time zone 'utc')::date - p_days)
  group by wp.period_start
  order by wp.period_start desc;
$$;

revoke all on function public.wager_day_totals(integer) from public;
revoke all on function public.wager_day_totals(integer) from anon;
grant execute on function public.wager_day_totals(integer) to authenticated;

comment on function public.wager_day_totals(integer) is
  'Wagerers and total per stored UTC day. Used to find which days the sync '
  'never captured - a day with no row here is a day nobody asked Roobet '
  'about, which is not the same as a day nobody wagered.';
