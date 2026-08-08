-- ============================================================================
-- Daily Gamba CRM - seed the team
--
-- BEFORE RUNNING THIS
--   1. Fill in the real emails below (replace CHANGE-ME).
--   2. Supabase > Authentication > Users > "Add user" for each person, using
--      those same emails. Password or invite, either is fine.
--   3. Run this file in the SQL Editor.
--
-- After this, everything else happens in the app - creating users, resetting
-- passwords, changing roles, editing targets. You should not need to come back
-- to the Supabase dashboard.
--
-- Matches people by email, so the order you create the logins in does not
-- matter. Safe to re-run - it updates rather than duplicating.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- THE TEAM
--
-- 13 people: 7 users, 6 admins (your 5 - Prime, Daily, Gwen, Miko, Concept -
-- plus you).
--
-- Admins use the CRM exactly like everyone else. They additionally see the
-- master view, company VIP transfers and company FTDs, and can manage users
-- and targets.
--
-- TIME ZONE decides what "today" means for that person. This is the thing that
-- was giving the South Africa reps yesterday's date on their morning work.
-- ---------------------------------------------------------------------------
with team (name, code, email, role, timezone, default_source) as (values
  -- name        code   email                           role     timezone
  ('Tuna',       'TU',  'CHANGE-ME@slotessentials.com', 'user',  'America/New_York'),      -- EST
  ('Plat',       'PL',  'CHANGE-ME@slotessentials.com', 'user',  'America/New_York'),      -- EST
  ('Pricey',     'PR',  'CHANGE-ME@slotessentials.com', 'user',  'America/New_York'),      -- EST
  ('Chella',     'CH',  'CHANGE-ME@slotessentials.com', 'user',  'Africa/Johannesburg'),   -- South Africa
  ('Moneyheist', 'MH',  'CHANGE-ME@slotessentials.com', 'user',  'Africa/Johannesburg'),   -- South Africa
  ('Seanok',     'SK',  'CHANGE-ME@slotessentials.com', 'user',  'Asia/Manila'),           -- Philippines
  ('Seb',        'SB',  'CHANGE-ME@slotessentials.com', 'user',  'America/New_York'),      -- EST

  -- Managers - admin
  ('Prime',      'IC',  'CHANGE-ME@slotessentials.com', 'admin', 'America/New_York'),      -- EST
  ('Daily',      'DL',  'CHANGE-ME@slotessentials.com', 'admin', 'America/New_York'),      -- EST

  -- VIP Team - admin
  ('Gwen',       'GW',  'CHANGE-ME@slotessentials.com', 'admin', 'America/Los_Angeles'),   -- PST
  ('Miko',       'MK',  'CHANGE-ME@slotessentials.com', 'admin', 'Asia/Manila'),           -- Philippines
  ('Concept',    'CN',  'CHANGE-ME@slotessentials.com', 'admin', 'Europe/Riga'),           -- Latvia

  -- You
  ('Isac',       'IS',  'isac@slotessentials.com',      'admin', 'America/New_York')       -- change if not EST
),
sources (code, default_source) as (values
  ('TU','Instagram'), ('CH','Discord'), ('MH','Discord'), ('SB','SlotEssentials'),
  ('SK','SlotEssentials'), ('PL',NULL), ('PR',NULL), ('IC',NULL), ('DL',NULL),
  ('GW',NULL), ('MK',NULL), ('CN',NULL), ('IS',NULL)
)
insert into public.users (id, name, code, email, role, timezone, default_source, active)
select au.id, t.name, t.code, t.email, t.role, t.timezone, s.default_source, true
from team t
join auth.users au on lower(au.email) = lower(t.email)
left join sources s on s.code = t.code
on conflict (id) do update set
  name           = excluded.name,
  code           = excluded.code,
  role           = excluded.role,
  timezone       = excluded.timezone,
  default_source = excluded.default_source;


-- ---------------------------------------------------------------------------
-- Daily targets. Managers and you get the lower set. Dated, so changing a
-- target later never rewrites past results.
-- ---------------------------------------------------------------------------
insert into public.kpi_targets (user_id, outreach_per_day, active_leads_per_day,
                                vip_transfers_per_day, ftd_per_day, effective_from)
select u.id,
       case when u.code in ('IC','DL','IS') then  20 else 100 end,
       case when u.code in ('IC','DL','IS') then   5 else  20 end,
       case when u.code in ('IC','DL','IS') then   1 else   3 end,
       1,
       current_date
from public.users u
on conflict (user_id, effective_from) do update set
  outreach_per_day      = excluded.outreach_per_day,
  active_leads_per_day  = excluded.active_leads_per_day,
  vip_transfers_per_day = excluded.vip_transfers_per_day,
  ftd_per_day           = excluded.ftd_per_day;


-- ---------------------------------------------------------------------------
-- Safeguard: the last admin cannot be removed or deactivated.
--
-- This lives in the database, so it holds however the change is attempted -
-- through the app, through the API, or by hand. Without it, one mis-click
-- locks everyone out of user management with no way back.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_last_admin_removal() returns trigger
language plpgsql security definer set search_path = public as $$
declare remaining int;
begin
  if (tg_op = 'UPDATE' and old.role = 'admin' and (new.role <> 'admin' or new.active = false))
     or (tg_op = 'DELETE' and old.role = 'admin') then
    select count(*) into remaining
      from public.users
     where role = 'admin' and active = true and id <> old.id;
    if remaining = 0 then
      raise exception 'Cannot remove the last admin - promote someone else first';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists users_protect_last_admin on public.users;
create trigger users_protect_last_admin
  before update or delete on public.users
  for each row execute function public.prevent_last_admin_removal();


-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
select u.name, u.code, u.role, u.timezone,
       k.active_leads_per_day  as leads_target,
       k.vip_transfers_per_day as vip_target,
       k.ftd_per_day           as ftd_target
from public.users u
left join public.kpi_targets k on k.user_id = u.id
order by u.role desc, u.name;

-- Expect 13 rows: 6 admins (Prime, Daily, Gwen, Miko, Concept, Isac), 7 users.
-- Anyone missing means their login was not created, or the email does not match.
