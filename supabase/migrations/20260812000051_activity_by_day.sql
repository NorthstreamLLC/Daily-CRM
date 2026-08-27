-- ============================================================================
-- Who did what, per rep, per day
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHY
--   A manager asking "who logged what yesterday" had nowhere to look. Stats
--   answers it for one rep at a time, in windows, mixed with targets and
--   funnels. Nothing showed the team side by side across days.
--
-- COUNTED HERE, NOT IN JAVASCRIPT
--   Deliberate, and not a style preference. The leaderboard once read "Clear"
--   for a rep with 176 people waiting because it fetched rows and counted them
--   in the app - PostgREST capped the response and the tail vanished silently.
--   A feed over activity_log would hit exactly the same wall, and faster:
--   thirteen reps generate hundreds of rows a day.
--
--   One row per rep per day comes back instead. It cannot be truncated into a
--   wrong answer, only into fewer days.
--
-- THE DAY BOUNDARY IS THE REP'S OWN
--   A rep in Manila and one in London do not share a "yesterday". Grouping by
--   UTC would put half of somebody's evening on the wrong row and make their
--   Monday look empty. Each event is bucketed in the timezone of the person it
--   belongs to.
-- ============================================================================

drop function if exists public.activity_by_day(integer, uuid);

create function public.activity_by_day(
  p_days  integer default 14,
  p_owner uuid default null
)
returns table (
  day             date,
  user_id         uuid,
  user_name       text,
  leads           bigint,
  contacts        bigint,
  vip_transfers   bigint,
  deposits        bigint,
  notes           bigint,
  total           bigint
)
language sql
stable
security invoker            -- RLS on activity_log decides what is visible
set search_path = public
as $$
  select
    (a.occurred_at at time zone u.timezone)::date            as day,
    u.id,
    u.name,
    count(*) filter (where a.event_type = 'player_created')  as leads,
    count(*) filter (where a.event_type = 'task_completed')  as contacts,
    count(*) filter (
      where a.event_type = 'status_change' and a.to_status = 'VIP Transferred'
    )                                                        as vip_transfers,
    count(*) filter (
      where a.event_type = 'status_change'
        and a.to_status in ('First Deposit', 'Active')
    )                                                        as deposits,
    count(*) filter (where a.event_type = 'note_added')      as notes,
    count(*)                                                 as total
  from public.activity_log a
  join public.users u on u.id = a.user_id
  where a.player_id is not null      -- deleted players stop counting
    and a.occurred_at >= (now() - make_interval(days => p_days))
    and (p_owner is null or a.user_id = p_owner)
  group by 1, 2, 3
  order by 1 desc, 3;
$$;

revoke all on function public.activity_by_day(integer, uuid) from public;
revoke all on function public.activity_by_day(integer, uuid) from anon;
grant execute on function public.activity_by_day(integer, uuid) to authenticated;

comment on function public.activity_by_day(integer, uuid) is
  'Logged work per rep per day, bucketed in each rep''s own timezone. '
  'security invoker, so activity_log''s policies scope it: an admin sees the '
  'team, a rep sees themselves.';


-- ---------------------------------------------------------------------------
-- Make sure a rep can read their OWN activity.
--
-- The feed is useless to a rep if the table refuses them their own rows, and
-- the point of showing it to them is that a wrong stat becomes something they
-- can query with evidence rather than a feeling.
--
-- Their own only. Reading another rep's log would turn this into a ranking
-- nobody asked for.
-- ---------------------------------------------------------------------------
drop policy if exists activity_log_own_read on public.activity_log;
create policy activity_log_own_read on public.activity_log
  for select using (user_id = auth.uid() or public.is_admin());


-- ---------------------------------------------------------------------------
-- The feed reads a fortnight at a time, filtered by user. Existing indexes are
-- (user_id, occurred_at desc) and (event_type, occurred_at desc); neither
-- serves "everybody, last 14 days" well.
-- ---------------------------------------------------------------------------
create index if not exists activity_time_idx
  on public.activity_log (occurred_at desc)
  where player_id is not null;

analyze public.activity_log;
