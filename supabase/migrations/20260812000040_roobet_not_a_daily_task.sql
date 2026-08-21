-- ============================================================================
-- A missing Roobet username is a blocker, not a daily task
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHAT HAPPENED
--   With seven books imported, the team leaderboard read:
--
--     Plat     321 outstanding of 325 in book
--     Pricey   290 of 332
--     Chella   178 of 463
--     Seanok    80 of 80
--
--   Whole books, due every day, forever. Nobody had daily tasks like this in
--   the spreadsheet, and a queue that never empties is a queue nobody opens.
--
-- WHY
--   The queue surfaced anyone with no Roobet username "every day until it is
--   filled". Tuna's book: 181 live players, 133 with no username. So 133 tasks
--   every morning that cannot be cleared by doing the work - only by getting
--   a username out of somebody who may never give one.
--
--   The intent was right. A player with no username can never be tracked or
--   credited, so it IS the biggest blocker. But "important" and "due today,
--   every day" are different things, and treating them as the same buries the
--   follow-ups that actually have a date attached.
--
-- THE SETTING ALREADY EXISTED
--   require_roobet_username, added in migration 003, described as "Keep
--   players without a Roobet username in the daily queue". Nothing ever read
--   it - the rule was hardcoded on. It is honoured now, and turned off.
--
-- NOTHING IS LOST
--   The Book still has a "No Roobet username" filter with a live count, which
--   is where a chase-the-usernames session belongs: a deliberate sweep, not a
--   permanent tax on every morning.
--
--   Turn it back on in Admin > Settings if a rep wants the old behaviour.
-- ============================================================================

update public.settings
   set value = 'false',
       description =
         'When on, a player with no Roobet username stays in the daily queue '
         'every day until it is filled. Off by default: with real books that '
         'is most of the book, and a queue that never empties is a queue '
         'nobody opens. They are still one click away under the Book''s "No '
         'Roobet username" filter.'
 where key = 'require_roobet_username';

-- If the row is missing entirely - an install that predates migration 003 -
-- create it off rather than leaving the app to guess.
insert into public.settings
  (key, value, value_type, label, description, category, sort_order)
values
  ('require_roobet_username', 'false', 'bool',
   'Keep players without a Roobet username in the daily queue',
   'Off by default. They are still one click away under the Book''s "No Roobet username" filter.',
   'queue', 4)
on conflict (key) do nothing;
