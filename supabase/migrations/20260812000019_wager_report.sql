-- ============================================================================
-- One reporting function for every period
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once. Needs 017 and 018 first.
--
-- WHY THIS REPLACES THE OLD REPORT
--   The report was built on wager_deltas: the difference between two
--   snapshots. That is why it showed $0 next to $81m - it needed a reading
--   from before the window, and for most windows there was not one. It also
--   only ever saw players already in a book, so the 841 usernames wagering on
--   our codes with no owner counted for nothing.
--
--   This reads the stored facts instead, and includes everyone. A username
--   with no owner shows with a blank rep rather than being dropped, because
--   money that arrived is money that arrived.
--
-- PERIODS
--   'all'   - lifetime, p_from and p_to ignored
--   'week'  - the stored week beginning p_from
--   'month' - every stored month from p_from to p_to inclusive. One month and
--             a full year are the same query, which is why a year needs no
--             special case.
-- ============================================================================

drop function if exists public.wager_report_rows(text, date, date, uuid, integer);

create function public.wager_report_rows(
  p_type   text,
  p_from   date,
  p_to     date default null,
  p_owner  uuid default null,
  p_limit  integer default 5000
)
returns table (
  username    text,
  wagered     numeric,
  sources     text,
  player_id   uuid,
  reference   text,
  handle      text,
  owner_id    uuid,
  owner_name  text,
  status      text,
  all_time    numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select wp.username, wp.source, wp.period_start, wp.wagered
      from public.wager_periods wp
     where (p_type = 'all'   and wp.period_type = 'all')
        or (p_type = 'week'  and wp.period_type = 'week'  and wp.period_start = p_from)
        or (p_type = 'day'   and wp.period_type = 'day'   and wp.period_start = p_from)
        or (p_type = 'month' and wp.period_type = 'month'
            and wp.period_start >= p_from
            and wp.period_start <= coalesce(p_to, p_from))
  ),
  per_code as (
    -- One figure per player per code per period slice.
    select username, source, period_start, max(wagered) as wagered
      from scoped
     group by username, source, period_start
  ),
  per_slice as (
    -- Across codes, the same person is the same wagering reported twice, so
    -- the largest single code wins rather than the sum.
    select lower(btrim(username)) as uname,
           max(username)          as display,
           period_start,
           max(wagered)           as wagered,
           string_agg(distinct source, ', ' order by source) as sources
      from per_code
     group by lower(btrim(username)), period_start
  ),
  totalled as (
    -- Across months, the slices DO add up - they are separate windows.
    select uname,
           max(display) as display,
           sum(wagered) as wagered,
           string_agg(distinct sources, ', ') as sources
      from per_slice
     group by uname
  ),
  lifetime as (
    select lower(btrim(wp.username)) as uname, max(wp.wagered) as wagered
      from public.wager_periods wp
     where wp.period_type = 'all'
     group by lower(btrim(wp.username))
  )
  select
    t.display,
    t.wagered,
    t.sources,
    p.id,
    p.reference,
    p.handle,
    p.owner_id,
    u.name,
    p.status,
    coalesce(l.wagered, 0)
  from totalled t
  left join lateral (
    select pl.id, pl.reference, pl.handle, pl.owner_id, pl.status
      from public.players pl
     where lower(btrim(pl.roobet_username)) = t.uname
     order by pl.updated_at desc nulls last
     limit 1
  ) p on true
  left join public.users u on u.id = p.owner_id
  left join lifetime l on l.uname = t.uname
  where t.wagered > 0
    -- A rep filter means "this rep's players". Unowned rows are not theirs.
    and (p_owner is null or p.owner_id = p_owner)
  order by t.wagered desc
  limit greatest(1, least(coalesce(p_limit, 5000), 100000));
$$;

revoke all on function public.wager_report_rows(text, date, date, uuid, integer) from public;
grant execute on function public.wager_report_rows(text, date, date, uuid, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- Mark one wagerer as pre-existing.
--
-- The bulk "mark all as pre-existing" already exists. This is the same idea
-- for a single username, so a list can be cleared one row at a time as each is
-- recognised rather than all or nothing.
-- ---------------------------------------------------------------------------
drop function if exists public.retire_one_wagerer(text);

create function public.retire_one_wagerer(p_username text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only.';
  end if;

  insert into public.wager_ignored (username, reason, ignored_by)
  values (btrim(p_username), 'pre-existing', auth.uid())
  on conflict (username) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.retire_one_wagerer(text) from public;
grant execute on function public.retire_one_wagerer(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Put a wagerer back on the list, in case one was retired by mistake.
-- ---------------------------------------------------------------------------
drop function if exists public.unretire_one_wagerer(text);

create function public.unretire_one_wagerer(p_username text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only.';
  end if;

  delete from public.wager_ignored
   where lower(btrim(username)) = lower(btrim(p_username));

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.unretire_one_wagerer(text) from public;
grant execute on function public.unretire_one_wagerer(text) to authenticated;


-- ---------------------------------------------------------------------------
-- Per-player list, now carrying the pre-existing flag.
--
-- Replaces the version in 018. The flag lets one list do the job the separate
-- "Unclaimed wagerers" panel was doing: a row can be recognised and retired
-- where it sits, instead of being managed somewhere else.
-- ---------------------------------------------------------------------------
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
  ignored     boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
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
      p.status,
      (i.username is not null) as ignored
    from best b
    left join lateral (
      select pl.id, pl.owner_id, pl.status
        from public.players pl
       where lower(btrim(pl.roobet_username)) = b.uname
       order by pl.updated_at desc nulls last
       limit 1
    ) p on true
    left join public.users u on u.id = p.owner_id
    left join public.wager_ignored i on lower(btrim(i.username)) = b.uname
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
    j.ignored,
    count(*) over ()::bigint as total_count
  from joined j
  order by j.wagered desc
  limit greatest(1, least(coalesce(p_limit, 50), 500))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.wager_period_players(text, date, text, integer, integer) from public;
grant execute on function public.wager_period_players(text, date, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
