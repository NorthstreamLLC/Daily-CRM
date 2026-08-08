-- ============================================================================
-- Daily Gamba CRM - database schema
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once; it drops and recreates cleanly.
--
-- WHAT IT CREATES
--   statuses        the funnel and its cadences - editable data, not code
--   users           one row per rep, linked to Supabase login
--   kpi_targets     daily targets per rep, dated so history stays intact
--   players         the Book
--   activity_log    append-only history. Every number is counted from here
--   import_batches  import history, so an import can be traced and undone
--
-- SECURITY
--   Row Level Security is on for every table. A user can only read and write
--   their own players - enforced by the database, not by the interface. There
--   is no URL or API call that gets around it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Clean slate (safe to re-run)
-- ---------------------------------------------------------------------------
drop view   if exists public.players_enriched cascade;
drop table  if exists public.import_batches   cascade;
drop table  if exists public.activity_log     cascade;
drop table  if exists public.players          cascade;
drop table  if exists public.kpi_targets      cascade;
drop table  if exists public.users            cascade;
drop table  if exists public.statuses         cascade;
drop function if exists public.is_admin()                 cascade;
drop function if exists public.assign_player_reference()  cascade;
drop function if exists public.touch_updated_at()         cascade;


-- ---------------------------------------------------------------------------
-- statuses - the funnel. Cadence lives here so you can change it yourself.
-- ---------------------------------------------------------------------------
create table public.statuses (
  name           text primary key,
  sort_order     int  not null,
  followup_days  int  not null,          -- days from last contact until due again
  next_action    text not null,          -- what the rep is told to do
  counts_as_lead boolean not null default true,   -- excluded from Active Leads when false
  is_ftd         boolean not null default false,  -- counts as a first-time depositor
  is_dead        boolean not null default false   -- goes to the reactivation list
);

insert into public.statuses (name, sort_order, followup_days, next_action, counts_as_lead, is_ftd, is_dead) values
  ('Initial Contact',    1,  1, 'Day 1: check account, check KYC, help deposit',                 true,  false, false),
  ('Interested',         2,  1, 'Check account, check KYC, help deposit',                        true,  false, false),
  ('VIP Transferred',    3,  1, 'URGENT VIP check-in - finish KYC, lock in first deposit',       true,  false, false),
  ('KYC Complete',       4,  1, 'Help deposit / confirm deposit pending',                        true,  false, false),
  ('First Deposit',      5,  3, 'Confirm playing, resolve issues',                               true,  true,  false),
  ('Active',             6, 14, 'Actively playing - check in periodically, encourage play',      true,  true,  false),
  ('Reactivation Queue', 7,  3, 'Reactivation outreach - win them back',                         true,  false, false),
  ('Potential Lead',     8,  7, 'Re-target - see if they are ready to pick things back up',      false, false, false),
  ('Dead Lead',          9, 30, 'Re-target - reach back out, see if anything changed',           false, false, true);


-- ---------------------------------------------------------------------------
-- users - one row per rep. id matches the Supabase login id.
-- ---------------------------------------------------------------------------
create table public.users (
  id                  uuid primary key references auth.users(id) on delete cascade,
  name                text not null,
  code                text not null unique,          -- TU, PL, CH - prefixes player references
  email               text not null unique,
  role                text not null default 'user' check (role in ('user','admin')),
  timezone            text not null default 'UTC',   -- IANA. Decides this rep's "today"
  default_source      text,
  active              boolean not null default true,
  next_player_number  int not null default 1,        -- drives MH-0001, MH-0002...
  created_at          timestamptz not null default now()
);

-- Checking admin rights inside a policy on the users table would recurse.
-- SECURITY DEFINER steps outside RLS to answer the question safely.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.users where id = auth.uid()), false);
$$;


-- ---------------------------------------------------------------------------
-- kpi_targets - dated, so changing a target never rewrites past performance.
-- ---------------------------------------------------------------------------
create table public.kpi_targets (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users(id) on delete cascade,
  outreach_per_day     int not null default 100,
  active_leads_per_day int not null default 20,
  vip_transfers_per_day int not null default 3,
  ftd_per_day          int not null default 1,
  effective_from       date not null default current_date,
  created_at           timestamptz not null default now(),
  unique (user_id, effective_from)
);


