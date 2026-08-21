-- ============================================================================
-- The reference counter has to look at every reference, not just one book
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- THE FAILURE
--   Importing Tuna's book:
--     "Rows 2-320 failed even after renumbering: duplicate key value violates
--      unique constraint players_reference_key"
--
--   "Even after renumbering" means the import had already given up on the
--   sheet's Player IDs and let the trigger assign fresh ones - and the TRIGGER
--   produced duplicates.
--
-- WHY
--   players.reference is UNIQUE ACROSS THE WHOLE TABLE. The counter that feeds
--   the trigger was looking for the highest number in one rep's book:
--
--     from public.players
--      where owner_id = p_user
--        and reference ~ ('^' || v_code || '-[0-9]+$')
--
--   So a TU-0123 sitting under somebody else's owner_id is invisible to it.
--   That happens whenever a player is reassigned, and whenever an import went
--   into the wrong book and was moved - both of which have happened here.
--
--   The counter then reports a highest of, say, 40, the trigger issues TU-0041,
--   and TU-0041 already exists under another owner. Unique constraint, whole
--   chunk lost.
--
-- THE FIX
--   Match on the CODE, not the owner. The code is what appears in the
--   reference, so it is what decides whether a number is taken. Ownership has
--   nothing to do with it - which is the whole point of a globally unique key.
--
--   Also raised the counter past anything found rather than only to the max,
--   so two imports racing cannot land on the same number.
-- ============================================================================

drop function if exists public.sync_reference_counter(uuid);

create function public.sync_reference_counter(p_user uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  highest int;
  v_code  text;
begin
  if not (public.is_admin() or auth.uid() = p_user) then
    raise exception 'Not permitted';
  end if;

  select code into v_code from public.users where id = p_user;
  if v_code is null then raise exception 'No such user'; end if;

  /* EVERY player with this code in their reference, whoever owns them.

     Not `owner_id = p_user`. A reference is unique across the table, so the
     question is "is this number taken", and a number is taken whether or not
     the person holding it still sits in this rep's book. */
  select coalesce(max(nullif(regexp_replace(reference, '^.*-', ''), '')::int), 0)
    into highest
    from public.players
   where reference ~ ('^' || v_code || '-[0-9]+$');

  update public.users
     set next_player_number = greatest(next_player_number, highest + 1)
   where id = p_user;

  return highest + 1;
end $$;

revoke all on function public.sync_reference_counter(uuid) from public;
grant execute on function public.sync_reference_counter(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Repair every counter that is currently behind.
--
-- The bug has been live for every import so far, so any rep whose players have
-- been reassigned may be carrying a counter that will collide on their next
-- import. Fixed now rather than discovered one book at a time.
-- ---------------------------------------------------------------------------
do $$
declare
  r      record;
  h      int;
  fixed  int := 0;
begin
  for r in select id, code, next_player_number from public.users loop
    select coalesce(max(nullif(regexp_replace(reference, '^.*-', ''), '')::int), 0)
      into h
      from public.players
     where reference ~ ('^' || r.code || '-[0-9]+$');

    if h + 1 > r.next_player_number then
      update public.users set next_player_number = h + 1 where id = r.id;
      fixed := fixed + 1;
      raise notice '% counter moved from % to %', r.code, r.next_player_number, h + 1;
    end if;
  end loop;

  raise notice 'Reference counters repaired: %', fixed;
end $$;
