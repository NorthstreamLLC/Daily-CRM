-- ============================================================================
-- Notifications - the things that happen while nobody is looking
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHAT IS STORED HERE, AND WHAT IS NOT
--   Only MOMENTS. A player started wagering. A book was handed over. A
--   deposit was reversed. Things that happened once, at a time, that a rep
--   would otherwise never learn about because they were asleep when the sync
--   ran.
--
--   Standing state is NOT stored - "you have 5 overdue" is computed live on
--   the page. Storing it would mean a row that has to be created when the
--   count rises and deleted when it falls, and would be wrong in between. A
--   number you can recalculate should never be a row you have to maintain.
-- ============================================================================

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,

  kind       text not null check (kind in (
               'wager_started','status_auto','book_assigned',
               'deposit_reversed','churn_risk','system')),

  title      text not null,
  body       text,

  -- Where clicking it should go. Null for things with no single subject.
  player_id  uuid references public.players(id) on delete set null,

  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index if not exists notifications_inbox_idx
  on public.notifications (user_id, created_at desc);

-- The unread count is read on every page load, so it gets its own index.
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

/* Yours only. An admin does NOT get to read a rep's notifications - there is
   nothing in here they cannot see elsewhere, and an inbox is a personal
   space. Admins can still create them, which is how a reassignment tells the
   receiving rep. */
drop policy if exists notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications for select
  using (user_id = auth.uid());

drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert
  with check (public.is_admin() or user_id = auth.uid());


-- ---------------------------------------------------------------------------
-- Mark everything read, in one call rather than one per row.
-- ---------------------------------------------------------------------------
drop function if exists public.mark_notifications_read();

create function public.mark_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.mark_notifications_read() from public;
grant execute on function public.mark_notifications_read() to authenticated;


-- ---------------------------------------------------------------------------
-- Housekeeping: an inbox nobody prunes becomes a table nobody queries fast.
--
-- Read notifications older than 30 days, and anything at all older than 90,
-- are gone. Nothing here is a record of truth - activity_log is. These are
-- just nudges, and a nudge from July is not a nudge.
-- ---------------------------------------------------------------------------
drop function if exists public.prune_notifications();

create function public.prune_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  -- Called by the scheduled sync as the service role, or by an admin.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Admins only.';
  end if;

  delete from public.notifications
   where (read_at is not null and created_at < now() - interval '30 days')
      or created_at < now() - interval '90 days';

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.prune_notifications() from public;
grant execute on function public.prune_notifications() to authenticated;
grant execute on function public.prune_notifications() to service_role;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