-- ---------------------------------------------------------------------------
-- players - the Book.
-- ---------------------------------------------------------------------------
create table public.players (
  id                       uuid primary key default gen_random_uuid(),
  reference                text unique,               -- MH-0088, set automatically
  owner_id                 uuid not null references public.users(id) on delete restrict,

  handle                   text not null,
  source                   text,
  roobet_username          text,                      -- null is a blocker, see the queue view
  status                   text not null default 'Initial Contact' references public.statuses(name),
  kyc_status               text default 'Not Started' check (kyc_status in ('Not Started','Started','Complete','Failed')),
  deposit_status           text default 'No'          check (deposit_status in ('No','Pending','Yes')),
  weighted_wager           numeric(14,2) default 0,
  notes                    text,

  assigned_at              timestamptz not null default now(),
  last_contact_at          timestamptz,
  followup_attempts        int not null default 0,    -- resets when roobet_username is filled

  -- VIP fast-track (status = VIP Transferred): Day 1 / 2 / 3
  vip_fasttrack_started_at timestamptz,
  vip_fasttrack_checkins   int not null default 0,

  -- VIP team hand-off - independent of status: Day 1 / 7 / 14
  vip_team_handed_at       timestamptz,
  vip_team_checkins        int not null default 0,

  first_deposit_at         timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index players_owner_status_idx  on public.players (owner_id, status);
create index players_owner_contact_idx on public.players (owner_id, last_contact_at);
create index players_ftd_idx           on public.players (first_deposit_at) where first_deposit_at is not null;
create index players_handle_idx        on public.players (owner_id, lower(handle));

-- Reference numbers: MH-0001, MH-0002... The UPDATE locks the user row, so two
-- players created at the same moment cannot get the same number.
create function public.assign_player_reference() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_code text; v_num int;
begin
  if new.reference is not null then return new; end if;
  update public.users
     set next_player_number = next_player_number + 1
   where id = new.owner_id
   returning code, next_player_number - 1 into v_code, v_num;
  new.reference := v_code || '-' || lpad(v_num::text, 4, '0');
  return new;
end $$;

create trigger players_assign_reference
  before insert on public.players
  for each row execute function public.assign_player_reference();

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger players_touch_updated
  before update on public.players
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- activity_log - append only. Every reported number is counted from here, so a
-- corrected mistake drops out of the totals instead of counting forever.
-- ---------------------------------------------------------------------------
create table public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid references public.players(id) on delete set null,
  user_id     uuid not null references public.users(id) on delete restrict,
  event_type  text not null check (event_type in (
                'player_created','outreach','status_change','task_completed',
                'vip_fasttrack_checkin','vip_team_checkin','note_added','import')),
  from_status text,
  to_status   text,
  occurred_at timestamptz not null default now(),
  metadata    jsonb default '{}'::jsonb
);

create index activity_user_time_idx  on public.activity_log (user_id, occurred_at desc);
create index activity_type_time_idx  on public.activity_log (event_type, occurred_at desc);
create index activity_player_idx     on public.activity_log (player_id, occurred_at desc);


-- ---------------------------------------------------------------------------
-- import_batches - so an import can be inspected and rolled back.
-- ---------------------------------------------------------------------------
create table public.import_batches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete restrict,
  target_user_id uuid references public.users(id) on delete set null,  -- whose Book it went into
  filename      text,
  rows_total    int not null default 0,
  rows_imported int not null default 0,
  rows_rejected int not null default 0,
  rejections    jsonb default '[]'::jsonb,   -- row number + reason, so nothing fails silently
  created_at    timestamptz not null default now()
);

alter table public.players add column import_batch_id uuid references public.import_batches(id) on delete set null;


-- ---------------------------------------------------------------------------
-- players_enriched - next due date worked out on read, never stored.
-- Change a cadence and every date updates instantly.
-- security_invoker means this view obeys the same row rules as the tables.
-- ---------------------------------------------------------------------------
create view public.players_enriched with (security_invoker = true) as
select
  p.*,
  s.followup_days,
  s.next_action,
  s.is_dead,
  s.is_ftd,
  s.counts_as_lead,
  (coalesce(p.last_contact_at, p.assigned_at) + make_interval(days => s.followup_days)) as next_followup_at,
  (p.roobet_username is null or btrim(p.roobet_username) = '')                          as missing_roobet
from public.players p
join public.statuses s on s.name = p.status;


-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.users          enable row level security;
alter table public.players        enable row level security;
alter table public.activity_log   enable row level security;
alter table public.kpi_targets    enable row level security;
alter table public.import_batches enable row level security;
alter table public.statuses       enable row level security;

-- users: see yourself; admins see everyone. Only admins change roles or add people.
create policy users_select on public.users for select
  using (id = auth.uid() or public.is_admin());
create policy users_update_self on public.users for update
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.users where id = auth.uid()));
create policy users_admin_all on public.users for all
  using (public.is_admin()) with check (public.is_admin());

-- players: yours only, unless you are an admin.
create policy players_select on public.players for select
  using (owner_id = auth.uid() or public.is_admin());
create policy players_insert on public.players for insert
  with check (owner_id = auth.uid() or public.is_admin());
create policy players_update on public.players for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy players_delete on public.players for delete
  using (public.is_admin());

-- activity_log: readable for players you can see. Append only - no update, no delete.
create policy activity_select on public.activity_log for select
  using (user_id = auth.uid() or public.is_admin());
create policy activity_insert on public.activity_log for insert
  with check (user_id = auth.uid() or public.is_admin());

-- kpi_targets: read your own, admins manage all.
create policy kpi_select on public.kpi_targets for select
  using (user_id = auth.uid() or public.is_admin());
create policy kpi_admin_all on public.kpi_targets for all
  using (public.is_admin()) with check (public.is_admin());

-- import_batches: your own, admins all.
create policy import_select on public.import_batches for select
  using (user_id = auth.uid() or public.is_admin());
create policy import_insert on public.import_batches for insert
  with check (user_id = auth.uid() or public.is_admin());

-- statuses: everyone reads, admins edit.
create policy statuses_select on public.statuses for select using (true);
create policy statuses_admin  on public.statuses for all
  using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- Done. Next: create the 12 logins in Authentication > Users, then run 02_seed_users.sql
-- ---------------------------------------------------------------------------
