-- ============================================================================
-- Remove the VIP transfers that a hardcoded sort_order invented
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Section 1 only reports. Section 2 deletes. Safe to run more than once.
--
-- WHAT HAPPENED
--   Tuna's Stats page showed 157 VIP transfers all time. He has 22 players at
--   that status and the tick box had never been used.
--
--   The first version of migration 044 backfilled a VIP transfer for anyone
--   "at or past VIP Transferred", written as:
--
--       where s.sort_order between 3 and 7
--
--   I took 3 and 7 from the initial schema, where the order was
--   1 Initial Contact, 2 Interested, 3 VIP Transferred ... 7 Reactivation
--   Queue. But migration 004 deleted two stages and renumbered everything:
--
--       1 Initial Contact   2 VIP Transferred   3 First Deposit
--       4 Active            5 Reactivation Queue
--       6 Potential Lead    7 Dead Lead
--
--   So `between 3 and 7` no longer meant "transferred or further along". It
--   meant "First Deposit through DEAD LEAD" - and skipped the one status that
--   actually says VIP Transferred, because that is now 2.
--
--   Which is precisely what the data shows: the events sit on dead leads,
--   Active, First Deposit and Potential Lead, and there is not a single one on
--   a player currently at VIP Transferred.
--
-- THE LESSON, since this is the third version of the same mistake today
--   I read a value out of a schema file and never checked whether a later
--   migration had changed it. Same shape as inferring the funnel path from the
--   funnel order, and as revoking a grant from the roles I assumed mattered.
--   The file said 3. The database said 2. Only one of those is authoritative.
--
--   Hardcoding sort_order at all was the underlying error - a number that
--   exists to be reorderable should never be pasted into a WHERE clause.
--
-- WHAT THIS DELETES
--   Only rows the backfill wrote: event_type 'status_change', to_status
--   'VIP Transferred', and metadata.backfilled true.
--
--   Anything a rep ticked carries metadata.marked_by_rep, and anything from
--   the status dropdown carries neither - both are left alone. This is why
--   every backfilled row was tagged in the first place.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. What is about to go, and what is staying.
-- ---------------------------------------------------------------------------
select
  u.name as rep,
  count(*) filter (where (a.metadata->>'backfilled')::boolean)     as deleting_invented,
  count(*) filter (where (a.metadata->>'marked_by_rep')::boolean)  as keeping_ticked_by_rep,
  count(*) filter (
    where a.metadata is null
       or not (coalesce((a.metadata->>'backfilled')::boolean, false)
            or coalesce((a.metadata->>'marked_by_rep')::boolean, false))
  ) as keeping_from_the_dropdown
from public.activity_log a
join public.users u on u.id = a.user_id
where a.event_type = 'status_change'
  and a.to_status = 'VIP Transferred'
group by u.name
order by deleting_invented desc;


-- ---------------------------------------------------------------------------
-- 2. Delete them.
-- ---------------------------------------------------------------------------
do $$
declare v_gone integer;
begin
  delete from public.activity_log
   where event_type = 'status_change'
     and to_status = 'VIP Transferred'
     and coalesce((metadata->>'backfilled')::boolean, false);

  get diagnostics v_gone = row_count;
  raise notice 'Removed % invented VIP transfer event(s).', v_gone;
end $$;


-- ---------------------------------------------------------------------------
-- 3. Confirm. Every rep should now read 0, until somebody ticks the box.
-- ---------------------------------------------------------------------------
select
  u.name as rep,
  (select count(*) from public.activity_log a
    where a.user_id = u.id and a.player_id is not null
      and a.event_type = 'status_change'
      and a.to_status = 'VIP Transferred')                        as vip_transfers_now,
  (select count(*) from public.players p
    where p.owner_id = u.id and p.vip_transferred_at is not null) as ticked_by_a_rep
from public.users u
order by u.name;


-- ---------------------------------------------------------------------------
-- 4. And check the same mistake is not hiding in the deposit backfill.
--
-- 044's first-deposit section keys off first_deposit_at rather than
-- sort_order, so it should be sound - but "should be" is what produced this
-- file, so it gets counted rather than assumed.
-- ---------------------------------------------------------------------------
select
  u.name as rep,
  count(*) filter (where p.first_deposit_at is not null) as players_with_a_deposit_date,
  (select count(*) from public.activity_log a
    join public.players p2 on p2.id = a.player_id
    where p2.owner_id = u.id
      and a.event_type = 'status_change'
      and a.to_status in ('First Deposit', 'Active'))    as deposit_events
from public.users u
left join public.players p on p.owner_id = u.id
group by u.name, u.id
order by u.name;
