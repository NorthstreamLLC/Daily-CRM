-- ============================================================================
-- Churn detection settings
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- THE IDEA
--   The CRM tracks players becoming active. It never noticed them stopping -
--   and a player who wagered $40,000 last week and nothing this week is the
--   most urgent thing in the business. Nobody was being told.
--
--   Two signals, both computed from wager movement:
--     GONE QUIET  - was wagering, now nothing for N days
--     DROPPING    - still wagering, but far below their own recent normal
--
--   Both are prompts, never automatic status changes. The rep decides.
-- ============================================================================

insert into public.settings (key, value, value_type, label, description, category, sort_order) values
  ('churn_quiet_days', '7', 'int',
   'Days of silence before a player counts as gone quiet',
   'A player who wagered before and has wagered nothing for this many days is surfaced for a check-in.',
   'churn', 1),

  ('churn_drop_percent', '50', 'int',
   'Drop that counts as falling away (%)',
   'If this period''s wager is below this percentage of the previous equivalent period, the player is flagged as dropping. 50 means "wagering less than half what they were".',
   'churn', 2),

  ('churn_min_wager', '100', 'int',
   'Ignore players below this lifetime wager ($)',
   'Stops the list filling with people who wagered five dollars once. Raise it if the list is noisy.',
   'churn', 3)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
