-- ============================================================================
-- The eight depositors Roobet has never reported. ONE statement - paste, run.
--
-- WHAT THESE ARE
--   Players marked as having deposited whose Roobet username either is not
--   filled in, or is filled in with something Roobet has never reported. Both
--   mean the same thing in practice: their wager is invisible, they cannot
--   appear on any wager table, and nothing links the money to the rep.
--
-- READ THE why COLUMN
--
--   no username        nothing to match on. Get the Roobet name from the rep
--                      or the player and put it in the Roobet username field.
--
--   username not found the field has something in it and Roobet has never
--                      reported that name. Usually one of three things:
--                        - a typo or an old name
--                        - the Discord handle typed into the Roobet field
--                        - they signed up under a different affiliate code,
--                          in which case the deposit is not ours and the
--                          player record is what is wrong
--
--                      near_matches shows any Roobet name that starts the
--                      same way, which catches most typos immediately.
--
-- WHAT IT IS NOT
--   Not "deposited but has gone quiet" - those people HAVE wager history and
--   show a lifetime figure on the Stats table with zeroes in both windows.
--   This list is stricter: no history anywhere, ever.
-- ============================================================================

select
  u.name                                    as rep,
  p.reference,
  p.handle,
  coalesce(nullif(btrim(p.roobet_username), ''), '-- none --') as roobet_username,
  p.status,
  p.first_deposit_at::date                  as deposited,

  case
    when coalesce(btrim(p.roobet_username), '') = '' then 'no username'
    else 'username not found'
  end                                       as why,

  /* Anything on the leaderboard starting with the same three characters.
     A typo is nearly always visible here; an empty result usually means the
     name is genuinely not ours. */
  (
    select string_agg(distinct wp.username, ', ')
      from public.wager_periods wp
     where coalesce(btrim(p.roobet_username), '') <> ''
       and lower(btrim(wp.username)) like lower(left(btrim(p.roobet_username), 3)) || '%'
     limit 1
  )                                         as near_matches

from public.players p
join public.users u on u.id = p.owner_id
where p.first_deposit_at is not null
  and (
    coalesce(btrim(p.roobet_username), '') = ''
    or not exists (
      select 1 from public.wager_periods wp
       where lower(btrim(wp.username)) = lower(btrim(p.roobet_username))
    )
  )
order by u.name, p.first_deposit_at desc nulls last;
