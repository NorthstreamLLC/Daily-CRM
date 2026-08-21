-- ============================================================================
-- Count the unclaimed from the small table, not the big one
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once. Replaces the version from 033.
--
-- WHY
--   Wager: 532ms · unclaimed 525ms · periods 511ms · report 438ms · ...
--
--   It became the slowest thing on the page, because it took a DISTINCT over
--   every row of wager_external - the full ledger, one row per username per
--   code per capture, growing every sync forever - to answer a question about
--   roughly 880 distinct people.
--
--   wager_periods already holds exactly one row per username per code for
--   period_type = 'all'. That is the same set of usernames, from a table
--   orders of magnitude smaller, and it is the table every other figure on
--   the page already reads.
--
--   Same answer. Far less work. And it stops growing with sync frequency,
--   which is the part that mattered - the old version got slower every day
--   whether or not a single new person wagered.
-- ============================================================================

drop function if exists public.unclaimed_wagerer_count();

create function public.unclaimed_wagerer_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from (
      select distinct lower(btrim(wp.username)) as uname
        from public.wager_periods wp
       where wp.period_type = 'all'
         and wp.wagered > 0
    ) all_names
    left join public.player_by_roobet p on p.uname = all_names.uname
    left join public.wager_ignored wi
           on lower(btrim(wi.username)) = all_names.uname
   where p.uname is null
     and wi.username is null;
$$;

revoke all on function public.unclaimed_wagerer_count() from public;
grant execute on function public.unclaimed_wagerer_count() to authenticated;

comment on function public.unclaimed_wagerer_count() is
  'Wagerers matched to nobody and not marked pre-existing. Counted from '
  'wager_periods (one row per username per code) rather than the ledger, so '
  'it does not get slower every time the sync runs.';

-- The anti-join above wants this; wager_ignored has never had an index.
create index if not exists wager_ignored_username_idx
  on public.wager_ignored (lower(btrim(username)));
