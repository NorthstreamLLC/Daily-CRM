-- ============================================================================
-- Watch anyone who wagers, not just anyone in a book
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHY
--   vip_watch was keyed on player_id, so only somebody already in a rep's book
--   could be flagged as falling off. That is about twenty people out of eight
--   hundred and eighty.
--
--   The other 860 are the interesting ones for this purpose: they wager on the
--   codes, nobody owns them, and when one of them stops it is worth knowing -
--   arguably more so than when a tracked lead cools off, because nobody is
--   watching them at all.
--
-- THE CHANGE
--   Watch by Roobet username instead. player_id becomes optional context
--   rather than the key.
--
--   If a watched username is later claimed into a book, the watch is already
--   about the username, so it follows them without anything needing to move.
--
-- WHAT SURVIVES
--   Existing watches are migrated by looking up each player's Roobet username.
--   A watched player with no username cannot be carried across - there is
--   nothing to key on - so those are reported rather than silently dropped.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add the username, backfill it, then make it the key.
-- ---------------------------------------------------------------------------
alter table public.vip_watch
  add column if not exists username text;

update public.vip_watch w
   set username = lower(btrim(p.roobet_username))
  from public.players p
 where p.id = w.player_id
   and w.username is null
   and p.roobet_username is not null
   and btrim(p.roobet_username) <> '';

/* Anything still without a username was a watch on a player who has no Roobet
   name. There is nothing to key it on, and inventing one would be worse than
   losing it - so it goes, loudly, in the notice below rather than quietly. */
do $$
declare v_orphans integer;
begin
  select count(*) into v_orphans from public.vip_watch where username is null;
  if v_orphans > 0 then
    raise notice 'Dropping % watch(es) on players with no Roobet username - nothing to key them on.', v_orphans;
    delete from public.vip_watch where username is null;
  end if;
end $$;

-- player_id stops being the primary key and becomes optional context.
alter table public.vip_watch drop constraint if exists vip_watch_pkey;
alter table public.vip_watch alter column player_id drop not null;
alter table public.vip_watch alter column username set not null;

-- One watch per username. Re-watching updates rather than duplicating.
create unique index if not exists vip_watch_username_key
  on public.vip_watch (lower(btrim(username)));

create index if not exists vip_watch_player_idx
  on public.vip_watch (player_id) where player_id is not null;

comment on column public.vip_watch.username is
  'The Roobet username being watched. The key, so a wagerer with no player '
  'record can be flagged and so a watch follows them if they are later '
  'claimed into a book.';

comment on column public.vip_watch.player_id is
  'Set when the username matches a player. Context, not identity - it can be '
  'null, and it can arrive later.';


-- ---------------------------------------------------------------------------
-- 2. Watch or unwatch a username.
--
-- Admin only: this is a company-wide list about people who are, by definition,
-- in nobody's book, so there is no owner to scope it by.
-- ---------------------------------------------------------------------------
drop function if exists public.set_wagerer_watch(text, boolean, text);

create function public.set_wagerer_watch(
  p_username text,
  p_watching boolean,
  p_note     text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uname text := lower(btrim(p_username));
  v_player uuid;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only.';
  end if;
  if v_uname = '' then
    raise exception 'No username given.';
  end if;

  if p_watching then
    -- Attach the player if there is one, so the row carries context.
    select pl.id into v_player
      from public.players pl
     where lower(btrim(pl.roobet_username)) = v_uname
     order by pl.updated_at desc nulls last
     limit 1;

    insert into public.vip_watch (username, player_id, added_by, note)
    values (btrim(p_username), v_player, auth.uid(), p_note)
    on conflict (lower(btrim(username)))
    do update set resolved_at = null,
                  player_id   = coalesce(excluded.player_id, vip_watch.player_id),
                  note        = coalesce(excluded.note, vip_watch.note);
    get diagnostics v_count = row_count;
  else
    /* Resolved, not deleted - "we watched them and they came back" is worth
       keeping, and it is the only way to tell a recovery from a mistake. */
    update public.vip_watch
       set resolved_at = now()
     where lower(btrim(username)) = v_uname
       and resolved_at is null;
    get diagnostics v_count = row_count;
  end if;

  return v_count;
end $$;

revoke all on function public.set_wagerer_watch(text, boolean, text) from public;
grant execute on function public.set_wagerer_watch(text, boolean, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 3. Who is being watched, with their wager.
-- ---------------------------------------------------------------------------
drop function if exists public.watched_wagerers();

create function public.watched_wagerers()
returns table (
  username    text,
  player_id   uuid,
  handle      text,
  owner_name  text,
  note        text,
  added_at    timestamptz,
  all_time    numeric,
  this_month  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with lifetime as (
    select lower(btrim(wp.username)) as uname, max(wp.wagered) as wagered
      from public.wager_periods wp
     where wp.period_type = 'all'
     group by lower(btrim(wp.username))
  ),
  month as (
    select lower(btrim(wp.username)) as uname, max(wp.wagered) as wagered
      from public.wager_periods wp
     where wp.period_type = 'month'
       and wp.period_start = date_trunc('month', now() at time zone 'utc')::date
     group by lower(btrim(wp.username))
  )
  select
    w.username,
    p.id,
    p.handle,
    u.name,
    w.note,
    w.added_at,
    coalesce(l.wagered, 0),
    coalesce(m.wagered, 0)
  from public.vip_watch w
  left join public.player_by_roobet p on p.uname = lower(btrim(w.username))
  left join public.users u on u.id = p.owner_id
  left join lifetime l on l.uname = lower(btrim(w.username))
  left join month    m on m.uname = lower(btrim(w.username))
  where w.resolved_at is null
  order by coalesce(l.wagered, 0) desc;
$$;

revoke all on function public.watched_wagerers() from public;
grant execute on function public.watched_wagerers() to authenticated;


-- ---------------------------------------------------------------------------
-- 4. churn_players now finds a watch by username.
--
-- Reprinted whole rather than patched, because a function is replaced, not
-- edited - and the two lines that changed are marked below.
-- ---------------------------------------------------------------------------
/* Dropped by looking the signature UP rather than typing it out.

   The first version of this line guessed (uuid, integer, integer, numeric,
   integer) - p_drop is numeric, not integer - so `drop if exists` matched
   nothing, silently, and the create that followed failed with "already exists
   with same argument types". A drop that quietly does nothing is worse than
   one that errors. */
do $$
declare r record;
begin
  for r in
    select oid::regprocedure as sig
      from pg_proc
     where proname = 'churn_players'
       and pronamespace = 'public'::regnamespace
  loop
    execute format('drop function if exists %s', r.sig);
  end loop;
end $$;

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
    (w.username is not null),
    w.note,
    coalesce(pr.basis, 'none')
  from public.players p
  join public.users u on u.id = p.owner_id
  left join pairs pr on pr.uname = lower(btrim(p.roobet_username))
  /* Joined on the Roobet username, not the player id.

     vip_watch is keyed on username now (migration 036) so that a wagerer in
     nobody's book can be watched. Joining on player_id would then miss any
     watch created before that player existed - which is the common case,
     since watching an unclaimed wagerer is the whole point. */
  left join public.vip_watch w
         on lower(btrim(w.username)) = lower(btrim(p.roobet_username))
        and w.resolved_at is null
  where (p_owner is null or p.owner_id = p_owner)
    and (
      -- Pinned by a person: always listed, no threshold applies.
      w.username is not null
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
