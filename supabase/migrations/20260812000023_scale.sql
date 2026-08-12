-- ============================================================================
-- Built for 13,000 players, not 20
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- THE PROBLEM THIS SOLVES
--   The Today page is the most-loaded screen in the product - every rep, many
--   times a day. It was fetching roughly the whole company on every load:
--
--     getChurn pulled EVERY player with any wager (up to 50,000 rows), sent
--     them across the wire, and then discarded the ones belonging to other
--     reps in JavaScript. At 13,000 players that is 13,000 rows fetched to
--     display at most ten.
--
--     getDeadLeads fetched 500 rows to render 8.
--
--   Neither was noticeable with 20 players. Both are ruinous with 13,000, and
--   they get worse in exact proportion to how successful the team is.
--
--   The fix is the same in both cases: decide in the database, send back only
--   what is displayed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Churn, computed in Postgres.
--
-- Returns only the players actually flagged, already ordered by what is being
-- lost. Owner filtering happens here, so a rep's page never touches another
-- rep's rows at all - which is both faster and a tighter privacy boundary
-- than filtering after the fact.
-- ---------------------------------------------------------------------------
drop function if exists public.churn_players(uuid, integer, numeric, numeric, integer);

create function public.churn_players(
  p_owner uuid    default null,
  p_days  integer default 30,
  p_drop  numeric default 50,
  p_min   numeric default 100,
  p_limit integer default 40
)
returns table (
  id           uuid,
  handle       text,
  reference    text,
  roobet_username text,
  status       text,
  owner_id     uuid,
  owner_name   text,
  all_time     numeric,
  current_sum  numeric,
  previous_sum numeric,
  pinned       boolean,
  pinned_note  text,
  basis        text
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select (current_date - (p_days - 1))::date      as cur_from,
           (current_date - (p_days * 2 - 1))::date  as prev_from,
           (current_date - p_days)::date            as prev_to,
           date_trunc('month', current_date)::date  as this_month,
           (date_trunc('month', current_date) - interval '1 month')::date as last_month
  ),
  -- How much daily history actually exists. Early on there is not enough for
  -- a 30-day window to mean anything, so the month figures are used instead.
  coverage as (
    select count(distinct wp.period_start) as days
      from public.wager_periods wp, bounds b
     where wp.period_type = 'day' and wp.period_start >= b.prev_from
  ),
  daily as (
    select lower(btrim(wp.username)) as uname,
           sum(wp.wagered) filter (where wp.period_start >= b.cur_from) as cur,
           sum(wp.wagered) filter (where wp.period_start <= b.prev_to)  as prev
      from public.wager_periods wp, bounds b
     where wp.period_type = 'day'
       and wp.period_start >= b.prev_from
     group by lower(btrim(wp.username))
  ),
  monthly as (
    select lower(btrim(wp.username)) as uname,
           sum(wp.wagered) filter (where wp.period_start = b.this_month) as cur,
           sum(wp.wagered) filter (where wp.period_start = b.last_month) as prev
      from public.wager_periods wp, bounds b
     where wp.period_type = 'month'
       and wp.period_start in (b.this_month, b.last_month)
     group by lower(btrim(wp.username))
  ),
  pairs as (
    select
      coalesce(d.uname, m.uname) as uname,
      case when (select days from coverage) >= p_days + 7
           then coalesce(d.cur, 0) else coalesce(m.cur, 0) end as cur,
      case when (select days from coverage) >= p_days + 7
           then coalesce(d.prev, 0) else coalesce(m.prev, 0) end as prev,
      case when (select days from coverage) >= p_days + 7
           then 'rolling' else 'month' end as basis
    from daily d
    full outer join monthly m on m.uname = d.uname
  )
  select
    p.id,
    p.handle,
    p.reference,
    p.roobet_username,
    p.status,
    p.owner_id,
    u.name,
    coalesce(p.weighted_wager, 0),
    coalesce(pr.cur, 0),
    coalesce(pr.prev, 0),
    (w.player_id is not null),
    w.note,
    coalesce(pr.basis, 'none')
  from public.players p
  join public.users u on u.id = p.owner_id
  left join pairs pr on pr.uname = lower(btrim(p.roobet_username))
  left join public.vip_watch w
         on w.player_id = p.id and w.resolved_at is null
  where (p_owner is null or p.owner_id = p_owner)
    and (
      -- Pinned by a person: always listed, no threshold applies.
      w.player_id is not null
      or (
        p.status <> 'Dead Lead'
        and coalesce(p.weighted_wager, 0) > p_min
        and coalesce(pr.prev, 0) > 0
        and (
          coalesce(pr.cur, 0) <= 0
          or coalesce(pr.cur, 0) / nullif(pr.prev, 0) < p_drop / 100.0
        )
      )
    )
  order by (coalesce(pr.prev, 0) - coalesce(pr.cur, 0)) desc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$$;

revoke all on function public.churn_players(uuid, integer, numeric, numeric, integer) from public;
grant execute on function public.churn_players(uuid, integer, numeric, numeric, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- Keep wager_periods from growing without limit.
--
-- Daily rows are the fast-growing part: roughly (wagerers x codes) rows every
-- single day. At 850 wagerers on 5 codes that is ~4,250 rows a day, about
-- 1.5 million a year, and it never stops.
--
-- Only the last two months of daily rows are ever read - the 30-day-versus-30
-- comparison. Months, weeks and all-time are kept forever: they are small,
-- and they are the reporting history.
--
-- Deliberately a function rather than an automatic trigger, so deleting data
-- is always something a person chose to do.
-- ---------------------------------------------------------------------------
drop function if exists public.prune_wager_days(integer);

create function public.prune_wager_days(p_keep_days integer default 75)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare removed integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only.';
  end if;

  -- Never prune below what the churn comparison needs.
  if p_keep_days < 70 then
    p_keep_days := 70;
  end if;

  delete from public.wager_periods
   where period_type = 'day'
     and period_start < (current_date - p_keep_days)::date;

  get diagnostics removed = row_count;
  return removed;
end $$;

revoke all on function public.prune_wager_days(integer) from public;
grant execute on function public.prune_wager_days(integer) to authenticated;


-- ---------------------------------------------------------------------------
-- Indexes for the paths that now matter at volume.
-- ---------------------------------------------------------------------------

-- Churn filters a rep's players by wager.
create index if not exists players_owner_wager_idx
  on public.players (owner_id, weighted_wager desc);

-- The Book's default sort, per rep.
create index if not exists players_owner_updated_idx
  on public.players (owner_id, updated_at desc);

-- Dead-lead list per rep.
create index if not exists players_owner_status_contact_idx
  on public.players (owner_id, status, last_contact_at);

/* That index starts with (owner_id, status), so it answers everything the
   original two-column index answered. Keeping both would mean paying for two
   index writes on every player update to serve one read. */
drop index if exists public.players_owner_status_idx;

analyze public.players;
analyze public.wager_periods;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
