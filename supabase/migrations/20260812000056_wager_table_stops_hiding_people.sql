-- ============================================================================
-- The wager table stops hiding people
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once. Replaces wager_cycle_rows from migration 055.
--
-- WHY
--   Gwen's stat card read "6 first deposits". Her wager table listed three
--   players. Both numbers were right and the page still looked broken.
--
--   The cause was the row filter: a player appeared only if they had money in
--   one of the two windows on screen. Someone who deposited in June, played
--   for a fortnight and went quiet had $0 this month and $0 this cycle, so
--   they vanished - taking their lifetime figure with them. The only way to
--   learn they existed was to notice a mismatch between two sections of the
--   same page and go asking.
--
--   Disappearing is the wrong behaviour for a player who has spent money. A
--   row of zeroes next to $842 all-time says "this one has stopped", which is
--   information; an absent row says nothing at all, and quietly.
--
-- WHAT CHANGES
--   A row now appears if the person has ANY wager history - lifetime, this
--   month, or this cycle. The windows still hold exactly what they held; the
--   difference is which rows survive to be shown.
--
--   Not the whole book. A player with no Roobet username has no wager history
--   to show and would add nothing but a zero, and at 300 players that is a
--   table made mostly of nothing. Finding missing usernames is the Book's job
--   and it already has a filter for it.
--
-- WHAT DOES NOT CHANGE
--   The headline totals. Those sum the windows, and adding rows that hold zero
--   in both windows cannot move them - which is the point: the money figures
--   stay identical and only the visibility changes. wager_cycle_totals is
--   untouched for exactly that reason.
-- ============================================================================

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
    /* display and sources carried too, not just the number. A player who
       appears ONLY here - all their wagering is in the past - still needs a
       name to show and a code to attribute, and the windows cannot supply
       either for someone absent from them. */
    select lower(btrim(wp.username)) as uname,
           max(wp.username)          as display,
           max(wp.wagered)           as wagered,
           string_agg(distinct wp.source, ', ' order by wp.source) as sources
      from public.wager_periods wp
     where wp.period_type = 'all'
     group by lower(btrim(wp.username))
  ),
  windows as (
    select * from public.wager_two_windows(p_month_from, p_month_to, p_cycle)
  ),
  base as (
    /* FULL join, both directions on purpose.

       Left would drop the quiet players, which is the bug. Right would drop
       anyone wagering this month whose all-time row has not been written yet -
       a real state, since 'all' is refreshed by the same sync that can fail on
       one period and stop. Full keeps both and coalesces. */
    select
      coalesce(w.uname,   l.uname)          as uname,
      coalesce(w.display, l.display)        as display,
      coalesce(w.month_wagered, 0)          as month_wagered,
      coalesce(w.cycle_wagered, 0)          as cycle_wagered,
      coalesce(w.sources, l.sources)        as sources,
      coalesce(l.wagered, 0)                as all_time
    from windows w
    full join lifetime l on l.uname = w.uname
  )
  select
    b.display,
    b.month_wagered,
    b.cycle_wagered,
    b.sources,
    p.id,
    p.reference,
    p.handle,
    p.owner_id,
    u.name,
    p.status,
    b.all_time
  from base b
  left join public.player_by_roobet p on p.uname = b.uname
  left join public.users u on u.id = p.owner_id
  /* Any history at all earns a row. Someone whose every figure is zero has
     never wagered a cent and belongs in the Book, not here. */
  where (b.month_wagered > 0 or b.cycle_wagered > 0 or b.all_time > 0)
    and (p_owner is null or p.owner_id = p_owner)
  order by b.month_wagered desc, b.cycle_wagered desc, b.all_time desc
  limit greatest(1, least(coalesce(p_limit, 5000), 100000));
$$;

revoke all on function public.wager_cycle_rows(date, date, date, uuid, integer) from public;
grant execute on function public.wager_cycle_rows(date, date, date, uuid, integer) to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Confirm, on the case that prompted this.
--
-- Change the name. Expect one row per player with history - the quiet ones
-- showing 0 in both windows and their real lifetime figure in the last column.
-- If this returns the same three rows as before, the function did not replace.
-- ---------------------------------------------------------------------------
select
  r.handle,
  r.username,
  r.month_wagered,
  r.cycle_wagered,
  r.all_time
from public.wager_cycle_rows(
       date_trunc('month', (now() at time zone 'utc'))::date,
       date_trunc('month', (now() at time zone 'utc'))::date,
       (case
          when extract(day from (now() at time zone 'utc')) >= 16
            then date_trunc('month', (now() at time zone 'utc'))::date + 15
          else (date_trunc('month', (now() at time zone 'utc')) - interval '1 month')::date + 15
        end)::date,
       (select id from public.users where name ilike 'Gwen' limit 1),
       500
     ) r;
