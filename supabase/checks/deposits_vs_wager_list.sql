-- ============================================================================
-- "6 first deposits, 3 on the wager list" - where are the other three?
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Read only - nothing here writes.
--
--   To check a different rep, replace 'Gwen' in the THREE places it appears
--   (queries 1, 2 and 3). Deliberately written out rather than set once at the
--   top: the Supabase editor is not psql, so \set and :variables silently fail
--   there, and a check that fails to run is worse than a repeated word.
--
-- WHAT THE TWO NUMBERS ACTUALLY COUNT
--   They come from different places and they are not meant to match.
--
--   FIRST DEPOSITS (the stat card)
--     activity_log rows where to_status is 'First Deposit' or 'Active', for
--     that rep, ever. A count of EVENTS - things that happened.
--
--   THE WAGER LIST
--     Players with money in one of two windows: this calendar month, or the
--     current leaderboard cycle. A count of ACTIVITY NOW.
--
--   So a player who deposited in June, played for a fortnight and stopped is a
--   first deposit and is correctly absent from the list. Six deposits with
--   three currently wagering is a normal sentence, not a bug.
--
--   But there are two ways it CAN be a bug, and only the data says which
--   applies. Query 1 tells them apart per player.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. THE ANSWER. Every one of this rep's depositors, and why each is or is
--    not on the wager list.
--
--    Read the `verdict` column:
--
--      no roobet username     nothing can ever match them. A deposit on paper
--                             with no link to the leaderboard - usually an
--                             import that carried an FTD date but no username.
--                             THIS IS A REAL PROBLEM: their wager is invisible
--                             and so is their commission.
--      username never seen    the name is filled in but Roobet has never
--                             reported it. A typo, or the Discord handle typed
--                             into the Roobet field. ALSO A REAL PROBLEM.
--      quiet in both windows   matched, has history, simply has not wagered
--                             this month or this cycle. Working as intended -
--                             and a retargeting candidate.
--      on the list            appears in the table.
-- ---------------------------------------------------------------------------
with rep as (
  select id, name from public.users where name ilike 'Gwen' limit 1
),
bounds as (
  select
    date_trunc('month', (now() at time zone 'utc'))::date as month_start,
    case
      when extract(day from (now() at time zone 'utc')) >= 16
        then date_trunc('month', (now() at time zone 'utc'))::date + 15
      else (date_trunc('month', (now() at time zone 'utc')) - interval '1 month')::date + 15
    end as cycle_start
)
select
  p.reference,
  p.handle,
  coalesce(nullif(btrim(p.roobet_username), ''), '-- none --') as roobet_username,
  p.status,
  p.first_deposit_at::date as deposited,

  /* max, not sum - one person reported on two affiliate codes is still one
     person. The same rule the report functions use. */
  coalesce((
    select max(wp.wagered) from public.wager_periods wp
     where wp.period_type = 'all'
       and lower(btrim(wp.username)) = lower(btrim(p.roobet_username))
  ), 0)::numeric(14,2) as all_time,

  coalesce((
    select max(wp.wagered) from public.wager_periods wp, bounds b
     where wp.period_type = 'month'
       and wp.period_start = b.month_start
       and lower(btrim(wp.username)) = lower(btrim(p.roobet_username))
  ), 0)::numeric(14,2) as this_month,

  coalesce((
    select max(wp.wagered) from public.wager_periods wp, bounds b
     where wp.period_type = 'leaderboard'
       and wp.period_start = b.cycle_start
       and lower(btrim(wp.username)) = lower(btrim(p.roobet_username))
  ), 0)::numeric(14,2) as this_cycle,

  case
    when coalesce(btrim(p.roobet_username), '') = '' then 'no roobet username'
    when not exists (
      select 1 from public.wager_periods wp
       where lower(btrim(wp.username)) = lower(btrim(p.roobet_username))
    ) then 'username never seen'
    when coalesce((
      select max(wp.wagered) from public.wager_periods wp, bounds b
       where lower(btrim(wp.username)) = lower(btrim(p.roobet_username))
         and ((wp.period_type = 'month' and wp.period_start = b.month_start)
           or (wp.period_type = 'leaderboard' and wp.period_start = b.cycle_start))
    ), 0) > 0 then 'on the list'
    else 'quiet in both windows'
  end as verdict

from public.players p
join rep r on r.id = p.owner_id
where p.first_deposit_at is not null
   or exists (
     select 1 from public.activity_log a
      where a.player_id = p.id
        and a.event_type = 'status_change'
        and a.to_status in ('First Deposit', 'Active')
   )
order by p.first_deposit_at nulls last;


-- ---------------------------------------------------------------------------
-- 2. The deposit events themselves, and whether each was observed or
--    reconstructed.
--
--    backfilled = true means migration 044 wrote it from the spreadsheet's FTD
--    column rather than anybody logging it here. A backfilled deposit with no
--    Roobet username is the commonest reason a depositor cannot appear on a
--    wager list: the sheet knew they deposited and never knew their Roobet name.
--
--    by_wager_sync = true is the opposite case - the sync saw them wagering and
--    promoted them to Active, which means the username definitely matches.
--
--    If this returns MORE rows than the card says, there are duplicate events
--    (a player counted twice). Migration 053 added a unique index to stop that
--    for new rows; anything older is visible here.
-- ---------------------------------------------------------------------------
select
  a.occurred_at::date                          as logged,
  a.to_status,
  coalesce(a.metadata->>'backfilled', 'false') as backfilled,
  coalesce(a.metadata->>'automatic', 'false')  as by_wager_sync,
  p.reference,
  p.handle,
  coalesce(nullif(btrim(p.roobet_username), ''), '-- none --') as roobet_username
from public.activity_log a
join public.users u on u.id = a.user_id
left join public.players p on p.id = a.player_id
where u.name ilike 'Gwen'
  and a.event_type = 'status_change'
  and a.to_status in ('First Deposit', 'Active')
order by a.occurred_at;


-- ---------------------------------------------------------------------------
-- 3. The reconciliation, in one row.
--
--    deposit_events is the stat card. The rest is what stands between it and
--    the wager list. If no_username and username_never_seen are both zero, the
--    difference is purely "they are not playing right now" and there is
--    nothing to fix.
-- ---------------------------------------------------------------------------
with rep as (
  select id from public.users where name ilike 'Gwen' limit 1
),
events as (
  select count(*) as deposit_events
    from public.activity_log a, rep r
   where a.user_id = r.id
     and a.event_type = 'status_change'
     and a.to_status in ('First Deposit', 'Active')
),
people as (
  select
    count(*) as depositors,
    count(*) filter (where coalesce(btrim(p.roobet_username), '') = '')
      as no_username,
    count(*) filter (
      where coalesce(btrim(p.roobet_username), '') <> ''
        and not exists (
          select 1 from public.wager_periods wp
           where lower(btrim(wp.username)) = lower(btrim(p.roobet_username))
        )
    ) as username_never_seen
  from public.players p, rep r
  where p.owner_id = r.id
    and p.first_deposit_at is not null
)
select
  e.deposit_events,
  pe.depositors,
  pe.no_username,
  pe.username_never_seen,
  e.deposit_events - pe.depositors as events_without_a_deposit_date
from events e, people pe;
