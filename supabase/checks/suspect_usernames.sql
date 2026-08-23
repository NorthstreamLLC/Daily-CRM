-- ============================================================================
-- Roobet usernames that are not Roobet usernames
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste > Run.
--   Reads only. Changes nothing.
--
-- WHY
--   Tuna's book has a player whose Roobet username is
--   "creating account and grabbing stake stats" - a note that landed in the
--   wrong column when the sheet was maintained by hand.
--
--   That is worse than an empty field, because an empty field is VISIBLE. It
--   shows up in the Book's "No Roobet username" filter and somebody eventually
--   chases it. Prose in the column looks filled in, so:
--
--     - it never matches the Roobet leaderboard, so that player's wager is
--       attributed to nobody, forever
--     - it escapes the "No Roobet username" filter, so nobody is ever asked
--       to fix it
--
--   A player with a blank username costs you a nag. A player with a sentence
--   in it costs you their wager and you never find out.
--
-- WHAT COUNTS AS SUSPECT
--   Roobet usernames are one token: letters, digits, underscore, hyphen.
--   Anything with a space in it, or long enough to be a sentence, or carrying
--   punctuation a username cannot have, is a human writing in the wrong box.
--
--   Deliberately loose. A false positive costs ten seconds of reading; a false
--   negative costs a player's wager history.
-- ============================================================================

select
  u.name                                   as rep,
  p.reference,
  p.handle,
  p.roobet_username,
  p.status,
  length(btrim(p.roobet_username))         as len,
  case
    when btrim(p.roobet_username) ~ '\s'                       then 'has a space'
    when length(btrim(p.roobet_username)) > 24                 then 'too long'
    when btrim(p.roobet_username) !~ '^[A-Za-z0-9_.\-]+$'      then 'odd characters'
    when length(btrim(p.roobet_username)) < 3                  then 'too short'
    when btrim(p.roobet_username) ~* '^(n/?a|none|no|tbd|pending|unknown|\?+|-+)$'
                                                               then 'a placeholder'
  end                                      as why,
  p.last_contact_at
from public.players p
join public.users u on u.id = p.owner_id
where p.roobet_username is not null
  and btrim(p.roobet_username) <> ''
  and (
       btrim(p.roobet_username) ~ '\s'
    or length(btrim(p.roobet_username)) > 24
    or length(btrim(p.roobet_username)) < 3
    or btrim(p.roobet_username) !~ '^[A-Za-z0-9_.\-]+$'
    or btrim(p.roobet_username) ~* '^(n/?a|none|no|tbd|pending|unknown|\?+|-+)$'
  )
order by u.name, p.reference;


-- ---------------------------------------------------------------------------
-- The other half of the same question: does this username exist at Roobet?
--
-- A username can be perfectly well FORMED and still be wrong - a typo, or the
-- Discord name typed in twice. The test for that is whether it has ever
-- appeared in wager data.
--
-- Not proof: a real player who has never wagered also appears here, and there
-- will be plenty. Read it as "these are the ones nothing has ever matched",
-- which is the list worth spot-checking, not a list to act on blindly.
-- ---------------------------------------------------------------------------
select
  u.name as rep,
  count(*) filter (where w.uname is null)                        as never_seen_wagering,
  count(*)                                                       as with_a_username,
  round(100.0 * count(*) filter (where w.uname is null) / nullif(count(*), 0), 1)
                                                                 as pct_unmatched
from public.players p
join public.users u on u.id = p.owner_id
left join (
  select distinct lower(btrim(username)) as uname
    from public.wager_periods
   where period_type = 'all'
) w on w.uname = lower(btrim(p.roobet_username))
where p.roobet_username is not null
  and btrim(p.roobet_username) <> ''
group by u.name
order by pct_unmatched desc nulls last;
