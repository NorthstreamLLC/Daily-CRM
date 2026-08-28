-- ============================================================================
-- Tick the box for players whose status already says VIP Transferred
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Section 1 only reports. Section 2 writes. Safe to run more than once.
--
-- WHY THIS IS DIFFERENT FROM THE BACKFILL WE THREW AWAY
--   Migration 044's first attempt credited a VIP transfer to anyone "at or
--   past" that stage in the funnel order, which swept in Dead Leads and every
--   player the wager sync had moved to Active on its own. Isac stopped it and
--   it was deleted in 048. Rightly.
--
--   This is the narrow version of that: ONLY players whose status literally
--   reads 'VIP Transferred'. Not Active, not First Deposit, not anything
--   inferred. A rep typed those words into their sheet about that player, and
--   the import carried them across.
--
-- WHY IT IS NEEDED NOW
--   We decided reps would tick their own, from today. In practice that leaves
--   ~65 players sitting at VIP Transferred across seven books with an empty
--   box and a stat of zero - and a rep who changes the status to the one it is
--   already on gets "No change." and no event, which is exactly what Tuna hit
--   and reported as a bug.
--
--   Tuna has 24 of them, Plat 20, Seb 6, Chella 5. That is not a tidy-up
--   somebody does between calls; it is an afternoon, thirteen times over, to
--   re-enter a fact the spreadsheet already recorded.
--
-- WHAT IT DOES NOT DO
--   It does not touch a player at any other status. It does not overwrite a
--   date somebody has already set. It writes one event per player and no more,
--   so nobody's count moves twice.
--
--   The date is assigned honestly: their deposit if there is one, else their
--   last contact, else the day they were added - and flagged as estimated,
--   because no sheet recorded when the transfer happened.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Who this would tick, and how many each rep gains.
-- ---------------------------------------------------------------------------
select
  u.name as rep,
  count(*) as would_tick
from public.players p
join public.users u on u.id = p.owner_id
where p.status = 'VIP Transferred'
  and p.vip_transferred_at is null
group by u.name
order by count(*) desc;


-- ---------------------------------------------------------------------------
-- 2. Tick them, and write the one event each.
-- ---------------------------------------------------------------------------
do $$
declare v_ticked integer; v_events integer;
begin
  update public.players p
     set vip_transferred_at =
           coalesce(p.first_deposit_at, p.last_contact_at, p.assigned_at)
   where p.status = 'VIP Transferred'
     and p.vip_transferred_at is null;

  get diagnostics v_ticked = row_count;

  /* not exists, so a player who somehow already has an event does not get a
     second one. A VIP transfer counted twice is somebody paid twice. */
  insert into public.activity_log
    (player_id, user_id, event_type, to_status, occurred_at, metadata)
  select
    p.id,
    p.owner_id,
    'status_change',
    'VIP Transferred',
    p.vip_transferred_at,
    jsonb_build_object(
      'backfilled', true,
      'date_is_estimated', true,
      'source', 'status recorded in the imported book'
    )
  from public.players p
  where p.status = 'VIP Transferred'
    and p.vip_transferred_at is not null
    and not exists (
      select 1 from public.activity_log a
       where a.player_id = p.id
         and a.event_type = 'status_change'
         and a.to_status = 'VIP Transferred'
    );

  get diagnostics v_events = row_count;

  raise notice 'Ticked % player(s), wrote % event(s).', v_ticked, v_events;
end $$;


-- ---------------------------------------------------------------------------
-- 3. Confirm - and check nobody is now counted twice.
-- ---------------------------------------------------------------------------
select
  u.name as rep,
  count(*)                                as vip_events,
  count(distinct a.player_id)             as distinct_players,
  count(*) - count(distinct a.player_id)  as double_counted
from public.activity_log a
join public.users u on u.id = a.user_id
where a.event_type = 'status_change'
  and a.to_status = 'VIP Transferred'
  and a.player_id is not null
group by u.name
order by double_counted desc, u.name;
