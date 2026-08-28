-- Did Tuna's three VIP transfers get recorded, and by which route?
--
-- There are two ways to say "VIP transfer" right now - the status dropdown and
-- the tick box - and they do not write the same things. This shows which was
-- used and what landed.

-- 1. Every VIP-transfer event in the last 3 days, and where it came from.
select
  u.name                                   as rep,
  p.reference,
  p.handle,
  p.status                                 as status_now,
  p.vip_transferred_at                     as tick_box,
  a.occurred_at,
  case
    when (a.metadata->>'marked_by_rep')::boolean then 'the tick box'
    when a.metadata ? 'via'                      then 'bulk add'
    when a.metadata is null or a.metadata = '{}'::jsonb then 'the status dropdown'
    else a.metadata::text
  end                                      as written_by
from public.activity_log a
join public.players p on p.id = a.player_id
join public.users u on u.id = a.user_id
where a.event_type = 'status_change'
  and a.to_status = 'VIP Transferred'
  and a.occurred_at > now() - interval '3 days'
order by a.occurred_at desc;


-- 2. Players sitting at VIP Transferred whose tick box is EMPTY.
--    These are the ones the status dropdown moved without setting the flag -
--    the status says one thing, the checkbox says another.
select
  u.name as rep,
  p.reference,
  p.handle,
  p.status,
  p.vip_transferred_at,
  exists (
    select 1 from public.activity_log a
     where a.player_id = p.id
       and a.event_type = 'status_change'
       and a.to_status = 'VIP Transferred'
  ) as has_the_event
from public.players p
join public.users u on u.id = p.owner_id
where p.status = 'VIP Transferred'
  and p.vip_transferred_at is null
order by u.name, p.reference;
