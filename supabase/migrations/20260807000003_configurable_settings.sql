-- ============================================================================
-- Daily Gamba CRM - make everything admin-configurable
--
-- The first migration baked several rules into the table definitions: the KYC
-- and Deposit option lists, and by omission the sources list. Others sat in
-- application code: the VIP check-in schedules, the attempt threshold, the
-- Coming Up window.
--
-- Anything hardcoded is something you have to come back to a developer for.
-- This turns all of it into data an admin can edit in the app.
--
-- Run before importing any real data - it changes column constraints.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Lookup lists. Ordered, deactivatable rather than deleted, so retiring an
-- option never orphans the players already using it.
-- ---------------------------------------------------------------------------
create table if not exists public.sources (
  name       text primary key,
  sort_order int  not null default 0,
  active     boolean not null default true
);

insert into public.sources (name, sort_order) values
  ('Instagram', 1), ('Discord', 2), ('Twitter', 3),
  ('Telegram', 4), ('SlotEssentials', 5), ('Other', 6)
on conflict (name) do nothing;


create table if not exists public.kyc_statuses (
  name       text primary key,
  sort_order int  not null default 0,
  active     boolean not null default true
);

insert into public.kyc_statuses (name, sort_order) values
  ('Not Started', 1), ('Started', 2), ('Complete', 3), ('Failed', 4)
on conflict (name) do nothing;


create table if not exists public.deposit_statuses (
  name       text primary key,
  sort_order int  not null default 0,
  active     boolean not null default true
);

insert into public.deposit_statuses (name, sort_order) values
  ('No', 1), ('Pending', 2), ('Yes', 3)
on conflict (name) do nothing;


-- Swap the fixed CHECK constraints for references to those lists.
alter table public.players drop constraint if exists players_kyc_status_check;
alter table public.players drop constraint if exists players_deposit_status_check;

alter table public.players
  add constraint players_kyc_status_fkey
  foreign key (kyc_status) references public.kyc_statuses(name) on update cascade;

alter table public.players
  add constraint players_deposit_status_fkey
  foreign key (deposit_status) references public.deposit_statuses(name) on update cascade;

-- ON UPDATE CASCADE matters: rename an option and every player using it follows
-- automatically, rather than breaking.
alter table public.players
  drop constraint if exists players_status_fkey,
  add constraint players_status_fkey
  foreign key (status) references public.statuses(name) on update cascade;


-- ---------------------------------------------------------------------------
-- settings - the numbers that used to live in code.
-- One row per knob, so adding a new one never needs a schema change.
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  key          text primary key,
  value        text not null,
  value_type   text not null default 'int' check (value_type in ('int','text','bool','json')),
  label        text not null,
  description  text,
  category     text not null default 'general',
  sort_order   int  not null default 0,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.users(id) on delete set null
);

insert into public.settings (key, value, value_type, label, description, category, sort_order) values
  ('vip_fasttrack_schedule', '1,2,3', 'text',
   'VIP fast-track check-in days',
   'Days after the last contact to prompt each check-in for a player at VIP Transferred. Comma separated.',
   'vip', 1),

  ('vip_fasttrack_max_attempts', '3', 'int',
   'VIP fast-track attempts before flagging',
   'After this many check-ins with no deposit, the player is flagged as ready for Dead Lead. It only ever prompts - the rep decides.',
   'vip', 2),

  ('vip_team_schedule', '1,7,14', 'text',
   'VIP team check-in days',
   'Days after hand-off to prompt each in-house VIP team check-in. Comma separated.',
   'vip', 3),

  ('vip_team_max_checkins', '3', 'int',
   'VIP team check-ins before stopping',
   'The schedule goes quiet by itself after this many.',
   'vip', 4),

  ('followup_attempts_before_dead', '3', 'int',
   'Follow-ups before suggesting Dead Lead',
   'How many attempts on a player with no Roobet username before the app suggests marking them dead. A prompt, not automatic.',
   'queue', 1),

  ('coming_up_window_days', '7', 'int',
   'Coming Up window (days)',
   'How far ahead the Coming Up list looks.',
   'queue', 2),

  ('overdue_highlight_hours', '24', 'int',
   'Overdue highlight (hours)',
   'How long past due before a player is highlighted as overdue.',
   'queue', 3),

  ('require_roobet_username', 'true', 'bool',
   'Keep players without a Roobet username in the daily queue',
   'When on, a player with no Roobet username stays in the queue every day until it is filled. It is the single biggest conversion blocker.',
   'queue', 4)
on conflict (key) do nothing;


-- ---------------------------------------------------------------------------
-- Row Level Security - everyone reads, admins edit.
-- ---------------------------------------------------------------------------
alter table public.sources          enable row level security;
alter table public.kyc_statuses     enable row level security;
alter table public.deposit_statuses enable row level security;
alter table public.settings         enable row level security;

drop policy if exists sources_select on public.sources;
create policy sources_select on public.sources for select using (true);
drop policy if exists sources_admin on public.sources;
create policy sources_admin on public.sources for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists kyc_select on public.kyc_statuses;
create policy kyc_select on public.kyc_statuses for select using (true);
drop policy if exists kyc_admin on public.kyc_statuses;
create policy kyc_admin on public.kyc_statuses for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists deposit_select on public.deposit_statuses;
create policy deposit_select on public.deposit_statuses for select using (true);
drop policy if exists deposit_admin on public.deposit_statuses;
create policy deposit_admin on public.deposit_statuses for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select using (true);
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for all
  using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- Track who changed a setting and when.
-- ---------------------------------------------------------------------------
create or replace function public.touch_setting() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end $$;

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_setting();


-- ---------------------------------------------------------------------------
-- What an admin can now change without a developer
-- ---------------------------------------------------------------------------
select 'statuses'         as what, 'funnel stages, their follow-up cadence, and what counts as a lead / FTD / dead' as details
union all select 'kpi_targets',      'daily targets per person, dated so history stays intact'
union all select 'sources',          'where leads come from'
union all select 'kyc_statuses',     'KYC options'
union all select 'deposit_statuses', 'deposit options'
union all select 'settings',         'VIP schedules, attempt thresholds, Coming Up window, overdue highlighting'
union all select 'users',            'people, roles, time zones, activation';
