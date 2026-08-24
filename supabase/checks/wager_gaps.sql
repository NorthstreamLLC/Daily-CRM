-- ============================================================================
-- Which days did the wager sync actually record?
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste > Run. Reads only.
--
-- WHY
--   The wager page showed 24, 22, 21, 20, 17, 15, 14 and 12 August - and
--   nothing for 23, 19, 18, 16 or 13. The 22nd had 8 wagerers against ~190 on
--   a normal day.
--
--   The page only draws periods that exist in wager_periods. A day the sync
--   never captured has no row, and no row looks exactly like a quiet day. That
--   is the real problem here: absence and zero are being drawn the same way.
--
--   The cron runs every 30 minutes (vercel.json). If a day is missing, either
--   the job did not run, or it ran and got nothing back from Roobet.
-- ============================================================================

-- 1. Every day in the last month, including the ones with no data at all.
--    generate_series is the point: it produces the days that are MISSING,
--    which a plain group-by over the table never can.
select
  d::date                                   as day,
  coalesce(w.wagerers, 0)                   as wagerers,
  coalesce(w.total, 0)::numeric(14,2)       as total_wagered,
  case
    when w.wagerers is null then 'NO DATA - the sync did not record this day'
    when w.wagerers < 50    then 'partial? well below a normal day'
    else 'looks complete'
  end                                       as verdict
from generate_series(
       (now() at time zone 'utc')::date - interval '30 days',
       (now() at time zone 'utc')::date,
       interval '1 day'
     ) d
left join (
  select period_start, count(*) as wagerers, sum(wagered) as total
    from public.wager_periods
   where period_type = 'day'
   group by period_start
) w on w.period_start = d::date
order by d desc;


-- 2. When did the sync last actually write anything? If this is hours ago
--    rather than minutes, the cron is not running.
select
  max(captured_at)                             as last_snapshot,
  now() - max(captured_at)                     as ago
from public.wager_snapshots;


-- 3. Same question from the other side - the periods table.
select
  period_type,
  max(period_start) as newest_period,
  count(distinct period_start) as periods_held
from public.wager_periods
group by period_type
order by period_type;
