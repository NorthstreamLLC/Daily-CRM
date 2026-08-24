-- ============================================================================
-- Where are the VIP transfer events coming from?
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste > Run. Reads only.
--
-- NOTE ON THE PREVIOUS VERSION OF THIS FILE
--   Query 2 joined players AND activity_log to users independently, which
--   multiplies one by the other - Moneyheist's "56,628 events" was
--   players x events, not events. Every count here is now taken in its own
--   subquery so nothing can multiply anything else.
--
--   Worth remembering generally: two one-to-many joins from the same table in
--   one query is almost always a cartesian product wearing a disguise.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. THE IMPORTANT ONE. Who wrote these rows?
--
--   metadata.backfilled      migration 044, run before the VIP section was
--                            removed from it
--   metadata.marked_by_rep   the new tick box
--   metadata.via = bulk      bulk add
--   nothing                  changeStatus - the status dropdown in the app
-- ---------------------------------------------------------------------------
select
  u.name as rep,
  case
    when (a.metadata->>'backfilled')::boolean    then 'backfill (migration 044)'
    when (a.metadata->>'marked_by_rep')::boolean then 'the tick box'
    when a.metadata ? 'via'                      then 'bulk add'
    else 'changeStatus - the status dropdown'
  end    as written_by,
  count(*)                 as events,
  count(distinct a.player_id) as distinct_players,
  min(a.occurred_at)::date as earliest,
  max(a.occurred_at)::date as latest
from public.activity_log a
join public.users u on u.id = a.user_id
where a.player_id is not null
  and a.event_type = 'status_change'
  and a.to_status = 'VIP Transferred'
group by u.name, 2
order by events desc;


-- ---------------------------------------------------------------------------
-- 2. Players at that status vs events claiming it. Subqueries, so no
--    multiplication.
-- ---------------------------------------------------------------------------
select
  u.name as rep,
  (select count(*) from public.players p
    where p.owner_id = u.id and p.status = 'VIP Transferred')      as players_at_that_status,
  (select count(*) from public.players p
    where p.owner_id = u.id and p.vip_transferred_at is not null)  as ticked_by_a_rep,
  (select count(*) from public.activity_log a
    where a.user_id = u.id and a.player_id is not null
      and a.event_type = 'status_change'
      and a.to_status = 'VIP Transferred')                         as events_the_stats_count,
  (select count(distinct a.player_id) from public.activity_log a
    where a.user_id = u.id and a.player_id is not null
      and a.event_type = 'status_change'
      and a.to_status = 'VIP Transferred')                         as distinct_players_in_those_events
from public.users u
order by u.name;


-- ---------------------------------------------------------------------------
-- 3. More than one VIP event on the same player. A player can only be
--    transferred once, so anything above 1 here is double counting.
-- ---------------------------------------------------------------------------
select
  u.name as rep,
  p.reference,
  p.handle,
  p.status,
  count(*) as vip_events,
  min(a.occurred_at)::date as first_one,
  max(a.occurred_at)::date as last_one
from public.activity_log a
join public.players p on p.id = a.player_id
join public.users u on u.id = a.user_id
where a.event_type = 'status_change'
  and a.to_status = 'VIP Transferred'
group by u.name, p.reference, p.handle, p.status
having count(*) > 1
order by count(*) desc
limit 50;


-- ---------------------------------------------------------------------------
-- 4. Events on players who are NOT at that status now. Expected and fine -
--    somebody transferred and then deposited still had a transfer - but if
--    this is most of the number, that is the explanation.
-- ---------------------------------------------------------------------------
select
  u.name as rep,
  p.status as where_they_are_now,
  count(*) as vip_events
from public.activity_log a
join public.players p on p.id = a.player_id
join public.users u on u.id = a.user_id
where a.event_type = 'status_change'
  and a.to_status = 'VIP Transferred'
group by u.name, p.status
order by u.name, count(*) desc;
