-- ============================================================================
-- The company-wide wager ledger
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHY THIS EXISTS
--   The first sync proved the point: 751 wagerers came back from one code and
--   0 matched a CRM player, because most wagering comes from the general book -
--   people who found a code on their own. Storing wager only for CRM players
--   throws that away.
--
--   This table records EVERY leaderboard entry, keyed by username + source.
--   Company totals come from here, complete. Player-level attribution still
--   comes from wager_snapshots, which the sync fills for matched players - and
--   when a username is later added to someone's book, its history here is
--   copied across, so claiming a player brings their past with them.
-- ============================================================================

create table if not exists public.wager_external (
  id           uuid primary key default gen_random_uuid(),
  username     text not null,
  source       text not null,
  wagered      numeric(16,2) not null,
  captured_at  timestamptz not null default now()
);

create index if not exists wager_external_pair_idx
  on public.wager_external (lower(username), source, captured_at desc);
create index if not exists wager_external_time_idx
  on public.wager_external (captured_at);

alter table public.wager_external enable row level security;

-- Company-wide money data: admins only, in both directions.
drop policy if exists wager_external_admin on public.wager_external;
create policy wager_external_admin on public.wager_external for all
  using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- Window deltas over the ledger - same running-total subtraction as
-- wager_deltas, but keyed by (username, source) so it covers everyone,
-- in a book or not.
-- ---------------------------------------------------------------------------
drop function if exists public.wager_external_deltas(timestamptz, timestamptz);

create function public.wager_external_deltas(p_start timestamptz, p_end timestamptz)
returns table (username text, source text, delta numeric)
language sql
stable
security invoker
as $$
  with pairs as (
    select distinct lower(we.username) as uname, we.source
    from public.wager_external we
    where we.captured_at > p_start and we.captured_at <= p_end
  ),
  measured as (
    select
      pr.uname,
      pr.source,
      (select w.wagered from public.wager_external w
        where lower(w.username) = pr.uname and w.source = pr.source
          and w.captured_at <= p_start
        order by w.captured_at desc limit 1) as baseline,
      (select w.wagered from public.wager_external w
        where lower(w.username) = pr.uname and w.source = pr.source
          and w.captured_at > p_start and w.captured_at <= p_end
        order by w.captured_at asc limit 1) as first_in,
      (select w.wagered from public.wager_external w
        where lower(w.username) = pr.uname and w.source = pr.source
          and w.captured_at > p_start and w.captured_at <= p_end
        order by w.captured_at desc limit 1) as last_in
    from pairs pr
  )
  select
    m.uname as username,
    m.source,
    greatest(m.last_in - coalesce(m.baseline, m.first_in), 0) as delta
  from measured m
  where m.last_in is not null;
$$;

revoke all on function public.wager_external_deltas(timestamptz, timestamptz) from public;
grant execute on function public.wager_external_deltas(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
