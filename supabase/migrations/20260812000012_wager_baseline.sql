-- ============================================================================
-- New-player baseline for deposit signals
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- THE PROBLEM
--   "New wagering players today" was counting a player's first entry in OUR
--   ledger, not their first real wager. Import eight months of history and
--   several hundred long-standing players all look like they arrived at once.
--
--   The baseline separates the two: anyone whose first wager predates it was
--   already wagering before we started watching, and is never counted as new.
--   Set it to the date you began tracking - everything after it is genuinely
--   new business.
-- ============================================================================

insert into public.settings (key, value, value_type, label, description, category, sort_order) values
  ('wager_new_player_baseline', '', 'text',
   'New-player baseline date',
   'YYYY-MM-DD. Players whose first wager predates this were already active before tracking began, so they are never counted as new. Leave blank to treat every player as pre-existing and rely on the all-time figure.',
   'wager', 4)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
