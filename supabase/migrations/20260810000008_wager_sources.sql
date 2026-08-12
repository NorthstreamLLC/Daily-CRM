-- ============================================================================
-- Wager sources - multiple leaderboard APIs, managed from the admin screen
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHY A TABLE AND NOT ENV VARS
--   There are several leaderboards, each with its own key, and the list will
--   change. Env vars mean editing a file and restarting the server for every
--   change - exactly the "come back to a developer" dependency this CRM exists
--   to remove. Row Level Security limits the table to admins; the keys are
--   never selected by any query a rep's session can run, and never sent to a
--   browser except masked.
-- ============================================================================

create table if not exists public.wager_sources (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,          -- "RoobetCasinoRewards"
  url            text not null,
  api_key        text not null,
  -- How the key is presented. bearer: Authorization header. header: a custom
  -- header (header_name). query: appended as ?key=... to the URL.
  auth_style     text not null default 'bearer'
                 check (auth_style in ('bearer','header','query')),
  header_name    text not null default 'x-api-key',
  query_param    text not null default 'key',
  active         boolean not null default true,
  last_synced_at timestamptz,
  last_status    text,                          -- "matched 41 of 50" / error text
  created_at     timestamptz not null default now()
);

alter table public.wager_sources enable row level security;

drop policy if exists wager_sources_admin on public.wager_sources;
create policy wager_sources_admin on public.wager_sources for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
