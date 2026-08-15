-- ============================================================================
-- Let the scheduled job prune, without opening the door to anyone else
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- THE PROBLEM
--   prune_wager_days() guarded itself with is_admin(), which reads
--   auth.uid(). The scheduled sync runs as the SERVICE ROLE and has no
--   session, so auth.uid() is null, is_admin() is false, and the function
--   raised "Admins only." every night.
--
--   Allowing a null auth.uid() sounds like a hole but is not: EXECUTE is
--   granted only to `authenticated`, and an authenticated request always has
--   a uid. The anon role cannot call this at all. So "no uid AND allowed to
--   execute" means exactly one thing - the service role, which is the
--   scheduler.
-- ============================================================================

create or replace function public.prune_wager_days(p_keep_days integer default 75)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare removed integer;
begin
  -- An admin acting deliberately, or the scheduler acting as the service role.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Admins only.';
  end if;

  -- Never prune below what the 30-day-versus-30 comparison needs.
  if p_keep_days is null or p_keep_days < 70 then
    p_keep_days := 70;
  end if;

  delete from public.wager_periods
   where period_type = 'day'
     and period_start < (current_date - p_keep_days)::date;

  get diagnostics removed = row_count;
  return removed;
end $$;

revoke all on function public.prune_wager_days(integer) from public;
grant execute on function public.prune_wager_days(integer) to authenticated;
grant execute on function public.prune_wager_days(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
