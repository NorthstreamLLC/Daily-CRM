-- ============================================================================
-- Whose book is this, exactly?
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- THE BUG
--   Prime's own Stats page showed 244 players. Prime has one.
--
--   player_counts_by_status() counts every player in the company:
--
--     select p.status, count(*) from public.players p group by p.status;
--
--   ...with no owner filter, and `security definer`, which BYPASSES row level
--   security entirely. The call site said:
--
--     // RLS scopes this to the viewer's own players
--
--   That comment was wrong. security definer is precisely the thing that stops
--   RLS applying. The funnel on every rep's personal Stats page has been the
--   whole company's book all along - so a rep could read the size and shape of
--   everyone else's pipeline from their own page.
--
--   This is the same mistake as the queue bug: leaning on RLS to answer "is
--   this mine", when RLS only answers "may I see this". Here it did not even
--   get that far, because definer skips the question.
--
--   Both functions now take an owner. Null still means everyone, for the
--   genuinely company-wide views, but a caller has to ask for that explicitly
--   rather than getting it by accident.
-- ============================================================================

drop function if exists public.player_counts_by_status();
drop function if exists public.player_counts_by_status(uuid);

create function public.player_counts_by_status(p_owner uuid default null)
returns table (status text, players bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.status, count(*)::bigint
    from public.players p
   where p_owner is null or p.owner_id = p_owner
   group by p.status;
$$;

revoke all on function public.player_counts_by_status(uuid) from public;
grant execute on function public.player_counts_by_status(uuid) to authenticated;

comment on function public.player_counts_by_status(uuid) is
  'Book composition. Pass an owner for one rep; null means the whole company, '
  'which callers must ask for deliberately - this function is security '
  'definer, so row level security does NOT scope it for you.';


drop function if exists public.player_counts_by_source();
drop function if exists public.player_counts_by_source(uuid);

create function public.player_counts_by_source(p_owner uuid default null)
returns table (source text, players bigint)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.source, 'Unknown'), count(*)::bigint
    from public.players p
   where p_owner is null or p.owner_id = p_owner
   group by coalesce(p.source, 'Unknown');
$$;

revoke all on function public.player_counts_by_source(uuid) from public;
grant execute on function public.player_counts_by_source(uuid) to authenticated;
