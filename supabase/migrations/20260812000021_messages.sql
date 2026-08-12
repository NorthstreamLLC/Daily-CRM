-- ============================================================================
-- Message log - what was actually said
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once. Independent of 018-020; order does not matter.
--
-- WHY A TABLE RATHER THAN A NOTE FIELD
--   The player's notes field is a scratchpad that gets overwritten. A message
--   is a dated event: who said what, on which channel, in which direction. A
--   rep taking over someone's book needs the conversation, not the last thing
--   anybody happened to type.
--
--   Append-only in spirit, like activity_log: an edit keeps the original
--   timestamp and records that it was edited, rather than quietly rewriting
--   history a commission dispute might later turn on.
-- ============================================================================

create table if not exists public.player_messages (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete restrict,

  -- Which way it went. 'out' is us, 'in' is them.
  direction    text not null default 'out' check (direction in ('out','in')),
  channel      text not null default 'other'
                 check (channel in ('discord','telegram','twitter','email','sms','call','other')),
  body         text not null check (btrim(body) <> ''),

  -- When it was said, which is not always when it was typed in.
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  edited_at    timestamptz
);

create index if not exists player_messages_player_idx
  on public.player_messages (player_id, occurred_at desc);
create index if not exists player_messages_user_idx
  on public.player_messages (user_id, occurred_at desc);

alter table public.player_messages enable row level security;

-- A rep may log against their own players; an admin against anyone's. Same
-- shape as every other per-player policy, so there is one rule to reason about.
drop policy if exists player_messages_own on public.player_messages;
create policy player_messages_own on public.player_messages for all
  using (
    public.is_admin()
    or exists (
      select 1 from public.players p
       where p.id = player_messages.player_id and p.owner_id = auth.uid()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.players p
       where p.id = player_messages.player_id and p.owner_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- Logging a message counts as contact.
--
-- Without this a rep would log what they said and still see the task sitting
-- there unfinished, which is exactly the double-entry the spreadsheet forced.
-- Only outbound messages count: them replying is not us doing the work.
--
-- Only ever moves last_contact_at forward, so back-filling an old
-- conversation cannot make a player look more recently worked than they are.
-- ---------------------------------------------------------------------------
create or replace function public.message_marks_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'out' then
    update public.players
       set last_contact_at = new.occurred_at
     where id = new.player_id
       and (last_contact_at is null or last_contact_at < new.occurred_at);
  end if;
  return new;
end $$;

drop trigger if exists player_messages_mark_contact on public.player_messages;
create trigger player_messages_mark_contact
  after insert on public.player_messages
  for each row execute function public.message_marks_contact();


-- ---------------------------------------------------------------------------
-- Reusable snippets, so the team stops retyping the same opener.
-- ---------------------------------------------------------------------------
create table if not exists public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  body       text not null,
  -- Null means everyone's; a user id means it is that person's own.
  owner_id   uuid references public.users(id) on delete cascade,
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.message_templates enable row level security;

drop policy if exists message_templates_read on public.message_templates;
create policy message_templates_read on public.message_templates for select
  using (owner_id is null or owner_id = auth.uid() or public.is_admin());

-- Shared templates are an admin decision; a rep may keep their own.
drop policy if exists message_templates_write on public.message_templates;
create policy message_templates_write on public.message_templates for all
  using (public.is_admin() or owner_id = auth.uid())
  with check (public.is_admin() or owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
