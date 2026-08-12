-- ============================================================================
-- Corrections: reversing a mistaken deposit, and retiring pre-existing wagerers
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- REVERSING A DEPOSIT.
--
-- Marking someone First Deposit by mistake stamped first_deposit_at and logged
-- an FTD. Changing their status afterwards does not undo either - the stamp is
-- deliberately permanent so a real depositor who later goes dead is still
-- counted as having deposited.
--
-- A mistake needs a different mechanism. activity_log is append-only, so the
-- correction is a new event rather than a deletion: the FTD count subtracts
-- reversals, and the history keeps both the claim and the correction.
-- ---------------------------------------------------------------------------
alter table public.activity_log drop constraint if exists activity_log_event_type_check;

alter table public.activity_log
  add constraint activity_log_event_type_check
  check (event_type in (
    'player_created','outreach','status_change','task_completed',
    'vip_fasttrack_checkin','vip_team_checkin','note_added','import',
    'deposit_reversed'));


-- ---------------------------------------------------------------------------
-- PRE-EXISTING WAGERERS.
--
-- Several hundred usernames were already wagering on the codes before the CRM
-- existed. They will never be claimed, and they bury the handful of genuinely
-- new names that are worth chasing. Retiring them keeps them in every company
-- total while removing them from the working list.
-- ---------------------------------------------------------------------------
create table if not exists public.wager_ignored (
  username    text primary key,
  reason      text not null default 'pre-existing',
  ignored_at  timestamptz not null default now(),
  ignored_by  uuid references public.users(id) on delete set null
);

alter table public.wager_ignored enable row level security;

drop policy if exists wager_ignored_admin on public.wager_ignored;
create policy wager_ignored_admin on public.wager_ignored for all
  using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- Retire every currently unclaimed wagerer in one go.
--
-- Anyone in the ledger who is not in somebody's book right now is, by
-- definition, pre-existing. Called from the button on the Wager page.
-- ---------------------------------------------------------------------------
drop function if exists public.retire_unclaimed_wagerers();

create function public.retire_unclaimed_wagerers()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare retired int;
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  insert into public.wager_ignored (username, reason, ignored_by)
  select distinct on (lower(btrim(we.username))) btrim(we.username), 'pre-existing', auth.uid()
    from public.wager_external we
   where not exists (
     select 1 from public.players p
      where lower(btrim(p.roobet_username)) = lower(btrim(we.username))
   )
   order by lower(btrim(we.username))
  on conflict (username) do nothing;

  get diagnostics retired = row_count;
  return retired;
end $$;

revoke all on function public.retire_unclaimed_wagerers() from public;
grant execute on function public.retire_unclaimed_wagerers() to authenticated;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
