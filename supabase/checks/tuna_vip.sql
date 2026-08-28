-- ============================================================================
-- Two questions, no date window this time.
-- ============================================================================

-- 1. TUNA. Every player of his at VIP Transferred, with every event they have.
--    No 3-day limit - the last version had one and Tuna simply fell outside it,
--    which told me nothing and looked like it told me something.
select
  p.reference,
  p.handle,
  p.status,
  p.vip_transferred_at                       as tick_box,
  p.assigned_at::date                        as added,
  p.last_contact_at                          as last_contact,
  (select count(*) from public.activity_log a
    where a.player_id = p.id
      and a.event_type = 'status_change'
      and a.to_status = 'VIP Transferred')   as vip_events,
  (select max(a.occurred_at) from public.activity_log a
    where a.player_id = p.id
      and a.event_type = 'status_change'
      and a.to_status = 'VIP Transferred')   as newest_event
from public.players p
join public.users u on u.id = p.owner_id
where u.name = 'Tuna'
  and (p.status = 'VIP Transferred' or p.vip_transferred_at is not null)
order by p.reference;


-- 2. DOUBLE COUNTING. A player can only be transferred once, so anything
--    above 1 is somebody's stats reading high.
select
  u.name as rep,
  p.reference,
  p.handle,
  p.status,
  count(*) as vip_events,
  array_agg(a.occurred_at order by a.occurred_at) as when_each,
  array_agg(coalesce(a.metadata->>'marked_by_rep', 'dropdown') order by a.occurred_at) as source_each
from public.activity_log a
join public.players p on p.id = a.player_id
join public.users u on u.id = a.user_id
where a.event_type = 'status_change'
  and a.to_status = 'VIP Transferred'
group by u.name, p.reference, p.handle, p.status
having count(*) > 1
order by count(*) desc, u.name;


-- 3. What each rep's VIP transfer count currently reads, and what it would
--    read if duplicates were collapsed to one per player.
select
  u.name as rep,
  count(*)                          as counted_now,
  count(distinct a.player_id)       as should_be,
  count(*) - count(distinct a.player_id) as inflated_by
from public.activity_log a
join public.users u on u.id = a.user_id
where a.event_type = 'status_change'
  and a.to_status = 'VIP Transferred'
  and a.player_id is not null
group by u.name
order by inflated_by desc, u.name;
