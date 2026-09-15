-- ============================================================================
-- The leaderboard cycle becomes a period the database stores
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHY
--   Roobet's leaderboard runs 16th to 15th, and that window is what commission
--   conversations are actually about. Nothing in the CRM could answer it: the
--   only windows stored were day, week, month and all-time.
--
--   It could have been derived by adding up days - 16 Aug through 15 Sep is
--   thirty daily rows. That would have been wrong in a way that is hard to see
--   later. Daily rows go missing (five days of August did exactly that), and a
--   sum of days silently becomes a smaller number rather than an obviously
--   absent one. The cycle is asked of Roobet directly, as one window, the same
--   way the month is - so it is a fact with a source, not arithmetic over
--   whatever happened to be on hand.
--
-- WHAT THIS ADDS
--   1. 'leaderboard' as a legal period_type.
--   2. wager_scoped learns it, so every existing caller can ask for one.
--   3. wager_cycle_rows / wager_cycle_totals - month AND cycle AND all-time in
--      a single scan, because the Stats table now shows all three side by side
--      and three separate calls would triple the work for one table.
--
-- ON HISTORY
--   Nothing exists for past cycles until something goes and fetches them. The
--   Refresh button on Stats does that: it tops up the live cycle and fills any
--   of the last twelve that are empty. Until it is pressed once, the cycle
--   column reads zero - which is honestly empty rather than quietly wrong.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Let the new period type exist.
--
-- Dropped and re-added rather than altered: a check constraint cannot be
-- widened in place, and naming it explicitly means a third period type later
-- is a one-line change rather than a hunt for whatever Postgres called it.
-- ---------------------------------------------------------------------------
do $$
declare
  v_name text;
begin
  select con.conname into v_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
   where ns.nspname = 'public'
     and rel.relname = 'wager_periods'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ilike '%period_type%';

  if v_name is not null then
    execute format('alter table public.wager_periods drop constraint %I', v_name);
  end if;
end $$;

alter table public.wager_periods
  add constraint wager_periods_period_type_check
  check (period_type in ('all', 'month', 'week', 'day', 'leaderboard'));

comment on column public.wager_periods.period_type is
  'all | month | week | day | leaderboard. A leaderboard row covers the 16th '
  'of period_start''s month through the 15th of the next, asked of Roobet as '
  'one window - never summed from days.';


-- ---------------------------------------------------------------------------
-- 2. The shared window shape learns the new type.
--
-- Identical treatment to day and week: an exact period_start match. Months
-- stay the odd one out, because a month range genuinely spans several rows.
-- ---------------------------------------------------------------------------
create or replace function public.wager_scoped(
  p_type text,
  p_from date,
  p_to   date
)
returns table (uname text, display text, wagered numeric, sources text)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select wp.username, wp.source, wp.period_start, wp.wagered
      from public.wager_periods wp
     where (p_type = 'all'   and wp.period_type = 'all')
        or (p_type = 'week'  and wp.period_type = 'week'  and wp.period_start = p_from)
        or (p_type = 'day'   and wp.period_type = 'day'   and wp.period_start = p_from)
        or (p_type = 'leaderboard' and wp.period_type = 'leaderboard'
            and wp.period_start = p_from)
        or (p_type = 'month' and wp.period_type = 'month'
            and wp.period_start >= p_from
            and wp.period_start <= coalesce(p_to, p_from))
  ),
  per_code as (
    select username, source, period_start, max(wagered) as wagered
      from scoped
     group by username, source, period_start
  ),
  per_slice as (
    -- Across codes, one person reported twice is still one person.
    select lower(btrim(username)) as uname,
           max(username)          as display,
           period_start,
           max(wagered)           as wagered,
           string_agg(distinct source, ', ' order by source) as sources
      from per_code
     group by lower(btrim(username)), period_start
  )
  -- Across months the slices DO add up - they are separate windows.
  select uname,
         max(display),
         sum(wagered),
         string_agg(distinct sources, ', ')
    from per_slice
   group by uname;
$$;

revoke all on function public.wager_scoped(text, date, date) from public;


-- ---------------------------------------------------------------------------
-- 3. Two windows, one scan.
--
-- The Stats table shows this month, the leaderboard cycle and all time in the
-- same row. Calling the single-window function three times would read
-- wager_periods three times for one table, and that table is already the
-- slowest thing on the page.
--
-- max across codes, sum across slices - the same rule as everywhere else. One
-- person on two affiliate codes in the same window is one person; the same
-- person in two different months is two windows that add up.
-- ---------------------------------------------------------------------------
create or replace function public.wager_two_windows(
  p_month_from date,
  p_month_to   date,
  p_cycle      date
)
returns table (
  uname          text,
  display        text,
  month_wagered  numeric,
  cycle_wagered  numeric,
  sources        text
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select wp.username, wp.source, wp.period_type, wp.period_start, wp.wagered
      from public.wager_periods wp
     where (wp.period_type = 'month'
            and wp.period_start >= p_month_from
            and wp.period_start <= coalesce(p_month_to, p_month_from))
        or (wp.period_type = 'leaderboard' and wp.period_start = p_cycle)
  ),
  per_code as (
    select username, source, period_type, period_start, max(wagered) as wagered
      from scoped
     group by username, source, period_type, period_start
  ),
  per_slice as (
    select lower(btrim(username)) as uname,
           max(username)          as display,
           period_type,
           period_start,
           max(wagered)           as wagered,
           string_agg(distinct source, ', ' order by source) as sources
      from per_code
     group by lower(btrim(username)), period_type, period_start
  )
  select uname,
         max(display),
         coalesce(sum(wagered) filter (where period_type = 'month'), 0),
         coalesce(sum(wagered) filter (where period_type = 'leaderboard'), 0),
         string_agg(distinct sources, ', ')
    from per_slice
   group by uname;
