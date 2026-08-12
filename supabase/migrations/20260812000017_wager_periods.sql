-- ============================================================================
-- Exact wager per period, straight from Roobet
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHY THIS REPLACES THE DELTA APPROACH
--   Until now "this month" was DERIVED: latest snapshot minus the last snapshot
--   before the month began. That needs two readings, so a fresh install showed
--   $80m all-time and $0 this month - correct arithmetic, useless answer.
--
--   Roobet's endpoint accepts startDate and endDate. Asking it for
--   1 Aug 00:00 UTC to now returns August's wager exactly. No derivation, no
--   waiting for a second sync, no baseline caveat. Every period is stored as a
--   fact rather than computed from a difference.
--
--   Periods are UTC. Roobet reports in UTC, so a month here is Roobet's month -
--   the same figure the affiliate panel shows and commission is paid on.
-- ============================================================================

create table if not exists public.wager_periods (
  id            uuid primary key default gen_random_uuid(),
  username      text not null,
  source        text not null,
  -- 'all' has period_start 1970-01-01 so the unique key still works.
  period_type   text not null check (period_type in ('all','month','week','day')),
  period_start  date not null,
  wagered       numeric(16,2) not null,
  refreshed_at  timestamptz not null default now(),
  unique (username, source, period_type, period_start)
);

create index if not exists wager_periods_lookup_idx
  on public.wager_periods (period_type, period_start, lower(username));

create index if not exists wager_periods_username_idx
  on public.wager_periods (lower(username), period_type);

alter table public.wager_periods enable row level security;

-- Company-wide money. Admins read and write; the sync runs as an admin.
drop policy if exists wager_periods_admin on public.wager_periods;
create policy wager_periods_admin on public.wager_periods for all
  using (public.is_admin()) with check (public.is_admin());

-- Reps need to see their own players' figures, so a narrow read for usernames
-- that appear in a book they own.
drop policy if exists wager_periods_own on public.wager_periods;
create policy wager_periods_own on public.wager_periods for select
  using (exists (
    select 1 from public.players p
     where lower(btrim(p.roobet_username)) = lower(btrim(wager_periods.username))
       and p.owner_id = auth.uid()
  ));


-- ---------------------------------------------------------------------------
-- Totals for one period, split into claimed and unclaimed.
--
-- Claimed money belongs to a rep; unclaimed is the general book. Both are real
-- revenue, so both are returned - the page decides how to present them.
-- ---------------------------------------------------------------------------
drop function if exists public.wager_period_totals(text, date);

create function public.wager_period_totals(p_type text, p_start date)
returns table (
  source          text,
  wagerers        bigint,
  total           numeric,
  claimed_total   numeric,
  unclaimed_total numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    -- Same player on two codes is the same wagering reported twice; per code
    -- we keep both rows, but each row is one (username, source) fact.
    select wp.source, lower(btrim(wp.username)) as uname, max(wp.wagered) as wagered
      from public.wager_periods wp
     where wp.period_type = p_type and wp.period_start = p_start
     group by wp.source, lower(btrim(wp.username))
  ),
  owned as (
    select distinct lower(btrim(p.roobet_username)) as uname
      from public.players p
     where p.roobet_username is not null and btrim(p.roobet_username) <> ''
  )
  select
    b.source,
    count(*)::bigint,
    coalesce(sum(b.wagered), 0),
    coalesce(sum(b.wagered) filter (where o.uname is not null), 0),
    coalesce(sum(b.wagered) filter (where o.uname is null), 0)
  from best b
  left join owned o on o.uname = b.uname
  group by b.source
  order by 3 desc;
$$;

revoke all on function public.wager_period_totals(text, date) from public;
grant execute on function public.wager_period_totals(text, date) to authenticated;


-- ---------------------------------------------------------------------------
-- Every month on record, newest first - the month-by-month history.
-- ---------------------------------------------------------------------------
drop function if exists public.wager_month_history();

create function public.wager_month_history()
returns table (period_start date, total numeric, wagerers bigint)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select wp.period_start, lower(btrim(wp.username)) as uname, max(wp.wagered) as wagered
      from public.wager_periods wp
     where wp.period_type = 'month'
     group by wp.period_start, lower(btrim(wp.username))
  )
  select b.period_start, coalesce(sum(b.wagered), 0), count(*)::bigint
    from best b
   group by b.period_start
   order by b.period_start desc;
$$;

revoke all on function public.wager_month_history() from public;
grant execute on function public.wager_month_history() to authenticated;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
