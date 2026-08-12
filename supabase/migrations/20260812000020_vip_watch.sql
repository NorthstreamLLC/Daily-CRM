-- ============================================================================
-- VIP watch list, and a rolling-window comparison that works today
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once. Needs 017 and 019 first.
--
-- TWO THINGS HERE
--
-- 1. vip_watch - a player a VIP rep has PUT on the fallen-away list by hand.
--    Detection catches the obvious slides; it cannot know that a whale said
--    something worrying on a call. Pinned players stay until someone takes
--    them off, so the list is not silently rewritten each night.
--
-- 2. wager_window_pairs - each player's last N days against the N before,
--    from the stored daily facts.
--
--    HONEST LIMIT: daily facts only exist from the day syncing started. Ask
--    for 30-vs-30 on day three and the answer covers three days, not thirty.
--    The function returns the number of days it actually found so the page can
--    say which window it is showing rather than implying a month of history
--    that does not exist. Month facts came from the backfill and go back
--    further, which is why the page falls back to those when the daily history
--    is too short to mean anything.
-- ============================================================================

create table if not exists public.vip_watch (
  player_id   uuid primary key references public.players(id) on delete cascade,
  added_by    uuid references public.users(id) on delete set null,
  added_at    timestamptz not null default now(),
  note        text,
  -- Kept rather than deleted, so "we watched them and they recovered" stays
  -- part of the record.
  resolved_at timestamptz
);

create index if not exists vip_watch_open_idx
  on public.vip_watch (added_at desc) where resolved_at is null;

alter table public.vip_watch enable row level security;

-- A rep may watch their own players; an admin may watch anyone's.
drop policy if exists vip_watch_own on public.vip_watch;
create policy vip_watch_own on public.vip_watch for all
  using (
    public.is_admin()
    or exists (
      select 1 from public.players p
       where p.id = vip_watch.player_id and p.owner_id = auth.uid()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.players p
       where p.id = vip_watch.player_id and p.owner_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- Rolling window pairs, per player, from daily facts.
--
-- p_days is the length of each half. Returns current, previous, and how many
-- distinct days of data actually backed each - so a caller can refuse to draw
-- a conclusion from two days of history.
-- ---------------------------------------------------------------------------
drop function if exists public.wager_window_pairs(integer);

create function public.wager_window_pairs(p_days integer default 30)
returns table (
  player_id     uuid,
  owner_id      uuid,
  username      text,
  current_sum   numeric,
  previous_sum  numeric,
  current_days  integer,
  previous_days integer
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      (current_date - (p_days - 1))::date as cur_from,
      current_date                        as cur_to,
      (current_date - (p_days * 2 - 1))::date as prev_from,
      (current_date - p_days)::date       as prev_to
  ),
  daily as (
    -- One figure per player per day: same person on two codes is the same
    -- wagering reported twice.
    select lower(btrim(wp.username)) as uname,
           wp.period_start,
           max(wp.wagered) as wagered
      from public.wager_periods wp, bounds b
     where wp.period_type = 'day'
       and wp.period_start >= b.prev_from
       and wp.period_start <= b.cur_to
     group by lower(btrim(wp.username)), wp.period_start
  ),
  summed as (
    select
      d.uname,
      sum(d.wagered) filter (where d.period_start >= b.cur_from)  as current_sum,
      sum(d.wagered) filter (where d.period_start <= b.prev_to)   as previous_sum,
      count(*) filter (where d.period_start >= b.cur_from)::int   as current_days,
      count(*) filter (where d.period_start <= b.prev_to)::int    as previous_days
    from daily d, bounds b
    group by d.uname
  )
  select
    p.id,
    p.owner_id,
    p.roobet_username,
    coalesce(s.current_sum, 0),
    coalesce(s.previous_sum, 0),
    coalesce(s.current_days, 0),
    coalesce(s.previous_days, 0)
  from public.players p
  join summed s on s.uname = lower(btrim(p.roobet_username))
  where p.roobet_username is not null and btrim(p.roobet_username) <> '';
$$;

revoke all on function public.wager_window_pairs(integer) from public;
grant execute on function public.wager_window_pairs(integer) to authenticated;


-- ---------------------------------------------------------------------------
-- Month-over-month pairs - the fallback with real history behind it.
-- ---------------------------------------------------------------------------
drop function if exists public.wager_month_pairs();

create function public.wager_month_pairs()
returns table (
  player_id    uuid,
  owner_id     uuid,
  username     text,
  current_sum  numeric,
  previous_sum numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with months as (
    select date_trunc('month', current_date)::date               as this_month,
           (date_trunc('month', current_date) - interval '1 month')::date as last_month
  ),
  best as (
    select lower(btrim(wp.username)) as uname,
           wp.period_start,
           max(wp.wagered) as wagered
      from public.wager_periods wp, months m
     where wp.period_type = 'month'
       and wp.period_start in (m.this_month, m.last_month)
     group by lower(btrim(wp.username)), wp.period_start
  ),
  summed as (
    select b.uname,
           sum(b.wagered) filter (where b.period_start = m.this_month) as current_sum,
           sum(b.wagered) filter (where b.period_start = m.last_month) as previous_sum
      from best b, months m
     group by b.uname
  )
  select
    p.id,
    p.owner_id,
    p.roobet_username,
    coalesce(s.current_sum, 0),
    coalesce(s.previous_sum, 0)
  from public.players p
  join summed s on s.uname = lower(btrim(p.roobet_username))
  where p.roobet_username is not null and btrim(p.roobet_username) <> '';
$$;

revoke all on function public.wager_month_pairs() from public;
grant execute on function public.wager_month_pairs() to authenticated;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
