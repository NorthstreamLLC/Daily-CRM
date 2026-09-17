-- ============================================================================
-- "Active, but not wagered" - on the rep's own stats list
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once. Replaces wager_cycle_rows from migration 056.
--
-- WHY
--   Eight players across four reps are marked as having deposited, and Roobet
--   has never reported any of them. Five of the eight carry a Roobet username
--   that nothing on our codes even resembles.
--
--   Isac's reading, which is the one that matters: a player may tell a rep
--   they are playing to unlock a bonus when they are not, or may have signed
--   up without the rep's code. Either way the rep believes there is money
--   there and there is not, and they keep working the relationship on that
--   belief.
--
--   Until now nothing could tell them. The wager table is built from wager
--   history, so a player with NO history is absent from it - the one player
--   worth flagging was the one player it could not show. An admin running SQL
--   found them eight weeks after the fact.
--
-- WHAT THIS ADDS
--   Players the CRM believes are playing - status Active, or carrying a first
--   deposit date - who have no wager row anywhere, ever. They come back with
--   zeroes and never_wagered = true, so the rep sees the contradiction on
--   their own page the week it happens.
--
-- WHY THOSE TWO CONDITIONS
--   'Active' is the status the WAGER SYNC assigns when it sees somebody
--   playing. So "Active and never wagered" is not a judgement call, it is a
--   contradiction: the only way to reach it is for a person to have set it by
--   hand. A first deposit date means the same thing in the other direction -
--   somebody recorded money arriving.
--
--   Deliberately NOT every player without wager. Most of a book has never
--   wagered and never claimed to; that is just a lead. This is only the people
--   we have written down as playing.
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
  all_time       numeric,
  never_wagered  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with lifetime as (
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
    /* Full join both ways: left would drop the players who have gone quiet,
       right would drop anyone wagering this month whose all-time row has not
       been written yet. Both are real states. */
    select
      coalesce(w.uname,   l.uname)   as uname,
      coalesce(w.display, l.display) as display,
      coalesce(w.month_wagered, 0)   as month_wagered,
      coalesce(w.cycle_wagered, 0)   as cycle_wagered,
      coalesce(w.sources, l.sources) as sources,
      coalesce(l.wagered, 0)         as all_time
    from windows w
    full join lifetime l on l.uname = w.uname
  ),
  seen as (
    select
      b.display                as username,
      b.month_wagered,
      b.cycle_wagered,
      b.sources,
      p.id                     as player_id,
      p.reference,
      p.handle,
      p.owner_id,
      u.name                   as owner_name,
      p.status,
      b.all_time,
      false                    as never_wagered
    from base b
    left join public.player_by_roobet p on p.uname = b.uname
    left join public.users u on u.id = p.owner_id
    where (b.month_wagered > 0 or b.cycle_wagered > 0 or b.all_time > 0)
  ),
  unseen as (
    /* We think they are playing. Roobet has never heard of them. */
    select
      coalesce(nullif(btrim(pl.roobet_username), ''), '(no username)') as username,
      0::numeric  as month_wagered,
      0::numeric  as cycle_wagered,
      null::text  as sources,
      pl.id       as player_id,
      pl.reference,
      pl.handle,
      pl.owner_id,
      us.name     as owner_name,
      pl.status,
      0::numeric  as all_time,
      true        as never_wagered
    from public.players pl
    join public.users us on us.id = pl.owner_id
    where (pl.status = 'Active' or pl.first_deposit_at is not null)
      /* No wager row under their name, in any period, from any source. A
         player with no username at all satisfies this too - nothing to match
         on is the same outcome as nothing matching. */
      and not exists (
        select 1 from public.wager_periods wp
         where coalesce(btrim(pl.roobet_username), '') <> ''
           and lower(btrim(wp.username)) = lower(btrim(pl.roobet_username))
      )
  ),
  everyone as (
    select * from seen
    union all
    select * from unseen
  )
  select
    e.username,
    e.month_wagered,
    e.cycle_wagered,
    e.sources,
    e.player_id,
    e.reference,
    e.handle,
    e.owner_id,
    e.owner_name,
    e.status,
    e.all_time,
    e.never_wagered
  from everyone e
  where (p_owner is null or e.owner_id = p_owner)
  /* Flagged rows first. They hold no money, so sorting by money would bury
     them on the last page - which for a table that now pages is the same as
     not showing them. They are rare by construction; if a rep ever has many,
     that is itself the thing worth seeing at the top. */
  order by e.never_wagered desc,
           e.month_wagered desc,
           e.cycle_wagered desc,
           e.all_time desc
  limit greatest(1, least(coalesce(p_limit, 5000), 100000));
$$;

revoke all on function public.wager_cycle_rows(date, date, date, uuid, integer) from public;
grant execute on function public.wager_cycle_rows(date, date, date, uuid, integer) to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Confirm. One row per flagged player, per rep - should be the eight from
-- supabase/checks/depositors_without_wager.sql plus any Active player who has
-- never wagered.
-- ---------------------------------------------------------------------------
select r.owner_name, r.handle, r.username, r.status, r.never_wagered
  from public.wager_cycle_rows(
         date_trunc('month', (now() at time zone 'utc'))::date,
         date_trunc('month', (now() at time zone 'utc'))::date,
         (case
            when extract(day from (now() at time zone 'utc')) >= 16
              then date_trunc('month', (now() at time zone 'utc'))::date + 15
            else (date_trunc('month', (now() at time zone 'utc')) - interval '1 month')::date + 15
          end)::date,
         null,
         100000
       ) r
 where r.never_wagered
 order by r.owner_name, r.handle;
