-- ============================================================================
-- The names behind a number on the Activity page
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHY
--   The Activity page says "Tuna, 14 leads added, Tuesday". Useful for a
--   glance and useless for a conversation - a manager asking "which fourteen"
--   had to go to the Book, filter by Added, and count. A number nobody can open
--   is a number people either take on faith or argue about.
--
-- SCOPE, AGAIN, IS THE DATABASE'S
--   security invoker, so activity_log's policies apply: an admin can open any
--   rep's day, a rep can only open their own. Nothing in the app decides that,
--   which is the whole point - the app deciding scope is what showed every rep
--   the company's funnel and put other people's work on an admin's Today.
--
-- THE DAY IS THE REP'S OWN DAY
--   Same rule as activity_by_day. Bucketing in UTC would make a Manila rep's
--   evening land on tomorrow, and the drill-down would disagree with the
--   summary it was opened from - which is the exact class of bug this codebase
--   has produced over and over: the same question answered twice, differently.
-- ============================================================================

drop function if exists public.activity_players(date, uuid, text);

create function public.activity_players(
  p_day  date,
  p_user uuid,
  p_kind text
)
returns table (
  player_id   uuid,
  reference   text,
  handle      text,
  status      text,
  source      text,
  occurred_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    p.reference,
    p.handle,
    p.status,
    p.source,
    a.occurred_at
  from public.activity_log a
  join public.players p on p.id = a.player_id
  join public.users   u on u.id = a.user_id
  where a.user_id = p_user
    and (a.occurred_at at time zone u.timezone)::date = p_day
    and case p_kind
          when 'leads'    then a.event_type = 'player_created'
          when 'contacts' then a.event_type = 'task_completed'
          when 'vip'      then a.event_type = 'status_change'
                            and a.to_status = 'VIP Transferred'
          when 'deposits' then a.event_type = 'status_change'
                            and a.to_status in ('First Deposit', 'Active')
          else false
        end
  order by a.occurred_at;
$$;

revoke all on function public.activity_players(date, uuid, text) from public;
revoke all on function public.activity_players(date, uuid, text) from anon;
grant execute on function public.activity_players(date, uuid, text) to authenticated;

comment on function public.activity_players(date, uuid, text) is
  'The players behind one cell of the Activity page. security invoker, so a '
  'rep can only open their own day.';
