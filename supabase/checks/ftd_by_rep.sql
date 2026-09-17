-- ============================================================================
-- Every rep's deposit numbers, reconciled. ONE statement - paste and run.
--
-- HOW TO READ IT
--
--   deposit_events        what the stat card counted before the fix: rows in
--                         activity_log with to_status 'First Deposit' or
--                         'Active'.
--   distinct_depositors   what it counts after the fix: people.
--   inflated_by           the difference. A depositing player often produces
--                         two rows - the rep marks them First Deposit, then
--                         the wager sync sees them playing and marks them
--                         Active. Both counted. This is how much that rep's
--                         card was overstating by.
--
--   wagering_all_time     players of theirs with any wager history at all -
--                         the row count of their Stats wager table.
--   depositors_not_wagering
--                         THE ONE TO ACT ON. People marked as having
--                         deposited whose Roobet username has never been
--                         reported by Roobet, or who have no username at all.
--                         Money that arrived with nothing to attribute it to,
--                         and invisible on every wager table.
--
-- Sorted worst-first on that last column.
-- ============================================================================

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
    ) as distinct_depositors
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
  u.name                                 as rep,
  coalesce(b.players, 0)                 as players,
  coalesce(e.deposit_events, 0)          as deposit_events,
  coalesce(e.distinct_depositors, 0)     as distinct_depositors,
  coalesce(e.deposit_events, 0)
    - coalesce(e.distinct_depositors, 0) as inflated_by,
  coalesce(b.has_ftd_date, 0)            as has_ftd_date,
  coalesce(b.wagering_all_time, 0)       as wagering_all_time,
  coalesce(b.depositors_not_wagering, 0) as depositors_not_wagering
from public.users u
left join events e on e.user_id = u.id
left join book   b on b.owner_id = u.id
where u.active
order by coalesce(b.depositors_not_wagering, 0) desc,
         coalesce(e.deposit_events, 0) - coalesce(e.distinct_depositors, 0) desc,
         u.name;
