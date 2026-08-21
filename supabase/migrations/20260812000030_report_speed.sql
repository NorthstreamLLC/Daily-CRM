-- ============================================================================
-- Make the wager report fast again
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once. Replaces the versions from 019 and 029.
--
-- WHAT WENT WRONG
--   Two things, both mine, both added in the last hour:
--
--   1. LATERAL JOIN PER USERNAME.
--      Both report functions matched wagerers to players like this:
--
--        left join lateral (
--          select ... from players
--           where lower(btrim(roobet_username)) = t.uname
--           order by updated_at desc limit 1
--        ) on true
--
--      That is a nested loop: one index lookup and one sort for every
--      username in the result. At 841 wagerers it is 841 round trips inside
--      the query, and it gets worse every week as the list grows.
--
--      Replaced with a single DISTINCT ON over players, joined once. Postgres
--      hashes it and matches everything in one pass. Same answer - still the
--      most recently updated player per Roobet username - computed once
--      instead of per row.
--
--   2. THE SAME WORK TWICE.
--      wager_report_totals repeated wager_report_rows' entire CTE chain to
--      produce four numbers, so every page load ran the aggregation twice.
--      They still have to be separate calls (the rows are paged, the totals
--      are not), but they now share the cheap shape rather than the expensive
--      one.
--
--   Adding the correct totals was right. Making the page slower to get them
--   was not, and "it is only four more queries" is exactly how a page ends up
--   taking three seconds.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- One row per Roobet username: the player who currently owns that name.
--
-- A view so both functions share it and it cannot drift between them.
-- ---------------------------------------------------------------------------
create or replace view public.player_by_roobet
with (security_invoker = false) as
  select distinct on (lower(btrim(pl.roobet_username)))
         lower(btrim(pl.roobet_username)) as uname,
         pl.id,
         pl.reference,
         pl.handle,
         pl.owner_id,
         pl.status
    from public.players pl
   where pl.roobet_username is not null
     and btrim(pl.roobet_username) <> ''
   order by lower(btrim(pl.roobet_username)), pl.updated_at desc nulls last;

comment on view public.player_by_roobet is
  'One player per Roobet username, most recently updated wins. Read by the '
  'wager report functions, which are security definer - this view is '
  'deliberately NOT security_invoker so they see every book, as they must to '
  'report company-wide totals.';

revoke all on public.player_by_roobet from public;
revoke all on public.player_by_roobet from authenticated;


-- ---------------------------------------------------------------------------
-- Shared shape: wager per person for the chosen window.
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
-- The rows.
-- ---------------------------------------------------------------------------
drop function if exists public.wager_report_rows(text, date, date, uuid, integer);

create function public.wager_report_rows(
  p_type   text,
  p_from   date,
  p_to     date default null,
  p_owner  uuid default null,
  p_limit  integer default 5000
)
returns table (
  username    text,
  wagered     numeric,
  sources     text,
  player_id   uuid,
  reference   text,
  handle      text,
  owner_id    uuid,
  owner_name  text,
  status      text,
  all_time    numeric
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
    t.wagered,
    t.sources,
    p.id,
    p.reference,
    p.handle,
    p.owner_id,
    u.name,
    p.status,
    coalesce(l.wagered, 0)
  from public.wager_scoped(p_type, p_from, p_to) t
  left join public.player_by_roobet p on p.uname = t.uname
  left join public.users u on u.id = p.owner_id
  left join lifetime l on l.uname = t.uname
  where t.wagered > 0
    and (p_owner is null or p.owner_id = p_owner)
  order by t.wagered desc
  limit greatest(1, least(coalesce(p_limit, 5000), 100000));
$$;

revoke all on function public.wager_report_rows(text, date, date, uuid, integer) from public;
grant execute on function public.wager_report_rows(text, date, date, uuid, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- The totals, over everything, whatever the page is showing.
-- ---------------------------------------------------------------------------
drop function if exists public.wager_report_totals(text, date, date, uuid);

create function public.wager_report_totals(
  p_type   text,
  p_from   date,
  p_to     date default null,
  p_owner  uuid default null
)
returns table (total numeric, claimed numeric, unclaimed numeric, wagerers bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(t.wagered), 0),
    coalesce(sum(t.wagered) filter (where p.owner_id is not null), 0),
    coalesce(sum(t.wagered) filter (where p.owner_id is null), 0),
    count(*)::bigint
  from public.wager_scoped(p_type, p_from, p_to) t
  left join public.player_by_roobet p on p.uname = t.uname
  where t.wagered > 0
    and (p_owner is null or p.owner_id = p_owner);
$$;

revoke all on function public.wager_report_totals(text, date, date, uuid) from public;
grant execute on function public.wager_report_totals(text, date, date, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- All three grains in one call, instead of three.
--
-- getWagerPeriods was making three separate round trips for the day, week and
-- month series, each one scanning wager_periods. One call, one scan.
-- ---------------------------------------------------------------------------
drop function if exists public.wager_all_history(integer, integer, integer);

create function public.wager_all_history(
  p_days   integer default 60,
  p_weeks  integer default 26,
  p_months integer default 24
)
returns table (grain text, period_start date, total numeric, wagerers bigint)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select wp.period_type,
           wp.period_start,
           lower(btrim(wp.username)) as uname,
           max(wp.wagered)           as wagered
      from public.wager_periods wp
     where wp.period_type in ('day', 'week', 'month')
     group by wp.period_type, wp.period_start, lower(btrim(wp.username))
  ),
  totals as (
    select period_type as grain,
           period_start,
           sum(wagered) as total,
           count(*)::bigint as wagerers,
           row_number() over (
             partition by period_type order by period_start desc
           ) as recency
      from best
     group by period_type, period_start
  )
  select grain, period_start, total, wagerers
    from totals
   where (grain = 'day'   and recency <= greatest(1, least(p_days,   400)))
      or (grain = 'week'  and recency <= greatest(1, least(p_weeks,  400)))
      or (grain = 'month' and recency <= greatest(1, least(p_months, 400)))
   order by grain, period_start;
$$;

revoke all on function public.wager_all_history(integer, integer, integer) from public;
grant execute on function public.wager_all_history(integer, integer, integer) to authenticated;
