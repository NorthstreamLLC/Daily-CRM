-- ============================================================================
-- Let the dates be corrected - both of them, in both places
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Run this BEFORE deploying the code that uses it. Safe to run more than once.
--
-- WHY
--   Two dates are wrong often enough to need fixing by hand:
--
--     Added (assigned_at)    the import took whatever the spreadsheet had, and
--                            some sheets had a formula, a re-typed date, or the
--                            day the row was last edited rather than the day
--                            the lead came in.
--
--     VIP Transfer           ticking the box stamps today. Reps going back
--                            through a year of book will be ticking transfers
--                            that happened months ago.
--
-- THE PART THAT MATTERS
--   Each date exists TWICE: on the player, and on the activity_log row the
--   stats count. Change one and the player page and the Stats page disagree -
--   which is exactly the bug that started this whole thread, where the cards
--   read 0 and the funnel read 319.
--
--   So both functions move the pair together, inside the database, in one
--   statement each. There is no version of this where the app does two writes
--   and hopes.
--
-- ON TRUST
--   These are security invoker, so RLS decides whose players a rep can touch -
--   their own. That does mean a rep can backdate their own leads, which moves
--   their own daily counts and streaks. It is a real gaming surface, and it is
--   the price of letting them fix a bad import without an admin in the loop.
--
--   Every correction records what the date used to be, in the activity_log
--   row's metadata. Nothing is silently rewritten - if a rep's numbers ever
--   look odd, the old value is still there to compare against.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. When was this lead added?
--
-- assigned_at is not decoration. players_enriched derives next_followup_at
-- from coalesce(last_contact_at, assigned_at), so moving this date on a player
-- who has never been contacted moves them in or out of today's queue. That is
-- correct - if the lead really came in in March, it really is overdue - but it
-- is worth knowing that the queue will change under you.
-- ---------------------------------------------------------------------------
drop function if exists public.set_added_date(uuid, timestamptz);

create function public.set_added_date(p_player uuid, p_when timestamptz)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old timestamptz;
begin
  if p_when is null then
    raise exception 'A date is required.';
  end if;

  -- A lead cannot have arrived tomorrow. Small guard, but a typo'd year is the
  -- most common way a date field goes wrong, and 2027 would sit in Coming Up
  -- forever without ever becoming due.
  if p_when > now() + interval '1 day' then
    raise exception 'That date is in the future.';
  end if;

  select assigned_at into v_old from public.players where id = p_player;
  if v_old is null then
    raise exception 'That player is not yours.';   -- RLS returned nothing
  end if;

  update public.players set assigned_at = p_when where id = p_player;

  /* The log row moves with it. Leads are counted per day from occurred_at, so
     leaving it behind would put the correction on the player page and nowhere
     else - the player says March, the Stats page says August. */
  update public.activity_log
     set occurred_at = p_when,
         metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('date_corrected_from', v_old)
   where player_id = p_player
     and event_type = 'player_created';

  return p_when;
end $$;

revoke all on function public.set_added_date(uuid, timestamptz) from public;
grant execute on function public.set_added_date(uuid, timestamptz) to authenticated;


-- ---------------------------------------------------------------------------
-- 2. VIP Transfer, now with a date.
--
-- Replaces the two-argument version from migration 045. Passing null for the
-- date keeps the old behaviour - stamp now - so ticking the box still works
-- without anyone choosing a date.
-- ---------------------------------------------------------------------------
drop function if exists public.set_vip_transferred(uuid, boolean);
drop function if exists public.set_vip_transferred(uuid, boolean, timestamptz);

create function public.set_vip_transferred(
  p_player uuid,
  p_on     boolean,
  p_when   timestamptz default null
)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid;
  v_old   timestamptz;
  v_when  timestamptz;
begin
  select owner_id, vip_transferred_at into v_owner, v_old
    from public.players where id = p_player;
  if v_owner is null then
    raise exception 'That player is not yours.';
  end if;

  if not p_on then
    update public.players set vip_transferred_at = null where id = p_player;

    delete from public.activity_log
     where player_id = p_player
       and event_type = 'status_change'
       and to_status = 'VIP Transferred';

    return null;
  end if;

  /* Given a date, use it. Otherwise keep whatever is already there, and only
     fall back to now() for a first tick - so re-ticking an old transfer does
     not quietly move it to today. */
  v_when := coalesce(p_when, v_old, now());

  if v_when > now() + interval '1 day' then
    raise exception 'That date is in the future.';
  end if;

  update public.players set vip_transferred_at = v_when where id = p_player;

  -- Update the existing event if there is one, rather than adding a second.
  update public.activity_log
     set occurred_at = v_when,
         metadata = coalesce(metadata, '{}'::jsonb)
                    || case when v_old is null then '{}'::jsonb
                            else jsonb_build_object('date_corrected_from', v_old) end
   where player_id = p_player
     and event_type = 'status_change'
     and to_status = 'VIP Transferred';

  if not found then
    insert into public.activity_log
      (player_id, user_id, event_type, to_status, occurred_at, metadata)
    values
      (p_player, v_owner, 'status_change', 'VIP Transferred', v_when,
       jsonb_build_object('marked_by_rep', true));
  end if;

  return v_when;
end $$;

revoke all on function public.set_vip_transferred(uuid, boolean, timestamptz) from public;
grant execute on function public.set_vip_transferred(uuid, boolean, timestamptz) to authenticated;
