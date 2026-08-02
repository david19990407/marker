-- =============================================================================
-- Phase 8 annotation interactions + performance (narrow follow-up).
-- Safe / additive. Does NOT rerun schema.sql or the full Phase 8 schema.
-- Preserves all existing annotations; geometry display state lives in jsonb.
-- =============================================================================

-- Geometry display-state helpers are stored in submission_annotations.geometry:
--   collapsed, tail_edge, tail_offset, tail_length, stamp_normalised
-- No competing annotation tables are created.

-- Missing / reinforcing indexes for marking-session loads
create index if not exists submission_annotations_submission_active_idx
  on public.submission_annotations (submission_id, created_at)
  where is_deleted = false;

create index if not exists submission_annotations_submission_question_active_idx
  on public.submission_annotations (submission_id, question_id)
  where is_deleted = false and question_id is not null;

create index if not exists submission_annotations_stamp_active_idx
  on public.submission_annotations (stamp_id)
  where is_deleted = false and stamp_id is not null;

create index if not exists submission_annotations_type_submission_idx
  on public.submission_annotations (submission_id, annotation_type)
  where is_deleted = false;

create index if not exists question_marks_submission_question_idx
  on public.question_marks (submission_id, question_id);

-- Optional: mark legacy equal-norm stamps for client normalisation pass.
-- Does not rewrite geometry blindly (canvas aspect is client-known).
update public.submission_annotations
set geometry = coalesce(geometry, '{}'::jsonb) || jsonb_build_object('needs_stamp_normalise', true)
where annotation_type = 'stamp'
  and is_deleted = false
  and abs(w_norm - h_norm) < 0.002
  and coalesce(geometry->>'stamp_normalised', '') <> 'true';

notify pgrst, 'reload schema';
