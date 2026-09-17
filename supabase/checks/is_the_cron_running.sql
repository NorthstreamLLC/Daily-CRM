-- ============================================================================
-- Is the automatic sync actually running?
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste > Run.
--   Read only.
--
--   ONE STATEMENT, on purpose. The Supabase editor shows only the result of
--   the LAST statement in a script, so a file of six queries returns one
--   answer and silently discards five. Every check in this folder had that
--   shape and it cost two rounds of questions - the numbers were produced and
--   thrown away before anyone saw them. Anything that needs several questions
--   answered at once belongs in one row.
--
--   The detail queries are at the bottom, commented out. Highlight one and
--   press Run to execute just that.
--
-- WHY THIS EXISTS
--   "The auto sync hasn't been working super well" is not a thing the app can
--   answer. Admin > Settings shows whether CRON_SECRET is set and when each
--   source last succeeded - neither distinguishes between:
--
--     the cron never fires            Vercel is not calling it
--     it fires and is rejected        CRON_SECRET missing or mismatched, 401
--     it fires and times out          killed at 300s, never reaches its audit
--                                     write, so it leaves no trace at all
--     it fires and the sources fail   Roobet returning errors
--
--   Every completed scheduled run writes an admin_audit row with action
--   'wager_sync_scheduled'. That is the evidence.
--
-- HOW TO READ THE ROW
--   runs_last_24h    48 is healthy on the current */30 schedule.
--                    0 with an old last_scheduled_run = not firing, or being
--                      rejected. Check CRON_SECRET in Vercel first.
--                    well under 48 = it fires but dies before finishing.
--   failed_sources_last_run
--                    above 0 means it IS running and Roobet is refusing it -
--                    a completely different problem from the cron not firing.
--   missing_days_30  the outcome that actually matters. Zero means that
--                    whatever the runs look like, the data is intact.
-- ============================================================================

with days as (
  select generate_series(
           (current_date - 29)::date,
           current_date::date,
           interval '1 day'
         )::date as day
),
held as (
  select x.period_start as day
    from (
      select period_start, lower(btrim(username)) as uname, max(wagered) as wagered
        from public.wager_periods
       where period_type = 'day'
         and period_start >= current_date - 29
       group by period_start, lower(btrim(username))
    ) x
   group by x.period_start
),
missing as (
  select count(*) as n,
         string_agg(to_char(d.day, 'DD Mon'), ', ' order by d.day desc) as which
    from days d
    left join held h on h.day = d.day
   where h.day is null
),
last_run as (
  select occurred_at, detail
    from public.admin_audit
   where action = 'wager_sync_scheduled'
   order by occurred_at desc
   limit 1
)
select
  (select occurred_at from last_run)                          as last_scheduled_run,
  now() - (select occurred_at from last_run)                  as ago,

  (select count(*) from public.admin_audit
    where action = 'wager_sync_scheduled'
      and occurred_at > now() - interval '1 day')             as runs_last_24h,
  48                                                          as expected_24h,

  (select count(*) from public.admin_audit
    where action = 'wager_sync_scheduled'
      and occurred_at > now() - interval '7 days')            as runs_last_7d,

  /* A run that completes having failed on every source still writes its audit
     row, so the count above can look perfectly healthy while nothing is being
     fetched. This is the difference. */
  (select count(*)
     from last_run lr,
          jsonb_array_elements(coalesce(lr.detail->'sources', '[]')) s
    where s->>'error' is not null)                            as failed_sources_last_run,

  (select string_agg(s->>'error', ' | ')
     from last_run lr,
          jsonb_array_elements(coalesce(lr.detail->'sources', '[]')) s
    where s->>'error' is not null)                            as last_errors,

  (select n from missing)                                     as missing_days_30,
  (select which from missing)                                 as which_days,

  (select max(occurred_at) from public.admin_audit
    where action in ('wager_sync', 'wager_sync_all', 'wager_refresh'))
                                                              as last_manual_press;


-- ---------------------------------------------------------------------------
-- DETAIL. Highlight one block and press Run.
-- ---------------------------------------------------------------------------

-- Runs per hour over two days. Two an hour is healthy; a steady one means half
-- the runs are dying, and multi-hour holes point at the platform, not the code.
--
-- select date_trunc('hour', occurred_at) as hour, count(*) as runs
--   from public.admin_audit
--  where action = 'wager_sync_scheduled'
--    and occurred_at > now() - interval '2 days'
--  group by 1 order by 1 desc;


-- What the last 15 scheduled runs reported, per source.
--
-- select occurred_at, detail->'sources' as sources, detail->>'advanced' as advanced
--   from public.admin_audit
--  where action = 'wager_sync_scheduled'
--  order by occurred_at desc limit 15;


-- Every day of the last 30 with its total, so a partial day is visible as well
-- as a missing one. A day far below its neighbours is a run that died partway,
-- which is more dangerous than a hole because it reads as a real day.
--
-- select x.period_start as day, sum(x.wagered)::numeric(14,2) as wagered,
--        count(*) as wagerers
--   from (select period_start, lower(btrim(username)) as uname,
--                max(wagered) as wagered
--           from public.wager_periods
--          where period_type = 'day' and period_start >= current_date - 29
--          group by period_start, lower(btrim(username))) x
--  group by x.period_start order by x.period_start desc;
