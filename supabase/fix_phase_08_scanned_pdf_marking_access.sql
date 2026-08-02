-- Phase 8: teacher access to scanned-upload PDFs in the marking viewer
-- Root cause: storage RLS only matched classes.teacher_id / legacy
-- submissions.storage_path, so teachers (and co-teachers) got
-- "Object not found" when createSignedUrl ran for scanned_upload_files paths.
--
-- Run after:
--   1. supabase/phase_08_scanned_homework_uploads.sql
--   2. supabase/fix_phase_08_scanned_upload_direct_storage.sql
--   3. supabase/fix_structured_submission_status_and_marking_view.sql
--      (defines teacher_can_mark_submission)
-- Idempotent. Does not delete files or annotations.

alter table public.scanned_upload_files
  add column if not exists storage_bucket text not null default 'student-submissions';

update public.scanned_upload_files
set storage_bucket = 'student-submissions'
where storage_bucket is null or btrim(storage_bucket) = '';

-- Prefer original when a stale combined-preview path was recorded without an object.
-- (Safe no-op when preview equals original.)
comment on column public.scanned_upload_files.storage_bucket is
  'Supabase Storage bucket for original_storage_path / preview_storage_path';
comment on column public.scanned_upload_files.original_storage_path is
  'Canonical object key within storage_bucket (not a full URL)';

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
      where (
          f.original_storage_path = name
          or f.preview_storage_path = name
        )
        and public.teacher_can_mark_submission(f.submission_id)
    )
  );

-- Also allow admins (marking support / debugging).
drop policy if exists "Admins read scanned upload submission files"
  on storage.objects;
create policy "Admins read scanned upload submission files"
  on storage.objects for select
  using (
    bucket_id = 'student-submissions'
    and public.is_admin()
    and exists (
      select 1
      from public.scanned_upload_files f
      where f.original_storage_path = name
         or f.preview_storage_path = name
    )
  );

notify pgrst, 'reload schema';
