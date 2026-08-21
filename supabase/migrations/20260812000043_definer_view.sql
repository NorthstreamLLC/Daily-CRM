-- ============================================================================
-- The security definer view the advisor flagged - and the hole it was hiding
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once. It refuses to commit if it changed an answer.
--
-- WHAT WAS FLAGGED
--   public.player_by_roobet is defined with SECURITY DEFINER. Supabase's
--   advisor rates that CRITICAL, and it is right to, because a definer view
--   does not ask "may this person see this row" - it answers with the view
--   owner's permissions, whoever is asking.
--
--   This view lists every player's Roobet username, handle, reference, status
--   and owner. Company-wide. That is the whole book.
--
-- WAS IT ACTUALLY EXPOSED?
--   Partly. Migration 030 revoked it from `public` and from `authenticated`,
--   so a signed-in rep could not read it. It never revoked `anon`.
--
--   Supabase ships default privileges that grant new objects in `public` to
--   both anon and authenticated, so the grant to anon was made automatically
--   at creation and nothing took it away. anon is the role behind the
--   publishable key - the one that ships inside the browser bundle of every
--   page, signed in or not.
--
--   So: revoked from the role that has a login, left granted to the role that
--   does not. That is the wrong way round, and it is exactly the shape of the
--   bug I have now written three times in this codebase - reasoning about who
--   *should* be asking instead of checking what the grants actually say.
--
-- THE FIX, both halves
--
--   1. Revoke anon. That closes it today.
--
--   2. Make the view security_invoker anyway, so a future grant cannot
--      reopen it. Every caller of this view is itself a security definer
--      function (wager_report_rows, wager_report_totals, watched_wagerers,
--      unclaimed_wagerer_count). Inside those, current_user is the function
--      owner, which bypasses RLS - so they keep seeing every book, which is
--      what a company-wide report needs. But if the view is ever read
--      directly by a rep, it now returns that rep's players and nobody
--      else's, instead of the company's.
--
--      Defence in depth: after this, the view leaking requires BOTH a grant
--      mistake AND an RLS mistake, rather than a grant mistake alone.
--
-- WHY THIS IS SAFE TO RUN
--   The flip either changes nothing or breaks the wager pages completely -
--   there is no quiet middle. So the block below measures a definer function
--   that reads the view, flips, measures again, and raises if the number
--   moved, which rolls the whole file back. A migration that can tell you it
--   failed is worth more than one that leaves you reading a dashboard for
--   $0 totals on Monday.
-- ============================================================================

do $$
declare
  v_before integer;
  v_after  integer;
begin
  /* unclaimed_wagerer_count is the sharpest probe available: it counts
     wagerers that DID NOT match a player through this view. If the flip blinds
     the view, every wagerer stops matching and this number jumps to the full
     wagerer list. A silent break would be loud here. */
  select public.unclaimed_wagerer_count() into v_before;

  alter view public.player_by_roobet set (security_invoker = true);

  select public.unclaimed_wagerer_count() into v_after;

  if v_before is distinct from v_after then
    raise exception
      'player_by_roobet changed what the definer functions can see: unclaimed went from % to %. Rolled back - the view stays as it was.',
      v_before, v_after;
  end if;

  raise notice 'player_by_roobet is now security_invoker. Unclaimed wagerers unchanged at %.', v_before;
end $$;


-- ---------------------------------------------------------------------------
-- Close the grant, all three roles named explicitly.
--
-- `public` alone would be enough in theory, since anon and authenticated
-- inherit from it - but they were also granted DIRECTLY by Supabase's default
-- privileges, and a direct grant survives a revoke from public. That is the
-- detail migration 030 missed.
-- ---------------------------------------------------------------------------
revoke all on public.player_by_roobet from public;
revoke all on public.player_by_roobet from anon;
revoke all on public.player_by_roobet from authenticated;

comment on view public.player_by_roobet is
  'One player per Roobet username, most recently updated wins. Read only from '
  'inside security definer functions, which is where the company-wide view of '
  'it belongs. The view itself is security_invoker and granted to nobody, so '
  'reading it directly gives you your own players or nothing.';


-- ---------------------------------------------------------------------------
-- The same mistake, everywhere else it could be.
--
-- 030 revoked two roles out of three by hand, on one object. Anywhere else in
-- this schema that was done by hand could have the identical gap, and the
-- advisor will not flag those because they are functions and tables, not
-- definer views.
--
-- This reports rather than revokes. A grant to anon is not automatically a
-- bug - nothing here should have one, but "revoke everything the script does
-- not recognise" is how a working app gets broken by a migration at 11pm.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select table_name, privilege_type
      from information_schema.role_table_grants
     where grantee = 'anon'
       and table_schema = 'public'
     order by table_name, privilege_type
  loop
    raise notice 'anon can % on public.%', r.privilege_type, r.table_name;
    n := n + 1;
  end loop;

  if n = 0 then
    raise notice 'anon has no table or view privileges in public. Good.';
  else
    raise notice '% grant(s) to anon above. anon is the key in the browser bundle - check each one is meant to be readable without signing in.', n;
  end if;
end $$;
