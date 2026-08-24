-- ============================================================================
-- How much is actually wrong?
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste > Run. Reads only.
--
-- THE SHORT VERSION
--   Only the DAILY series is holed. Month, week and all-time totals are each
--   fetched from Roobet as their own whole-window question - a month total is
--   not a sum of days - so a missed day does not subtract from them.
--
--   And those three self-heal: every sync run rewrites the current month, week
--   and all-time rows, so a run that died half way is overwritten thirty
--   minutes later by one that did not.
--
--   A DAY cannot self-heal. Once midnight passes, nothing ever asks about that
--   day again. That asymmetry is the whole bug: the periods that repair
--   themselves were fine, and the one that could not was the one nobody
--   noticed.
-- ============================================================================

-- 1. Does the month agree with the days it contains?
--    They will NOT match exactly - the month row is its own fact, and days are
--    missing - but the size of the difference tells you what the daily chart is
--    understating by.
select
  'August day sum' as figure,
  sum(wagered)     as total
  from public.wager_periods
 where period_type = 'day'
   and period_start >= date '2026-08-01'
union all
select
  'August month row',
  sum(wagered)
  from public.wager_periods
 where period_type = 'month'
   and period_start = date '2026-08-01';


-- 2. Which days are missing or look partial, with the neighbours for context.
with days as (
  select period_start, count(*) as wagerers, sum(wagered) as total
    from public.wager_periods
   where period_type = 'day'
   group by period_start
),
span as (
  select generate_series(min(period_start), max(period_start), interval '1 day')::date as d
    from days
)
select
  span.d                                as day,
  coalesce(days.wagerers, 0)            as wagerers,
  coalesce(days.total, 0)::numeric(14,2) as total,
  case
    when days.period_start is null then 'MISSING - never captured'
    when days.total < (select percentile_cont(0.5) within group (order by total)
                         from days) * 0.25 then 'PARTIAL - far below the median'
    else 'looks complete'
  end                                    as verdict
from span
left join days on days.period_start = span.d
order by span.d desc;


-- 3. The figures commission is actually paid from - all-time per person.
--    Unaffected by the daily gaps, and the number to compare against Roobet's
--    affiliate panel if you want certainty rather than my word for it.
select
  source,
  count(*)          as wagerers,
  sum(wagered)::numeric(14,2) as all_time_total,
  max(refreshed_at) as last_refreshed
from public.wager_periods
where period_type = 'all'
group by source
order by all_time_total desc;
