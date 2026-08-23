-- ============================================================================
-- Make the rep's code match the numbers already in their book
--
-- HOW TO RUN
--   Read the whole file first - the middle section is the one you edit.
--   Supabase dashboard > SQL Editor > New query > paste > Run.
--
-- WHAT WAS FOUND
--   Pricey  code PR   book numbered JD-0001 … JD-0335   (332 players)
--   Yuri    code YR   book numbered YU-0001 … YU-0023   (23 players)
--
--   The import preserves the Player IDs from the spreadsheet rather than
--   renumbering, so a reference a rep wrote in a Discord message a year ago
--   still finds the right person. These two sheets were simply numbered with a
--   different prefix than the code they were given in the CRM.
--
-- WHY BOTHER
--   Nothing is broken today. But the next player added to Pricey's book gets
--   PR-0001, because the counter looks for PR-. Pricey then has two series in
--   one book - JD-0335 sitting above PR-0001 - and every future player joins
--   the wrong one.
--
-- WHICH SIDE TO CHANGE
--   Change the CODE, not the references.
--
--   The reference is the part that has left the building. It is in Discord
--   messages, in the reps' own notes, in the spreadsheets they still have open
--   in another tab. Rewriting 332 of them makes every one of those wrong.
--
--   The code is an internal setting nobody outside this app has ever seen.
--   Change the thing with no paper trail to match the thing that has one.
--
-- BEFORE YOU RUN
--   Is JD somebody's initials? If Pricey took over a book from a Jordan, that
--   is a fact about who earned those players, and it belongs in a conversation
--   about commission before it belongs in a SQL editor. This file only makes
--   the labels agree - it does not decide who owns the work.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Check the codes you want are free. `code` is UNIQUE, so a clash here
--    fails the update rather than doing something creative.
-- ---------------------------------------------------------------------------
select name, code, email
  from public.users
 where code in ('JD', 'YU', 'PR', 'YR')
 order by code;


-- ---------------------------------------------------------------------------
-- 2. The change. Edit the names and codes, then run this block.
--
--    Wrapped so it either does both or neither - half-renamed is the one state
--    nobody could reason about later.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  h int;
begin
  update public.users set code = 'JD' where name = 'Pricey';
  update public.users set code = 'YU' where name = 'Yuri';

  /* The counter is derived from the code, so it is now pointing at the wrong
     series - it would hand out JD-0001 to a book whose highest is JD-0335.
     This is the repair loop from migration 039, run again for the same reason
     it existed the first time: a counter that is behind collides on insert,
     and a reference collision loses a whole import batch. */
  for r in select id, code, next_player_number from public.users loop
    select coalesce(max(nullif(regexp_replace(reference, '^.*-', ''), '')::int), 0)
      into h
      from public.players
     where reference ~ ('^' || r.code || '-[0-9]+$');

    if h + 1 > r.next_player_number then
      update public.users set next_player_number = h + 1 where id = r.id;
      raise notice '% counter moved from % to %', r.code, r.next_player_number, h + 1;
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 3. Confirm. This should now return zero rows.
-- ---------------------------------------------------------------------------
select
  u.name       as sitting_in_this_book,
  u.code       as their_code,
  substring(p.reference from '^[A-Za-z]+') as reference_says,
  count(*)     as players
from public.players p
join public.users u on u.id = p.owner_id
where p.reference !~ ('^' || u.code || '-[0-9]+$')
group by u.name, u.code, substring(p.reference from '^[A-Za-z]+')
order by players desc;
