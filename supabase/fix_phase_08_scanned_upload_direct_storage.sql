-- Phase 8 correction: scanned upload direct-to-storage hardening
-- Run after:
--   1. supabase/phase_08_scanned_homework_uploads.sql
--   2. supabase/fix_phase_08_scanned_questions_and_annotation_interactions.sql
-- Idempotent.

-- Prevent duplicate active file rows for the same storage object.
create unique index if not exists scanned_upload_files_active_path_uidx
  on public.scanned_upload_files (original_storage_path)
  where is_active_version = true;

-- Speeds student list/reload after browser refresh.
create index if not exists scanned_upload_files_submission_block_order_idx
  on public.scanned_upload_files (submission_id, block_id, display_order)
  where is_active_version = true;

-- Teachers can read scanned submission objects by metadata path
-- (legacy submission.storage_path matching is insufficient for multi-file uploads).
drop policy if exists "Teachers read scanned upload submission files"
  on storage.objects;
create policy "Teachers read scanned upload submission files"
  on storage.objects for select
  using (
    bucket_id = 'student-submissions'
    and public.is_teacher()
    and exists (
      select 1
      from public.scanned_upload_files f
      join public.submissions s on s.id = f.submission_id
      join public.assignments a on a.id = s.assignment_id
      join public.classes c on c.id = a.class_id
      where c.teacher_id = auth.uid()
        and (
          f.original_storage_path = name
          or f.preview_storage_path = name
        )
    )
  );

notify pgrst, 'reload schema';
