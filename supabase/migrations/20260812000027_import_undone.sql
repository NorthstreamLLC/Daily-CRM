-- ============================================================================
-- Record that an import was undone
--
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
--   Safe to run more than once.
--
-- WHY
--   Undoing an import deleted its players and left the history row untouched,
--   still reading "242 imported" with an Undo button beside it. So the log of
--   what happened said the opposite of what happened, and offered to do again
--   a thing that was already done.
--
--   An import log exists to answer "where did these players come from" months
--   later. One that quietly omits the removals is worse than no log, because
--   it will be believed.
--
--   Kept as a row rather than deleted for the same reason: "this import was
--   run and then taken back" is a different fact from "this import never
--   happened", and only one of them is true.
-- ============================================================================

alter table public.import_batches
  add column if not exists undone_at timestamptz,
  add column if not exists undone_by uuid references public.users(id) on delete set null;

comment on column public.import_batches.undone_at is
  'When the import was reversed. Null means its players are still here.';

comment on column public.import_batches.undone_by is
  'Which admin reversed it. Null if the account has since been removed.';
