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
--   VIP Transferred  NOT WRITTEN AT ALL. See section 2b - it becomes a tick
--                    box on the player instead, recorded from today forward.
--
--   Every row gets metadata {"backfilled": true}. That is the point: the
--   totals become right, the estimated dates stay visibly estimated, and
--   anybody looking at a rep's history in a year can tell which rows were
--   observed and which were reconstructed. Quietly inventing timestamps that
--   look like logged work would be worse than the zero.
--
-- WHY VIP TRANSFERS ARE LEFT OUT
--   The first version counted anyone at or past VIP Transferred in the funnel
--   ORDER. Isac stopped it: "there is no chance Chella even has 10 VIP
--   transfers." The funnel order tells you which stage comes later. It does
--   not tell you which stages a player passed THROUGH, and I had treated the
--   two as the same thing.
--
--   The killer detail: 'Active' was never a status in any of the spreadsheets.
--   Yuri's and Tuna's books use Initial Contact, KYC Complete, VIP
--   Transferred, First Deposit, Potential Lead and Dead Lead. Every Active
--   player in the database was promoted by the WAGER SYNC on wagering alone,
--   with no rep involved - so counting them as transfers credits a rep for a
--   player who found the site by themselves.
--
--   Narrowing the rule would have helped, but every version of it is still a
--   guess dressed as a number, on a figure that decides pay. So the guess is
--   gone: VIP transfer becomes a tick box (migration 045), recorded from today.
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
    where p.status in ('VIP Transferred', 'First Deposit')
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
--     Worth reading before section 2 - in particular, how many players sit at
--     'Active', since none of the sheets used that status and every one of
--     them is a wager-sync promotion rather than a rep's work.
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


-- 2b. VIP transfers are NOT backfilled. Deliberately.
--
--     There is no honest way to reconstruct them. The sheets recorded a
--     CURRENT status, not a history, so the only signal is "where are they
--     now" - and that cannot distinguish a player a rep transferred from one
--     the wager sync promoted on wagering alone.
--
--     Rather than pick a rule and hope, VIP transfer becomes something a rep
--     TICKS, on the player, from today (migration 045). It starts empty and
--     fills with facts instead of starting full of guesses.
--
--     Historical transfers stay in the spreadsheets, which is where the
--     evidence for them actually lives.

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
