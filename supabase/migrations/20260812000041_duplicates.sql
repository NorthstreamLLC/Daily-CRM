-- ============================================================================
-- Find the same person in two books
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHY
--   Thirteen spreadsheets maintained separately for a year will contain the
--   same people more than once - Tuna and Chella already do. The import
--   reports it and carries on, which is right: a duplicate is a decision about
--   who owns a player, and that is a human's call, not a reason to refuse a
--   file at 3pm on a Thursday.
--
--   But nothing showed the duplicates once they were IN, so the decision had
--   nowhere to happen. This is that list.
--
-- TWO KINDS, and they matter differently
--
--   SAME ROOBET USERNAME - the expensive one. The wager report attributes
--   money to whichever record was touched most recently, which is arbitrary,
--   and commission is paid from it. Two reps can be paid for one player's
--   wagering, or the wrong one can.
--
--   SAME HANDLE - two reps working the same person. Wasteful and awkward
--   rather than expensive, and sometimes legitimate: two people genuinely can
--   share a Discord name.
--
--   Both are listed, the username kind first, because that is the one with
--   money attached.
-- ============================================================================

drop function if exists public.duplicate_players();

create function public.duplicate_players()
returns table (
  kind        text,
  value       text,
  player_id   uuid,
  reference   text,
  handle      text,
  roobet_username text,
  owner_name  text,
  status      text,
  wagered     numeric,
  last_contact_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with by_username as (
    select lower(btrim(p.roobet_username)) as key
      from public.players p
     where p.roobet_username is not null
       and btrim(p.roobet_username) <> ''
     group by lower(btrim(p.roobet_username))
    having count(*) > 1
  ),
  by_handle as (
    select lower(btrim(p.handle)) as key
      from public.players p
     where btrim(coalesce(p.handle, '')) <> ''
     group by lower(btrim(p.handle))
    having count(distinct p.owner_id) > 1
  )
  select
    'roobet'::text,
    lower(btrim(p.roobet_username)),
    p.id, p.reference, p.handle, p.roobet_username,
    u.name, p.status,
    coalesce(p.weighted_wager, 0),
    p.last_contact_at
  from public.players p
  join by_username d on d.key = lower(btrim(p.roobet_username))
  join public.users u on u.id = p.owner_id

  union all

  select
    'handle'::text,
    lower(btrim(p.handle)),
    p.id, p.reference, p.handle, p.roobet_username,
    u.name, p.status,
    coalesce(p.weighted_wager, 0),
    p.last_contact_at
  from public.players p
  join by_handle d on d.key = lower(btrim(p.handle))
  join public.users u on u.id = p.owner_id
  /* Handle duplicates that are ALSO username duplicates are already listed
     above under the kind that matters more. */
  where not exists (
    select 1 from by_username bu
     where bu.key = lower(btrim(p.roobet_username))
  )

  order by 1, 2, 9 desc;
$$;

revoke all on function public.duplicate_players() from public;
grant execute on function public.duplicate_players() to authenticated;

comment on function public.duplicate_players() is
  'The same person in more than one book. Grouped by Roobet username (money '
  'is attributed arbitrarily between them) and by handle across owners (two '
  'reps working one person). Company-wide, so admin pages only.';
