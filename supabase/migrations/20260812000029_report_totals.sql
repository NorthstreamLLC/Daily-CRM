-- ============================================================================
-- Report totals that do not depend on how many rows you asked for
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once. Needs 019.
--
-- WHY
--   getWagerReport computed its four summary figures by adding up the rows it
--   had just fetched:
--
--     total        = sum of the returned rows
--     claimed      = sum of the returned rows with an owner
--     unclaimed    = sum of the returned rows without one
--     wagererCount = rows.length
--
--   The fetch was capped at 500. So with 841 people wagering, the page
--   reported "500 wagerers", and the totals were the top 500 only - while the
--   headline cards at the top of the same page, which come from a real
--   aggregate, said something different. $84,054,278 above, $83,988,022
--   below, on one screen.
--
--   Raising the cap moves the lie rather than removing it. A total must be
--   computed over everything, in the database, regardless of how many rows
--   the table happens to be showing.
--
--   Same max-not-sum rules as wager_report_rows, so the two always agree:
--   largest single code per person per period slice, summed across months.
-- ============================================================================

drop function if exists public.wager_report_totals(text, date, date, uuid);

create function public.wager_report_totals(
  p_type   text,
  p_from   date,
  p_to     date default null,
  p_owner  uuid default null
)
returns table (
  total       numeric,
  claimed     numeric,
  unclaimed   numeric,
  wagerers    bigint
)
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
           period_start,
           max(wagered) as wagered
      from per_code
     group by lower(btrim(username)), period_start
  ),
  totalled as (
    -- Across months the slices DO add up - separate windows.
    select uname, sum(wagered) as wagered
      from per_slice
     group by uname
  ),
  owned as (
    select t.uname,
           t.wagered,
           p.owner_id
      from totalled t
      left join lateral (
        select pl.owner_id
          from public.players pl
         where lower(btrim(pl.roobet_username)) = t.uname
         order by pl.updated_at desc nulls last
         limit 1
      ) p on true
     where t.wagered > 0
       -- A rep filter means "this rep's players". Unowned rows are not theirs.
       and (p_owner is null or p.owner_id = p_owner)
  )
  select
    coalesce(sum(wagered), 0),
    coalesce(sum(wagered) filter (where owner_id is not null), 0),
    coalesce(sum(wagered) filter (where owner_id is null), 0),
    count(*)::bigint
  from owned;
$$;

revoke all on function public.wager_report_totals(text, date, date, uuid) from public;
grant execute on function public.wager_report_totals(text, date, date, uuid) to authenticated;
