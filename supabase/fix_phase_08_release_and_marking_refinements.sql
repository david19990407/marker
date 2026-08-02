-- =============================================================================
-- Phase 8 refinements: feedback release metadata + marking performance indexes.
-- Safe / additive. Does NOT rerun schema.sql.
-- =============================================================================

alter table public.feedback
  add column if not exists released_by uuid references public.profiles (id) on delete set null;

alter table public.feedback
  add column if not exists release_version integer not null default 0;

create index if not exists feedback_released_at_idx
  on public.feedback (released_at desc)
  where status = 'released';

create index if not exists feedback_released_by_idx
  on public.feedback (released_by)
  where released_by is not null;

create index if not exists question_marks_submission_status_idx
  on public.question_marks (submission_id, marking_status);

notify pgrst, 'reload schema';
