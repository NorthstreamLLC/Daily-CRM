-- ============================================================================
-- Where are Tuna's 157 VIP transfers coming from?
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste > Run. Reads only.
--
-- WHY ASK RATHER THAN ASSUME
--   The Stats card counts activity_log rows with event_type 'status_change'
--   and to_status 'VIP Transferred'. Tuna has 26 players sitting at that
--   status, and the tick box has not been used yet, so 157 is not a number any
--   rule I wrote produces. Something else is writing those rows.
--
--   Three plausible sources, and this tells them apart instead of me picking
--   one:
--
--     metadata.backfilled      a version of migration 044 that was run before
--                              the VIP section was removed from it
--     metadata.marked_by_rep   the new tick box
--     no metadata              changeStatus - somebody moving the dropdown to
--                              VIP Transferred in the app, including every
--                              time a status was corrected
-- ============================================================================

-- 1. What is actually in the log, split by where it came from.
select
  u.name                                   as rep,
  a.event_type,
  a.to_status,
  case
    when (a.metadata->>'backfilled')::boolean   then 'backfill (migration 044)'
    when (a.metadata->>'marked_by_rep')::boolean then 'the tick box'
    when a.metadata ? 'via'                      then 'bulk add'
    else 'changeStatus - the status dropdown'
  end                                      as written_by,
  count(*)                                 as rows,
  min(a.occurred_at)::date                 as earliest,
  max(a.occurred_at)::date                 as latest
from public.activity_log a
join public.users u on u.id = a.user_id
where a.player_id is not null
  and a.to_status = 'VIP Transferred'
group by u.name, a.event_type, a.to_status, 4
order by rows desc;


-- 2. Does the count match reality? Players at that status vs events claiming it.
select
  u.name as rep,
  count(distinct p.id) filter (where p.status = 'VIP Transferred')  as players_at_that_status,
  count(distinct p.id) filter (where p.vip_transferred_at is not null) as ticked_by_a_rep,
  count(a.id) filter (
    where a.event_type = 'status_change' and a.to_status = 'VIP Transferred'
  ) as events_the_stats_count
from public.users u
left join public.players p on p.owner_id = u.id
left join public.activity_log a on a.user_id = u.id and a.player_id is not null
group by u.name
order by u.name;


-- 3. If the answer is "more than one event per player", this shows the
--    duplicates. A player can only be transferred once.
select
  u.name as rep,
  p.reference,
  p.handle,
  p.status,
  count(*) as vip_events
from public.activity_log a
join public.players p on p.id = a.player_id
join public.users u on u.id = a.user_id
where a.event_type = 'status_change'
  and a.to_status = 'VIP Transferred'
group by u.name, p.reference, p.handle, p.status
having count(*) > 1
order by count(*) desc
limit 50;
