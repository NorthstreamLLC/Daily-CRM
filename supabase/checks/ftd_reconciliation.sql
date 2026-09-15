-- ============================================================================
-- 43 first deposits, 46 players, 42 wagering. Which of those is wrong?
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Read only. Query 2 names one rep - change it there.
--
-- THE THREE NUMBERS AND WHERE EACH COMES FROM
--
--   FIRST DEPOSITS (the stat card)
--     activity_log rows with to_status 'First Deposit' or 'Active'.
--     Until now this counted EVENTS. A depositing player normally produces two
--     of them - the rep marks them First Deposit, then the wager sync sees them
--     playing and marks them Active - so that player was counted twice.
--     Migration 053's unique index does not prevent it: it allows one row per
--     (player, to_status), and those are two different statuses.
--
--   TOTAL PLAYERS
--     rows in players for that owner. A real count of people.
--
--   WAGERING ALL TIME (rows in the Stats wager table)
--     players whose Roobet username appears in wager_periods. Needs a username
--     filled in AND Roobet to have reported it.
--
--   So the three are allowed to differ, and the interesting question is
--   whether they differ by the amount the honest explanations account for.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. EVERY REP, side by side. This is the reconciliation.
--
--    Read `inflated_by`: deposit EVENTS minus distinct DEPOSITORS. Anything
--    above zero is the double-count above, and it is exactly the number the
--    stat card was overstating by. If Plat shows 43 events and, say, 38
--    depositors, the card said 43 and the truth was 38.
--
--    Then `depositors_not_wagering`: people marked as having deposited whose
--    username Roobet has never reported. Those are worth chasing - either the
--    username is wrong or the deposit never really happened.
-- ---------------------------------------------------------------------------
with events as (
  select
    a.user_id,
    count(*) filter (
      where a.event_type = 'status_change'
        and a.to_status in ('First Deposit', 'Active')
    ) as deposit_events,
    count(distinct a.player_id) filter (
      where a.event_type = 'status_change'
        and a.to_status in ('First Deposit', 'Active')
    ) as distinct_depositors,
    count(distinct a.player_id) filter (
      where a.event_type = 'status_change'
        and a.to_status = 'VIP Transferred'
    ) as distinct_vip
  from public.activity_log a
  where a.player_id is not null
  group by a.user_id
),
book as (
  select
    p.owner_id,
    count(*) as players,
    count(*) filter (where p.first_deposit_at is not null) as has_ftd_date,
    count(*) filter (
      where coalesce(btrim(p.roobet_username), '') <> ''
        and exists (
          select 1 from public.wager_periods wp
           where wp.period_type = 'all'
             and wp.wagered > 0
             and lower(btrim(wp.username)) = lower(btrim(p.roobet_username))
        )
    ) as wagering_all_time,
    count(*) filter (
      where p.first_deposit_at is not null
        and (
          coalesce(btrim(p.roobet_username), '') = ''
          or not exists (
            select 1 from public.wager_periods wp
             where wp.period_type = 'all'
               and lower(btrim(wp.username)) = lower(btrim(p.roobet_username))
          )
        )
    ) as depositors_not_wagering
  from public.players p
  group by p.owner_id
)
select
  u.name                                   as rep,
  coalesce(b.players, 0)                   as players,
  coalesce(e.deposit_events, 0)            as deposit_events,
  coalesce(e.distinct_depositors, 0)       as distinct_depositors,
  coalesce(e.deposit_events, 0)
    - coalesce(e.distinct_depositors, 0)   as inflated_by,
  coalesce(b.has_ftd_date, 0)              as has_ftd_date,
  coalesce(b.wagering_all_time, 0)         as wagering_all_time,
  coalesce(b.depositors_not_wagering, 0)   as depositors_not_wagering
from public.users u
left join events e on e.user_id = u.id
left join book   b on b.owner_id = u.id
where u.active
order by coalesce(e.deposit_events, 0) - coalesce(e.distinct_depositors, 0) desc,
         u.name;


-- ---------------------------------------------------------------------------
-- 2. THE PLAYERS BEHIND THE INFLATION, for one rep.
--
--    Every player carrying more than one deposit-ish event. `statuses` shows
--    which ones - almost always 'Active, First Deposit', which is the normal
--    path and not a data error. The count was the error, not the history.
--
--    Change the name on the next line.
-- ---------------------------------------------------------------------------
select
  p.reference,
  p.handle,
  coalesce(nullif(btrim(p.roobet_username), ''), '-- none --') as roobet_username,
  p.status                                        as current_status,
  count(*)                                        as deposit_events,
  string_agg(distinct a.to_status, ', ' order by a.to_status) as statuses,
  min(a.occurred_at)::date                        as first_logged,
  max(a.occurred_at)::date                        as last_logged
from public.activity_log a
join public.players p on p.id = a.player_id
join public.users u   on u.id = a.user_id
where u.name ilike 'Plat'
  and a.event_type = 'status_change'
  and a.to_status in ('First Deposit', 'Active')
group by p.reference, p.handle, p.roobet_username, p.status
having count(*) > 1
order by count(*) desc, p.reference;


-- ---------------------------------------------------------------------------
-- 3. Company totals, before and after. What the change to the cards is worth.
--
--    If `events` and `people` are equal, nothing on any Stats page moves and
--    the fix was a no-op - worth knowing either way, since a fix that changes
--    nothing means the explanation is somewhere else.
-- ---------------------------------------------------------------------------
select
  count(*)                       as events,
  count(distinct a.player_id)    as people,
  count(*) - count(distinct a.player_id) as overstated_by
from public.activity_log a
where a.player_id is not null
  and a.event_type = 'status_change'
  and a.to_status in ('First Deposit', 'Active');
