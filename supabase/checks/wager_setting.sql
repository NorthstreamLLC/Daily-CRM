-- ============================================================================
-- Why won't "Show wager figures to reps" save?
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste > Run.
--   Queries 1-3 read only. Query 4 writes, and is safe either way.
--
-- Three candidates, in the order worth ruling out.
-- ============================================================================

-- 1. Does the setting row exist at all?
--    If this returns nothing, migration 20260812000038_reps_see_wager.sql was
--    never run - and updateSetting rejects the key before writing anything,
--    because it looks the setting up first to validate the type.
select key, value, value_type, label
  from public.settings
 where key in ('reps_see_wager', 'require_roobet_username')
 order by key;


-- 2. What does the app currently think?
select
  (select value from public.settings where key = 'reps_see_wager') as stored_value,
  coalesce(
    (select value from public.settings where key = 'reps_see_wager'), 'MISSING'
  ) = 'true' as reps_would_see_figures;


-- 3. Was the change even attempted?
--    Every successful save writes an audit row. Nothing here means the click
--    never reached the server. Rows here with the value above unchanged means
--    the write was refused - which is the case the app used to report as
--    "Saved." and now reports honestly.
select u.name as changed_by, a.detail, a.occurred_at
  from public.admin_audit a
  left join public.users u on u.id = a.actor_id
 where a.action = 'update_setting'
   and a.detail->>'key' = 'reps_see_wager'
 order by a.occurred_at desc
 limit 10;


-- ---------------------------------------------------------------------------
-- 4. If query 1 came back empty, this creates the row. Safe to run either way.
-- ---------------------------------------------------------------------------
insert into public.settings
  (key, value, value_type, label, description, category, sort_order)
values
  ('reps_see_wager', 'false', 'bool',
   'Show wager figures to reps',
   'Off by default. A rep who can see that one of their players wagered '
   '$400,000 has a number to negotiate with, and the conversation stops being '
   'about the work. Admins always see the figures either way.',
   'wager', 10)
on conflict (key) do nothing;


-- And to turn it on without the button, once the row exists:
-- update public.settings set value = 'true' where key = 'reps_see_wager';
