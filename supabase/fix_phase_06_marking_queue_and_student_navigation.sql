-- =============================================================================
-- Phase 6: marking queue hierarchy + student subject navigation indexes
-- Safe for live databases. Does NOT rerun full schema.sql.
-- =============================================================================

-- Submissions: queue by assignment / status / submitted_at
create index if not exists submissions_assignment_status_submitted_idx
  on public.submissions (assignment_id, status, submitted_at asc nulls last);

create index if not exists submissions_student_assignment_idx
  on public.submissions (student_id, assignment_id);

create index if not exists submissions_status_submitted_at_idx
  on public.submissions (status, submitted_at asc nulls last);

-- Assignments: class drill-down + due date
create index if not exists assignments_class_status_due_idx
  on public.assignments (class_id, status, due_at asc nulls last);

create index if not exists assignments_class_id_idx
  on public.assignments (class_id);

-- Classes: subject grouping
create index if not exists classes_subject_id_idx
  on public.classes (subject_id)
  where subject_id is not null;

create index if not exists classes_teacher_archived_idx
  on public.classes (teacher_id, archived);

-- Class membership / co-teachers for access scope
create index if not exists class_members_student_class_idx
  on public.class_members (student_id, class_id);

create index if not exists class_teachers_teacher_mark_idx
  on public.class_teachers (teacher_id, can_mark_submissions, class_id);

-- Feedback release ordering for returned work
create index if not exists feedback_status_released_at_idx
  on public.feedback (status, released_at desc nulls last);

create index if not exists feedback_submission_id_idx
  on public.feedback (submission_id);

notify pgrst, 'reload schema';
