-- ============================================================================
-- Count the queue in the database, not by downloading it
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- THE BUG
--   Tuna's leaderboard row said "Clear" with 319 players in his book. The
--   database, asked directly, said 174 past due plus 2 never contacted.
--
--   getLeaderboard fetched EVERY due player in the company as rows and counted
--   them in JavaScript. With seven books imported that is roughly 1,150 rows,
--   and PostgREST caps how many it will return. The rows past the cap were
--   silently dropped - no error, no warning - and whichever reps happened to
--   sit past it showed Clear.
--
--   A rep reading "Clear" when they have 176 people waiting is the worst
--   possible failure for this page. It is the number managers act on.
--
-- THE FIX
--   Ask Postgres for the count. One row per rep, no cap to hit, and it stops
--   being a "how many rows will they let me have" problem entirely.
--
--   It also gets the day boundary right per rep. The JavaScript version had to
--   fetch each player's last_contact_at to work out "did they already do this
--   one today", using the rep's own timezone. That is a join to users here.
-- ============================================================================

drop function if exists public.outstanding_by_owner(boolean);

create function public.outstanding_by_owner(p_require_roobet boolean default false)
returns table (owner_id uuid, outstanding bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.owner_id,
    count(*)::bigint
  from public.players_enriched p
  join public.users u on u.id = p.owner_id
  where
    /* Dead leads are not today's work - they retarget on their own 30-day
       cycle and live in the Book. Same rule as onlyDue. */
    not p.is_dead

    -- Due: never contacted, or the follow-up date has arrived, or - only when
    -- the setting says so - they still have no Roobet username.
    and (
      p.last_contact_at is null
      or p.next_followup_at <= now()
      or (p_require_roobet and p.missing_roobet)
    )

    /* Not already worked today, in the REP'S OWN day. A rep in Manila and a
       rep in London do not share a "today", and counting a Manila rep's
       morning work as yesterday's would leave it on their list. */
    and (
      p.last_contact_at is null
      or p.last_contact_at
         < (date_trunc('day', now() at time zone u.timezone) at time zone u.timezone)
    )
  group by p.owner_id;
$$;

revoke all on function public.outstanding_by_owner(boolean) from public;
grant execute on function public.outstanding_by_owner(boolean) to authenticated;

comment on function public.outstanding_by_owner(boolean) is
  'How many players are waiting on each rep right now. Counted in the '
  'database: the previous version downloaded every due player and counted in '
  'JavaScript, which silently truncated at the row cap and reported "Clear" '
  'for anyone past it.';
