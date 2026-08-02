-- =============================================================================
-- Phase 8: scanned homework uploads, NA marking, stamp opacity defaults
-- Additive only. Does NOT rerun full schema.sql.
-- =============================================================================

-- ── Enum: scanned homework upload block ──────────────────────────────────────

alter type public.assignment_block_type
  add value if not exists 'scanned_homework_upload';

-- ── Question marks: explicit not-attempted flag ──────────────────────────────

alter table public.question_marks
  add column if not exists not_attempted boolean not null default false;

comment on column public.question_marks.not_attempted is
  'True when teacher marked the response as not attempted (distinct from awarded_mark = 0).';

-- ── Stamp default opacity ───────────────────────────────────────────────────

alter table public.school_marking_symbols
  add column if not exists default_opacity numeric(4,3) not null default 1.0;

alter table public.school_marking_symbols
  drop constraint if exists school_marking_symbols_opacity_chk;

alter table public.school_marking_symbols
  add constraint school_marking_symbols_opacity_chk
  check (default_opacity >= 0.10 and default_opacity <= 1.0);

-- ── Scanned upload block settings ───────────────────────────────────────────

create table if not exists public.scanned_upload_block_settings (
  block_id uuid primary key,
  maximum_files integer not null default 5
    check (maximum_files >= 1 and maximum_files <= 40),
  maximum_file_size_bytes bigint not null default 15728640
    check (maximum_file_size_bytes > 0 and maximum_file_size_bytes <= 52428800),
  allowed_mime_types text[] not null default array[
    'application/pdf',
    'image/jpeg',
    'image/png'
  ]::text[],
  combine_images_to_pdf boolean not null default true,
  allow_images boolean not null default true,
  allow_pdf boolean not null default true,
  allow_docx boolean not null default false,
  allow_replacement boolean not null default true,
  mark_scheme_storage_path text,
  mark_scheme_file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists scanned_upload_block_settings_set_updated_at
  on public.scanned_upload_block_settings;
create trigger scanned_upload_block_settings_set_updated_at
  before update on public.scanned_upload_block_settings
  for each row execute function public.set_updated_at();

-- ── Attached subquestions for scanned upload blocks ─────────────────────────

create table if not exists public.scanned_upload_questions (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null,
  question_label text not null default '',
  title text not null default '',
  description text,
  maximum_mark numeric(8,2) not null default 0 check (maximum_mark >= 0),
  is_required boolean not null default true,
  include_in_total boolean not null default true,
  marking_guidance text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scanned_upload_questions_block_idx
  on public.scanned_upload_questions (block_id, display_order);

drop trigger if exists scanned_upload_questions_set_updated_at
  on public.scanned_upload_questions;
create trigger scanned_upload_questions_set_updated_at
  before update on public.scanned_upload_questions
  for each row execute function public.set_updated_at();

-- ── Uploaded files per submission ───────────────────────────────────────────

create table if not exists public.scanned_upload_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  block_id uuid not null,
  question_id uuid,
  submission_version integer not null default 1,
  original_storage_path text not null,
  preview_storage_path text,
  original_file_name text not null,
  mime_type text not null,
  file_size bigint not null default 0,
  page_count integer,
  display_order integer not null default 0,
  rotation integer not null default 0,
  checksum text,
  uploaded_at timestamptz not null default now(),
  is_active_version boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scanned_upload_files_submission_idx
  on public.scanned_upload_files (submission_id, block_id, is_active_version);

create index if not exists scanned_upload_files_active_idx
  on public.scanned_upload_files (submission_id, is_active_version)
  where is_active_version = true;

drop trigger if exists scanned_upload_files_set_updated_at
  on public.scanned_upload_files;
create trigger scanned_upload_files_set_updated_at
  before update on public.scanned_upload_files
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.scanned_upload_block_settings enable row level security;
alter table public.scanned_upload_questions enable row level security;
alter table public.scanned_upload_files enable row level security;

drop policy if exists scanned_upload_settings_select on public.scanned_upload_block_settings;
create policy scanned_upload_settings_select on public.scanned_upload_block_settings
  for select to authenticated using (true);

drop policy if exists scanned_upload_settings_write on public.scanned_upload_block_settings;
create policy scanned_upload_settings_write on public.scanned_upload_block_settings
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'teacher')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'teacher')
    )
  );

drop policy if exists scanned_upload_questions_select on public.scanned_upload_questions;
create policy scanned_upload_questions_select on public.scanned_upload_questions
  for select to authenticated using (true);

