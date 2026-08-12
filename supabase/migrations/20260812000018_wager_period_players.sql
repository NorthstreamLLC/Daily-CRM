-- ============================================================================
-- Per-player wager for any period
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once. Needs 20260812000017_wager_periods.sql first.
--
-- WHAT THIS ADDS
--   017 answered "how much did the company wager in August". This answers
--   "who wagered it" - every player in a given period, biggest first, with the
--   rep who owns them where there is one. Unclaimed players are included on
--   purpose: they are real money, and hiding them would make the per-player
--   list disagree with the totals above it.
--
--   Same period vocabulary as 017: 'all' | 'month' | 'week' | 'day', with a UTC
--   period_start date. So the same function serves today, this week, this
--   month, and any month in the archive.
-- ============================================================================

drop function if exists public.wager_period_players(text, date, text, integer, integer);

create function public.wager_period_players(
  p_type   text,
  p_start  date,
  p_search text default '',
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  username    text,
  wagered     numeric,
  sources     text,
  player_id   uuid,
  owner_name  text,
  status      text,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    -- One row per player per code, then the player's total across codes is the
    -- largest single code rather than the sum: the same person appearing under
    -- two codes is the same wagering reported twice, not double the money.
    select
      lower(btrim(wp.username)) as uname,
      max(wp.username)          as display,
      max(wp.wagered)           as wagered,
      string_agg(distinct wp.source, ', ' order by wp.source) as sources
    from (
      select wp.username, wp.source, max(wp.wagered) as wagered
        from public.wager_periods wp
       where wp.period_type = p_type
         and wp.period_start = p_start
       group by wp.username, wp.source
    ) wp
    group by lower(btrim(wp.username))
  ),
  joined as (
    select
      b.display as username,
      b.wagered,
      b.sources,
      p.id       as player_id,
      u.name     as owner_name,
      p.status
    from best b
    left join lateral (
      select pl.id, pl.owner_id, pl.status
        from public.players pl
       where lower(btrim(pl.roobet_username)) = b.uname
       order by pl.updated_at desc nulls last
       limit 1
    ) p on true
    left join public.users u on u.id = p.owner_id
    where b.wagered > 0
      and (
        coalesce(btrim(p_search), '') = ''
        or b.uname like '%' || lower(btrim(p_search)) || '%'
      )
  )
  select
    j.username,
    j.wagered,
    j.sources,
    j.player_id,
    j.owner_name,
    j.status,
    count(*) over ()::bigint as total_count
  from joined j
  order by j.wagered desc
  limit greatest(1, least(coalesce(p_limit, 50), 500))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.wager_period_players(text, date, text, integer, integer) from public;
grant execute on function public.wager_period_players(text, date, text, integer, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- Per-rep totals for a period.
--
-- Same facts, grouped by who owns the player. This replaces the old approach
-- of subtracting one snapshot from another, which showed zero for "this month"
-- until a second sync had run. A rep only counts money from players actually
-- in their book, which is what commission is paid on.
-- ---------------------------------------------------------------------------
drop function if exists public.wager_period_by_rep(text, date);

create function public.wager_period_by_rep(p_type text, p_start date)
returns table (
  owner_id   uuid,
  owner_name text,
  players    bigint,
  wagered    numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select
      lower(btrim(wp.username)) as uname,
      max(wp.wagered)           as wagered
    from (
      select wp.username, wp.source, max(wp.wagered) as wagered
        from public.wager_periods wp
       where wp.period_type = p_type
         and wp.period_start = p_start
       group by wp.username, wp.source
    ) wp
    group by lower(btrim(wp.username))
  ),
  owned as (
    -- One owner per username. If the same username somehow sits in two books,
    -- the most recently touched row wins rather than the money being counted
    -- twice.
    select distinct on (lower(btrim(p.roobet_username)))
           lower(btrim(p.roobet_username)) as uname,
           p.owner_id
      from public.players p
     where p.roobet_username is not null and btrim(p.roobet_username) <> ''
     order by lower(btrim(p.roobet_username)), p.updated_at desc nulls last
  )
  select
    u.id,
    u.name,
    count(*)::bigint,
    coalesce(sum(b.wagered), 0)
  from best b
  join owned o on o.uname = b.uname
  join public.users u on u.id = o.owner_id
  where b.wagered > 0
  group by u.id, u.name
  order by 4 desc;
$$;

revoke all on function public.wager_period_by_rep(text, date) from public;
grant execute on function public.wager_period_by_rep(text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
