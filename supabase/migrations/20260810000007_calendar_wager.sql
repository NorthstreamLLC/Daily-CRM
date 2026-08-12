-- ============================================================================
-- Calendar meetings + wager tracking
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- meetings - manual calendar entries.
--
-- Follow-ups are computed from the funnel and never stored; meetings are the
-- opposite - real appointments someone typed in. Optionally linked to a player,
-- so "call with MH-0088's VIP host" can sit on the day it happens.
-- ---------------------------------------------------------------------------
create table if not exists public.meetings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  player_id   uuid references public.players(id) on delete set null,
  title       text not null,
  notes       text,
  starts_at   timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists meetings_user_time_idx
  on public.meetings (user_id, starts_at);

alter table public.meetings enable row level security;

drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings for insert
  with check (user_id = auth.uid());

drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists meetings_delete on public.meetings;
create policy meetings_delete on public.meetings for delete
  using (user_id = auth.uid() or public.is_admin());


-- ---------------------------------------------------------------------------
-- wager_snapshots - one row per player per sync.
--
-- The leaderboard API reports a running total; keeping every snapshot rather
-- than overwriting one number is what makes "wagered this week" answerable
-- later. players.weighted_wager keeps the latest figure for quick display.
-- ---------------------------------------------------------------------------
create table if not exists public.wager_snapshots (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players(id) on delete cascade,
  wagered      numeric(16,2) not null,
  source       text not null default 'roobet_leaderboard',
  captured_at  timestamptz not null default now()
);

create index if not exists wager_player_time_idx
  on public.wager_snapshots (player_id, captured_at desc);

alter table public.wager_snapshots enable row level security;

-- Visible wherever the player is visible.
drop policy if exists wager_select on public.wager_snapshots;
create policy wager_select on public.wager_snapshots for select
  using (exists (
    select 1 from public.players p
    where p.id = player_id and (p.owner_id = auth.uid() or public.is_admin())
  ));

-- Only the sync writes these, and the sync runs as an admin.
drop policy if exists wager_insert on public.wager_snapshots;
create policy wager_insert on public.wager_snapshots for insert
  with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
