-- What each status's follow-up cadence actually is, right now.
--
-- Read from the table rather than quoted from a migration file: sort_order was
-- renumbered by migration 004 after being written in 001, and reading the
-- stale file is what invented 157 VIP transfers. followup_days is editable in
-- Admin > Settings, so the file was never authoritative for it either.
select
  sort_order,
  name                as status,
  followup_days       as comes_back_after_days,
  next_action,
  is_dead             as out_of_the_daily_queue
from public.statuses
order by sort_order;

-- And how many people with no Roobet username sit at each status, per rep -
-- i.e. how big a "chase the usernames" session actually is.
select
  u.name as rep,
  p.status,
  count(*) as no_username
from public.players p
join public.users u on u.id = p.owner_id
where p.roobet_username is null or btrim(p.roobet_username) = ''
group by u.name, p.status
order by u.name, count(*) desc;
