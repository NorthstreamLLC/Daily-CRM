-- ============================================================================
-- Wager as proof of play: settings for automatic status advance
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- THE IDEA
--   Roobet will not tell us about deposits, but wagering is proof one happened.
--   So when a player's wager moves, the CRM can advance them to Active without
--   anyone remembering to - a VIP transfer who starts playing becomes an Active
--   player by itself, and a dead lead who quietly comes back stops being dead.
--
--   Every automatic move is written to activity_log against the player's OWNER,
--   so the rep gets the credit in their stats exactly as if they had done it.
--   Admin-configurable, because a rule that fires on someone else's money
--   should never be hardcoded.
-- ============================================================================

insert into public.settings (key, value, value_type, label, description, category, sort_order) values
  ('auto_active_on_wager', 'true', 'bool',
   'Move players to Active when they wager',
   'Wagering proves a deposit happened. When this is on, a player whose wager increases is moved to Active automatically and their first-deposit date is stamped. The move is logged against their rep, so it counts towards that rep''s numbers.',
   'wager', 1),

  ('auto_active_min_wager', '1', 'int',
   'Minimum wager increase to trigger the move',
   'How much a player''s wager must rise before the automatic move fires. Raise this if tiny amounts are creating noise.',
   'wager', 2),

  ('auto_active_from_dead', 'true', 'bool',
   'Include dead leads',
   'When on, a dead lead who starts wagering is revived to Active - usually the most valuable signal the sync produces. When off, dead leads are left alone and only appear in the deposit signals list.',
   'wager', 3)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