drop policy if exists scanned_upload_questions_write on public.scanned_upload_questions;
create policy scanned_upload_questions_write on public.scanned_upload_questions
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'teacher')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'teacher')
    )
  );

drop policy if exists scanned_upload_files_student on public.scanned_upload_files;
create policy scanned_upload_files_student on public.scanned_upload_files
  for all to authenticated
  using (
    exists (
      select 1 from public.submissions s
      where s.id = scanned_upload_files.submission_id
        and s.student_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.submissions s
      where s.id = scanned_upload_files.submission_id
        and s.student_id = auth.uid()
    )
  );

drop policy if exists scanned_upload_files_staff on public.scanned_upload_files;
create policy scanned_upload_files_staff on public.scanned_upload_files
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'teacher')
    )
  );

grant select, insert, update, delete on public.scanned_upload_block_settings to authenticated;
grant select, insert, update, delete on public.scanned_upload_questions to authenticated;
grant select, insert, update, delete on public.scanned_upload_files to authenticated;

-- ── Upsert question mark: honour not_attempted ──────────────────────────────

create or replace function public.upsert_question_mark(
  p_payload jsonb
)
returns public.question_marks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_submission_id uuid := (p_payload->>'submission_id')::uuid;
  v_question_id uuid := (p_payload->>'question_id')::uuid;
  v_incoming_version bigint := coalesce((p_payload->>'client_version')::bigint, 1);
  v_existing public.question_marks;
  v_row public.question_marks;
  v_status public.question_marking_status;
  v_not_attempted boolean := coalesce((p_payload->>'not_attempted')::boolean, false);
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_existing
  from public.question_marks
  where submission_id = v_submission_id
    and question_id = v_question_id
  for update;

  if v_existing.id is not null and v_incoming_version < v_existing.client_version then
    raise exception 'stale_question_mark_version';
  end if;

  v_status := coalesce(
    nullif(p_payload->>'marking_status', '')::public.question_marking_status,
    case
      when coalesce((p_payload->>'flagged')::boolean, false) then 'flagged'::public.question_marking_status
      when v_not_attempted then 'marked'::public.question_marking_status
      when p_payload ? 'awarded_mark' and p_payload->>'awarded_mark' is not null
        then 'marked'::public.question_marking_status
      when nullif(p_payload->>'review_state', '') is not null
           and nullif(p_payload->>'review_state', '') <> 'not_reviewed'
        then 'marked'::public.question_marking_status
      else 'unmarked'::public.question_marking_status
    end
  );

  insert into public.question_marks (
    submission_id, question_id, marking_mode, awarded_mark, maximum_mark,
    review_state, marking_status, question_feedback, teacher_only_note,
    automatic_mark, override_mark, override_reason, flagged, not_attempted,
    client_version, marked_by, marked_at
  ) values (
    v_submission_id,
    v_question_id,
    coalesce(
      nullif(p_payload->>'marking_mode', '')::public.question_marking_mode,
      'numeric'::public.question_marking_mode
    ),
    case when v_not_attempted then 0 else nullif(p_payload->>'awarded_mark', '')::numeric end,
    coalesce((p_payload->>'maximum_mark')::numeric, 0),
    case
      when v_not_attempted then 'not_attempted'::public.question_review_state
      else nullif(p_payload->>'review_state', '')::public.question_review_state
    end,
    v_status,
    nullif(p_payload->>'question_feedback', ''),
    nullif(p_payload->>'teacher_only_note', ''),
    nullif(p_payload->>'automatic_mark', '')::numeric,
    nullif(p_payload->>'override_mark', '')::numeric,
    nullif(p_payload->>'override_reason', ''),
    coalesce((p_payload->>'flagged')::boolean, false),
    v_not_attempted,
    v_incoming_version,
    v_uid,
    case when v_status in ('marked', 'flagged') then now() else null end
  )
  on conflict (submission_id, question_id) do update
  set
    marking_mode = excluded.marking_mode,
    awarded_mark = excluded.awarded_mark,
    maximum_mark = excluded.maximum_mark,
    review_state = excluded.review_state,
    marking_status = excluded.marking_status,
    question_feedback = excluded.question_feedback,
    teacher_only_note = excluded.teacher_only_note,
    automatic_mark = excluded.automatic_mark,
    override_mark = excluded.override_mark,
    override_reason = excluded.override_reason,
    flagged = excluded.flagged,
    not_attempted = excluded.not_attempted,
    client_version = excluded.client_version,
    marked_by = excluded.marked_by,
    marked_at = excluded.marked_at,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

notify pgrst, 'reload schema';
