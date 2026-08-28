-- ============================================================================
-- A player can only reach a milestone once - enforced, not remembered
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Section 1 reports, section 2 removes duplicates, section 3 makes it
--   impossible to do again. Safe to run more than once.
--
-- WHAT WENT WRONG
--   Chella: 24 VIP transfer events across 13 players. Yuri: 8 across 5.
--   Fourteen transfers counted that never happened, on the number commission
--   is paid from.
--
--   There are two ways to record a VIP transfer, and only one of them checked:
--
--     the tick box      set_vip_transferred - has a `not exists` guard
--     the dropdown      changeStatus - inserts unconditionally
--
--   So tick the box, then move the status, and the same transfer is counted
--   twice. Nobody did anything wrong; the app accepted the same fact twice.
--
--   First Deposit has the identical hole, and worse: the stats count both
--   'First Deposit' and 'Active' as a deposit, so a player moved
--   Active -> First Deposit -> Active could be counted three times.
--
-- WHY A DATABASE CONSTRAINT AND NOT A CHECK IN THE CODE
--   A check in the code is a promise every future caller has to keep. This
--   codebase has already proved it cannot keep that kind of promise: "what
--   counts as due" was written out three times and drifted, the import skipped
--   the log entirely, and adding a player at a milestone recorded nothing.
--   Each was a rule held in one place and forgotten in another.
--
--   A unique index cannot be forgotten. The third way in - whatever it turns
--   out to be - is refused by the database rather than relying on whoever
--   writes it having read this file.
--
-- WHAT IS NOT CONSTRAINED
--   task_completed, note_added, outreach and the rest. Those are things that
--   genuinely happen repeatedly - a rep contacts the same player weekly, and
--   that is the point of them.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. What is doubled, and by how much.
-- ---------------------------------------------------------------------------
select
  u.name as rep,
  a.to_status,
  count(*)                                as events,
  count(distinct a.player_id)             as players,
  count(*) - count(distinct a.player_id)  as duplicates
from public.activity_log a
join public.users u on u.id = a.user_id
where a.event_type = 'status_change'
  and a.to_status in ('VIP Transferred', 'First Deposit', 'Active')
  and a.player_id is not null
group by u.name, a.to_status
having count(*) > count(distinct a.player_id)
order by duplicates desc;


-- ---------------------------------------------------------------------------
-- 2. Keep the EARLIEST of each, drop the rest.
--
-- Earliest, not latest: the first time somebody recorded it is when it
-- happened. Keeping the newest would quietly move a transfer forward every
-- time anyone touched the status afterwards.
-- ---------------------------------------------------------------------------
do $$
declare v_gone integer;
begin
  delete from public.activity_log a
   using (
     select id,
            row_number() over (
              partition by player_id, to_status
              order by occurred_at asc, id asc
            ) as rn
       from public.activity_log
      where event_type = 'status_change'
        and to_status in ('VIP Transferred', 'First Deposit', 'Active')
        and player_id is not null
   ) dup
   where a.id = dup.id
     and dup.rn > 1;

  get diagnostics v_gone = row_count;
  raise notice 'Removed % duplicate milestone event(s).', v_gone;
end $$;


-- ---------------------------------------------------------------------------
-- 3. Make it impossible.
-- ---------------------------------------------------------------------------
create unique index if not exists activity_one_milestone_per_player_idx
  on public.activity_log (player_id, to_status)
  where event_type = 'status_change'
    and to_status in ('VIP Transferred', 'First Deposit', 'Active')
    and player_id is not null;

comment on index public.activity_one_milestone_per_player_idx is
  'One VIP transfer, one first deposit, one activation per player - ever. '
  'Two code paths recorded each of these and only one checked first, which '
  'double counted 14 transfers across two reps before anyone noticed.';


-- ---------------------------------------------------------------------------
-- 4. Confirm. Every rep should now read the same in both columns.
-- ---------------------------------------------------------------------------
select
  u.name as rep,
  count(*) filter (where a.to_status = 'VIP Transferred')            as vip_events,
  count(distinct a.player_id) filter (where a.to_status = 'VIP Transferred')
                                                                     as vip_players,
  count(*) filter (where a.to_status in ('First Deposit', 'Active')) as deposit_events,
  count(distinct a.player_id) filter (where a.to_status in ('First Deposit', 'Active'))
                                                                     as deposit_players
from public.activity_log a
join public.users u on u.id = a.user_id
where a.event_type = 'status_change' and a.player_id is not null
group by u.name
order by u.name;
