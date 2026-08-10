-- ============================================================================
-- Admin: audit trail, deletion safety, and import support
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- admin_audit - who did what to whom.
--
-- Admin actions change other people's access and other people's numbers. Every
-- one of them is recorded here, append only, so a question like "who deactivated
-- Chella" has an answer. Admins can read it; nobody can edit or delete it.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid not null references public.users(id) on delete restrict,
  action       text not null,
  target_user  uuid references public.users(id) on delete set null,
  detail       jsonb not null default '{}'::jsonb,
  occurred_at  timestamptz not null default now()
);

create index if not exists admin_audit_time_idx on public.admin_audit (occurred_at desc);

alter table public.admin_audit enable row level security;

drop policy if exists admin_audit_select on public.admin_audit;
create policy admin_audit_select on public.admin_audit for select
  using (public.is_admin());

drop policy if exists admin_audit_insert on public.admin_audit;
create policy admin_audit_insert on public.admin_audit for insert
  with check (public.is_admin() and actor_id = auth.uid());


-- ---------------------------------------------------------------------------
-- Deactivating a person must not orphan their book.
--
-- players.owner_id is ON DELETE RESTRICT, so a user with players cannot be
-- deleted - deliberately. Deactivation is the supported path: they can no
-- longer sign in, but their players, history and numbers stay intact and can
-- be reassigned. This function does the reassignment atomically.
-- ---------------------------------------------------------------------------
drop function if exists public.reassign_players(uuid, uuid);

create function public.reassign_players(p_from uuid, p_to uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare moved int;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can reassign players';
  end if;

  if p_from = p_to then
    raise exception 'Cannot reassign a book to its current owner';
  end if;

  if not exists (select 1 from public.users where id = p_to and active) then
    raise exception 'The receiving user must exist and be active';
  end if;

  update public.players set owner_id = p_to where owner_id = p_from;
  get diagnostics moved = row_count;

  insert into public.admin_audit (actor_id, action, target_user, detail)
  values (auth.uid(), 'reassign_players', p_from,
          jsonb_build_object('to', p_to, 'count', moved));

  return moved;
end $$;

revoke all on function public.reassign_players(uuid, uuid) from public;
grant execute on function public.reassign_players(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Import support.
--
-- A rep's reference counter (MH-0088) must jump past anything an import
-- creates, or the next manually added player collides with an imported one.
-- The trigger handles that for rows it generates; this covers references that
-- arrive already set in the file.
-- ---------------------------------------------------------------------------
drop function if exists public.sync_reference_counter(uuid);

create function public.sync_reference_counter(p_user uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare highest int; v_code text;
begin
  if not (public.is_admin() or auth.uid() = p_user) then
    raise exception 'Not permitted';
  end if;

  select code into v_code from public.users where id = p_user;
  if v_code is null then raise exception 'No such user'; end if;

  select coalesce(max(nullif(regexp_replace(reference, '^.*-', ''), '')::int), 0)
    into highest
    from public.players
   where owner_id = p_user
     and reference ~ ('^' || v_code || '-[0-9]+$');

  update public.users
     set next_player_number = greatest(next_player_number, highest + 1)
   where id = p_user;

  return highest + 1;
end $$;

revoke all on function public.sync_reference_counter(uuid) from public;
grant execute on function public.sync_reference_counter(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- import_batches needs to be updatable so a run can be marked finished.
-- ---------------------------------------------------------------------------
drop policy if exists import_update on public.import_batches;
create policy import_update on public.import_batches for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());


-- ---------------------------------------------------------------------------
-- Guard against an import or a bulk edit leaving the funnel without a stage.
-- statuses is referenced by players, so deleting one in use already fails -
-- this gives a readable reason instead of a foreign key error.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_status_in_use() returns trigger
language plpgsql as $$
declare used int;
begin
  select count(*) into used from public.players where status = old.name;
  if used > 0 then
    raise exception 'Cannot delete "%" - % player(s) still use it. Move them first.',
      old.name, used;
  end if;
  return old;
end $$;

drop trigger if exists statuses_prevent_delete on public.statuses;
create trigger statuses_prevent_delete before delete on public.statuses
  for each row execute function public.prevent_status_in_use();


-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
