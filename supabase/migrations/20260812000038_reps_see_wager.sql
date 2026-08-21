-- ============================================================================
-- Should a rep see what their players wagered?
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHY
--   A rep who can see that one of their players wagered $400,000 has a number
--   to negotiate with, and the conversation stops being about the work and
--   starts being about the figure. Before launch that is a conversation worth
--   not having.
--
--   It is a business decision, not a technical one, so it is a setting rather
--   than a code change - flip it in Admin > Settings and it is on, with no
--   deploy and no asking anybody.
--
-- WHAT IT HIDES when off
--   - "What your players wagered" on the rep's own Stats page
--   - the Wagered column in the Book, and sorting by it
--   - the dollar figures in "Falling away" (the ranking still works, so a rep
--     still learns WHO went quiet - just not what they were worth)
--   - the wager CSV export, refused at the endpoint, not merely hidden
--
--   Admins always see everything, including when viewing as a rep - the point
--   is what a rep can see when signed in as themselves.
-- ============================================================================

insert into public.settings
  (key, value, value_type, label, description, category, sort_order)
values
  ('reps_see_wager', 'false', 'bool',
   'Show wager figures to reps',
   'When off, reps see their players and their progress but not the dollar amounts wagered. Who is falling away still shows; what they were worth does not. Admins always see the figures.',
   'general', 1)
on conflict (key) do nothing;
