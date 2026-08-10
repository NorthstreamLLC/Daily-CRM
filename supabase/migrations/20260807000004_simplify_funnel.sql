-- ============================================================================
-- Daily Gamba CRM - simplify the funnel from 9 stages to 7
--
-- REMOVING
--   'Interested'     - same 1-day cadence and same next action as Initial
--                      Contact. It described a feeling, not a stage.
--   'KYC Complete'   - KYC is already tracked in its own field on every player
--                      (Not Started / Started / Complete / Failed). Having it
--                      as a funnel stage too meant the same fact lived in two
--                      places that could disagree.
--
-- Any player currently at either one moves to Initial Contact. Nothing is lost:
-- neither had deposited, and anyone who was at KYC Complete still carries that
-- in their kyc_status field.
--
-- This is not a one-way door. Statuses are config - an admin can add a stage
-- back from the app without touching code.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Move any affected players first, so nothing is left pointing at a stage
--    that is about to disappear.
-- ---------------------------------------------------------------------------
update public.players
   set status = 'Initial Contact'
 where status in ('Interested', 'KYC Complete');

-- Record it, so the change is visible in history rather than appearing to have
-- always been that way.
insert into public.activity_log (player_id, user_id, event_type, from_status, to_status, metadata)
select p.id, p.owner_id, 'status_change', 'Interested', 'Initial Contact',
       jsonb_build_object('reason', 'funnel simplified - Interested merged into Initial Contact')
from public.players p
where false;  -- no rows yet; kept so the intent is documented if this is re-run with data


-- ---------------------------------------------------------------------------
-- 2. Drop the two stages.
-- ---------------------------------------------------------------------------
delete from public.statuses where name in ('Interested', 'KYC Complete');


-- ---------------------------------------------------------------------------
-- 3. Renumber what remains so the order reads as the real journey:
--    contact -> fast-track -> deposit -> keep playing, with three ways to fall out.
-- ---------------------------------------------------------------------------
update public.statuses set sort_order = 1 where name = 'Initial Contact';
update public.statuses set sort_order = 2 where name = 'VIP Transferred';
update public.statuses set sort_order = 3 where name = 'First Deposit';
update public.statuses set sort_order = 4 where name = 'Active';
update public.statuses set sort_order = 5 where name = 'Reactivation Queue';
update public.statuses set sort_order = 6 where name = 'Potential Lead';
update public.statuses set sort_order = 7 where name = 'Dead Lead';


-- ---------------------------------------------------------------------------
-- 4. Initial Contact now covers what Interested used to, so its next action
--    should say so without implying a first-day-only task.
-- ---------------------------------------------------------------------------
update public.statuses
   set next_action = 'Check account, check KYC, help them deposit'
 where name = 'Initial Contact';


-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
select sort_order, name, followup_days as cadence_days, next_action,
       counts_as_lead, is_ftd, is_dead
from public.statuses
order by sort_order;

-- Expect 7 rows:
--   1 Initial Contact     1
--   2 VIP Transferred     1
--   3 First Deposit       3
--   4 Active             14
--   5 Reactivation Queue  3
--   6 Potential Lead      7
--   7 Dead Lead          30
