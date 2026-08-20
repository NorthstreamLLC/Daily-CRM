-- ============================================================================
-- Wagered over time - by day, by week, by month
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHY
--   wager_month_history() answers one question: months. The page therefore
--   showed a "Month by month" table with a single row in it, because syncing
--   started this month - which tells you nothing and looks broken.
--
--   The daily and weekly facts have been stored all along; nothing was reading
--   them. This generalises the same query so the page can show whichever grain
--   is useful. Days are the interesting one right now: there are ~75 of them
--   (migration 024 prunes past that) and they show the shape of a week.
--
-- max-not-sum, as everywhere else
--   The same person on two codes is one person wagering, reported twice. Take
--   the largest single code per person per period, then add up across people.
--   Summing the codes would double-count them.
-- ============================================================================

drop function if exists public.wager_period_history(text, integer);

create function public.wager_period_history(
  p_type  text,
  p_limit integer default 60
)
returns table (period_start date, total numeric, wagerers bigint)
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
     where wp.period_type = p_type
       and p_type in ('day', 'week', 'month')   -- never 'all': it is one row
     group by wp.period_start, lower(btrim(wp.username))
  )
  select b.period_start,
         coalesce(sum(b.wagered), 0),
         count(*)::bigint
    from best b
   group by b.period_start
   order by b.period_start desc
   limit greatest(1, least(coalesce(p_limit, 60), 400));
$$;

revoke all on function public.wager_period_history(text, integer) from public;
grant execute on function public.wager_period_history(text, integer) to authenticated;
