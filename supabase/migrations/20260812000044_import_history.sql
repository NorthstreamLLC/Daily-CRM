-- ============================================================================
-- Give imported players a history, so the stats stop reading zero
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once - every insert is guarded.
--   Section 1 only reports. Nothing is written until section 2.
--
-- THE BUG
--   Tuna's Stats page: "Leads added 0", and two inches below it, in the funnel
--   on the same page in the same window, "Leads added 319".
--
--   Everything on the cards is counted from activity_log. The funnel and the
--   Book are counted from the players table. The import wrote players and no
--   log rows at all, so one half of the page saw a full book and the other
--   half saw an empty one.
--
--   It is not only the cards. The 90-day trend, best day, best week, streaks,
--   source performance and KPI progress all read activity_log. For everyone.
--
-- WHY IT WAS MISSED
--   Adding a player through the app writes the log row; the import inserts
--   straight into players. Every test used the app. Nothing tested the state
--   the whole company would actually be in on day one - which is 1,500 players
--   who arrived by a path that logs nothing.
--
-- WHAT THIS WRITES, and how much of it is real
--
--   player_created   REAL DATE. assigned_at is when that lead was added; the
--                    spreadsheet carried it and the import kept it.
--
--   First Deposit    REAL DATE. first_deposit_at came across too.
--
--   VIP Transferred  RECORDED ONLY. Written for players whose status in the
--                    spreadsheet literally says VIP Transferred - nothing
--                    inferred. The date is still an estimate (no sheet
--                    recorded it), so those rows say so.
--
--   Every row gets metadata {"backfilled": true}. That is the point: the
--   totals become right, the estimated dates stay visibly estimated, and
--   anybody looking at a rep's history in a year can tell which rows were
--   observed and which were reconstructed. Quietly inventing timestamps that
--   look like logged work would be worse than the zero.
--
-- WHY VIP TRANSFERS ARE COUNTED NARROWLY
--   The first version of this counted anyone at or past VIP Transferred in the
--   funnel order - which swept in KYC Complete and Active. Both are wrong:
--
--     KYC Complete   a rep can walk somebody through KYC themselves. It says
--                    nothing about whether the VIP team ever took them.
--     Active         the wager sync sets this from wagering alone. A player
--                    who found the site and started betting is Active without
--                    any rep having transferred anybody.
--
--   Isac's read on his own book caught it: "there is no chance Chella even has
--   10 VIP transfers."
--
--   VIP transfers feed commission. A number that decides pay should be
--   RECORDED, not inferred, and where it has to be wrong it should be wrong
--   low. Only a status that literally reads VIP Transferred counts here.
--
--   Section 1 prints the full status breakdown per rep so this is a decision
--   made against the actual books rather than an assumption about them.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. DRY RUN. What would each rep gain? Nothing is written by this.
-- ---------------------------------------------------------------------------
select
  u.name as rep,
  count(*) filter (
    where not exists (
      select 1 from public.activity_log a
       where a.player_id = p.id and a.event_type = 'player_created'
    )
  ) as leads_to_add,
  count(*) filter (
    where p.status = 'VIP Transferred'
      and not exists (
        select 1 from public.activity_log a
         where a.player_id = p.id
           and a.event_type = 'status_change'
           and a.to_status = 'VIP Transferred'
      )
  ) as vip_to_add,
  count(*) filter (
    where p.first_deposit_at is not null
      and not exists (
        select 1 from public.activity_log a
         where a.player_id = p.id
           and a.event_type = 'status_change'
           and a.to_status in ('First Deposit', 'Active')
      )
  ) as deposits_to_add,
  count(*) as players
from public.players p
join public.users u on u.id = p.owner_id
group by u.name
order by u.name;


-- 1b. The full picture, so the rule above can be judged rather than trusted.
--     If a status here should also count as a VIP transfer, add it to the
--     `in (...)` list in section 2b before running - and only then.
select
  u.name as rep,
  p.status,
  count(*) as players
from public.players p
join public.users u on u.id = p.owner_id
group by u.name, p.status
order by u.name, count(*) desc;


-- ---------------------------------------------------------------------------
-- 2. THE BACKFILL.
-- ---------------------------------------------------------------------------

-- 2a. Every player was added by somebody, on a day the sheet recorded.
insert into public.activity_log (player_id, user_id, event_type, to_status, occurred_at, metadata)
select
  p.id,
  p.owner_id,
  'player_created',
  p.status,
  p.assigned_at,
  jsonb_build_object('backfilled', true, 'source', 'imported book')
from public.players p
where not exists (
  select 1 from public.activity_log a
   where a.player_id = p.id and a.event_type = 'player_created'
);


-- 2b. Reached VIP transfer. The event is certain; the date is the best guess
--     available, and the metadata says so rather than pretending otherwise.
insert into public.activity_log (player_id, user_id, event_type, to_status, occurred_at, metadata)
select
  p.id,
  p.owner_id,
  'status_change',
  'VIP Transferred',
  coalesce(p.first_deposit_at, p.last_contact_at, p.assigned_at),
  jsonb_build_object('backfilled', true, 'date_is_estimated', true,
                     'source', 'status recorded in the imported book')
from public.players p
where p.status in ('VIP Transferred')     -- recorded only; nothing inferred
  and not exists (
    select 1 from public.activity_log a
     where a.player_id = p.id
       and a.event_type = 'status_change'
       and a.to_status = 'VIP Transferred'
  );


-- 2c. First deposits. Guarded against the wager sync's own 'Active' events -
--     the stats count either as a deposit, so inserting both would double
--     every FTD the sync has already recorded.
insert into public.activity_log (player_id, user_id, event_type, to_status, occurred_at, metadata)
select
  p.id,
  p.owner_id,
  'status_change',
  'First Deposit',
  p.first_deposit_at,
  jsonb_build_object('backfilled', true, 'source', 'imported book')
from public.players p
where p.first_deposit_at is not null
  and not exists (
    select 1 from public.activity_log a
     where a.player_id = p.id
       and a.event_type = 'status_change'
       and a.to_status in ('First Deposit', 'Active')
  );


-- ---------------------------------------------------------------------------
-- 3. Confirm. The cards should now agree with the funnel.
-- ---------------------------------------------------------------------------
select
  u.name as rep,
  count(*) filter (where a.event_type = 'player_created')                       as leads,
  count(*) filter (where a.to_status = 'VIP Transferred')                       as vip_transfers,
  count(*) filter (where a.to_status in ('First Deposit', 'Active'))            as first_deposits,
  count(*) filter (where a.event_type = 'task_completed')                       as contacts,
  count(*) filter (where (a.metadata->>'backfilled')::boolean)                  as of_which_backfilled
from public.activity_log a
join public.users u on u.id = a.user_id
where a.player_id is not null
group by u.name
order by u.name;
