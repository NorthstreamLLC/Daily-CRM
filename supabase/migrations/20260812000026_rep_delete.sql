-- ============================================================================
-- Let a rep delete their own mistakes
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHY
--   A rep adds someone, finds out it is a scammer, or types the same person in
--   twice. Making them message an admin to remove a row they created five
--   minutes ago is friction with no purpose - and the row sits in their queue
--   until somebody gets round to it.
--
-- WHY NOT SIMPLY "YOUR OWN PLAYERS"
--   Commission is paid off what is in this table. A rep who could delete any
--   of their players could delete one who had wagered - to hide a mistake, or
--   by mis-clicking on the wrong row. That is real money, and it is
--   unrecoverable.
--
--   So the line is drawn at money, not at ownership:
--
--     no wager recorded  AND  no first deposit   ->  the rep can delete it
--     anything else                              ->  admin only
--
--   Which is exactly the set of rows a rep actually wants to remove. A
--   scammer, a duplicate and a typo have all wagered nothing. A player who has
--   produced money is, by definition, not one of those.
--
--   Drawn HERE rather than only in the application because a policy is what
--   holds when somebody calls the action directly.
-- ============================================================================

drop policy if exists players_delete on public.players;

create policy players_delete on public.players for delete
  using (
    public.is_admin()
    or (
      owner_id = auth.uid()
      and coalesce(weighted_wager, 0) = 0
      and first_deposit_at is null
    )
  );

comment on policy players_delete on public.players is
  'Admins delete anything. A rep deletes their own players only while no wager '
  'and no first deposit is recorded against them - scammers, duplicates and '
  'typos, not people who have produced money.';


-- ---------------------------------------------------------------------------
-- A rep's deletion has to be recorded too
--
-- admin_audit_insert required is_admin(). Letting reps delete without changing
-- this would have meant their deletions - the only ones that now happen
-- without an admin present - were the ones that went UNRECORDED. The audit
-- table would have been silently refusing exactly the rows it exists for, and
-- nothing would have reported an error: the delete succeeds, the audit insert
-- is rejected by the policy, and the action returns success.
--
-- So: anyone may append a row about their own action. Reading stays admin
-- only, and there is still no update and no delete, so the table keeps its
-- append-only character - a rep can write a record of what they did and cannot
-- read it back, edit it or remove it.
-- ---------------------------------------------------------------------------

drop policy if exists admin_audit_insert on public.admin_audit;

create policy admin_audit_insert on public.admin_audit for insert
  with check (actor_id = auth.uid());

comment on policy admin_audit_insert on public.admin_audit is
  'Anyone may record their own action; actor_id must be them. Reading is '
  'admin only, and nothing can be updated or deleted.';
