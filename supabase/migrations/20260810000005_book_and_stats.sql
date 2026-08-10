-- ============================================================================
-- Book, stats and the team-wide duplicate check
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHAT IT ADDS
--   find_handle_owner()   warns you when a player already exists in ANY rep's
--                         book, without exposing that rep's book to you
--   search indexes        so the Book page stays fast as it grows
-- ============================================================================


-- ---------------------------------------------------------------------------
-- TEAM-WIDE DUPLICATE CHECK
--
-- Two reps working the same player was invisible in the spreadsheets - each
-- file only knew about itself. Row Level Security means a rep genuinely cannot
-- read another rep's players, so this question cannot be answered by a normal
-- query.
--
-- SECURITY DEFINER steps outside RLS to answer one narrow question: does this
-- handle exist, and if so whose is it. It returns the owner's name and the
-- status - deliberately not the notes, the Roobet username, or anything else.
-- ---------------------------------------------------------------------------
drop function if exists public.find_handle_owner(text);

create function public.find_handle_owner(p_handle text)
returns table (
  reference  text,
  owner_name text,
  status     text,
  is_mine    boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.reference,
    u.name,
    p.status,
    (p.owner_id = auth.uid()) as is_mine
  from public.players p
  join public.users u on u.id = p.owner_id
  where lower(btrim(p.handle)) = lower(btrim(p_handle))
    and btrim(coalesce(p_handle, '')) <> ''
    -- Only answers for someone who is actually signed in.
    and auth.uid() is not null
  order by (p.owner_id = auth.uid()) desc, p.created_at
  limit 5;
$$;

revoke all on function public.find_handle_owner(text) from public;
grant execute on function public.find_handle_owner(text) to authenticated;


-- ---------------------------------------------------------------------------
-- SEARCH AND SORT INDEXES
--
-- The Book page searches handle, Roobet username and reference, and sorts by
-- several columns. Without these each search is a full scan of the table.
-- ---------------------------------------------------------------------------
create index if not exists players_handle_global_idx
  on public.players (lower(btrim(handle)));

create index if not exists players_roobet_idx
  on public.players (lower(btrim(roobet_username)))
  where roobet_username is not null;

create index if not exists players_reference_idx
  on public.players (reference);

create index if not exists players_owner_assigned_idx
  on public.players (owner_id, assigned_at desc);

create index if not exists players_owner_source_idx
  on public.players (owner_id, source);


-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