$$;

revoke all on function public.wager_two_windows(date, date, date) from public;


-- ---------------------------------------------------------------------------
-- 4. The rows.
-- ---------------------------------------------------------------------------
drop function if exists public.wager_cycle_rows(date, date, date, uuid, integer);

create function public.wager_cycle_rows(
  p_month_from date,
  p_month_to   date,
  p_cycle      date,
  p_owner      uuid default null,
  p_limit      integer default 5000
)
returns table (
  username       text,
  month_wagered  numeric,
  cycle_wagered  numeric,
  sources        text,
  player_id      uuid,
  reference      text,
  handle         text,
  owner_id       uuid,
  owner_name     text,
  status         text,
  all_time       numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with lifetime as (
    select lower(btrim(wp.username)) as uname, max(wp.wagered) as wagered
      from public.wager_periods wp
     where wp.period_type = 'all'
     group by lower(btrim(wp.username))
  )
  select
    t.display,
    t.month_wagered,
    t.cycle_wagered,
    t.sources,
    p.id,
    p.reference,
    p.handle,
    p.owner_id,
    u.name,
    p.status,
    coalesce(l.wagered, 0)
  from public.wager_two_windows(p_month_from, p_month_to, p_cycle) t
  left join public.player_by_roobet p on p.uname = t.uname
  left join public.users u on u.id = p.owner_id
  left join lifetime l on l.uname = t.uname
  /* Either window earns a row. A player who wagered during the cycle but has
     done nothing since the 1st still belongs on a leaderboard table - dropping
     them because the month column is zero is how a total stops matching. */
  where (t.month_wagered > 0 or t.cycle_wagered > 0)
    and (p_owner is null or p.owner_id = p_owner)
  order by t.month_wagered desc, t.cycle_wagered desc
  limit greatest(1, least(coalesce(p_limit, 5000), 100000));
$$;

revoke all on function public.wager_cycle_rows(date, date, date, uuid, integer) from public;
grant execute on function public.wager_cycle_rows(date, date, date, uuid, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- 5. The totals - over everything, not over the page.
--
-- Same reason as wager_report_totals: a headline figure derived from the first
-- 25 rows is a description of the page size, not of the money.
-- ---------------------------------------------------------------------------
drop function if exists public.wager_cycle_totals(date, date, date, uuid);

create function public.wager_cycle_totals(
  p_month_from date,
  p_month_to   date,
  p_cycle      date,
  p_owner      uuid default null
)
returns table (
  month_total     numeric,
  cycle_total     numeric,
  month_wagerers  bigint,
  cycle_wagerers  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(t.month_wagered), 0),
    coalesce(sum(t.cycle_wagered), 0),
    count(*) filter (where t.month_wagered > 0)::bigint,
    count(*) filter (where t.cycle_wagered > 0)::bigint
  from public.wager_two_windows(p_month_from, p_month_to, p_cycle) t
  left join public.player_by_roobet p on p.uname = t.uname
  where (t.month_wagered > 0 or t.cycle_wagered > 0)
    and (p_owner is null or p.owner_id = p_owner);
$$;

revoke all on function public.wager_cycle_totals(date, date, date, uuid) from public;
grant execute on function public.wager_cycle_totals(date, date, date, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 6. Which cycles are held, so the Refresh button knows what to go and get.
-- ---------------------------------------------------------------------------
drop function if exists public.wager_cycles_held(integer);

create function public.wager_cycles_held(p_limit integer default 24)
returns table (cycle_start date, total numeric, wagerers bigint)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select wp.period_start,
           lower(btrim(wp.username)) as uname,
           max(wp.wagered)           as wagered
      from public.wager_periods wp
     where wp.period_type = 'leaderboard'
     group by wp.period_start, lower(btrim(wp.username))
  )
  select period_start, sum(wagered), count(*)::bigint
    from best
   group by period_start
   order by period_start desc
   limit greatest(1, least(coalesce(p_limit, 24), 120));
$$;

revoke all on function public.wager_cycles_held(integer) from public;
grant execute on function public.wager_cycles_held(integer) to authenticated;


notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- 7. Confirm. Zero rows here is expected before the first refresh - it means
--    the functions exist and nothing has fetched a cycle yet.
-- ---------------------------------------------------------------------------
select * from public.wager_cycles_held(12);
