-- =============================================================================
-- Phase 6 follow-up: student renderer + resource / numeric block support
-- Safe for live databases. Does NOT rerun full schema.sql.
-- Preserves users, classes, assignments, submissions, and responses.
--
-- Numeric / media settings primarily live in assignment_blocks.config JSONB
-- (config.numeric, config.media) which existing structure upserts already save.
-- Optional question columns below mirror numeric settings for querying.
-- =============================================================================

-- ── Optional numeric metadata on questions ───────────────────────────────────

alter table public.assignment_questions
  add column if not exists unit text;

alter table public.assignment_questions
  add column if not exists decimal_places int;

alter table public.assignment_questions
  add column if not exists allow_decimals boolean not null default true;

comment on column public.assignment_questions.unit is
  'Optional unit label shown beside numeric student inputs (e.g. cm, kg, %).';
comment on column public.assignment_questions.decimal_places is
  'Preferred decimal places for numeric responses; null means unrestricted.';
comment on column public.assignment_questions.allow_decimals is
  'When false, students must enter whole numbers only.';

-- Backfill from config.numeric / correct_answer when present.
update public.assignment_questions q
set
  unit = coalesce(
    q.unit,
    nullif(b.config -> 'numeric' ->> 'unit', ''),
    nullif(q.correct_answer ->> 'unit', '')
  ),
  decimal_places = coalesce(
    q.decimal_places,
    nullif(b.config -> 'numeric' ->> 'decimal_places', '')::int,
    nullif(q.correct_answer ->> 'decimal_places', '')::int
  ),
  allow_decimals = coalesce(
    nullif(b.config -> 'numeric' ->> 'allow_decimals', '')::boolean,
    nullif(q.correct_answer ->> 'allow_decimals', '')::boolean,
    q.allow_decimals,
    true
  )
from public.assignment_blocks b
where b.id = q.block_id
  and q.response_type = 'numeric';

-- ── Resource ↔ block linking ─────────────────────────────────────────────────

alter table public.assignment_resources
  add column if not exists linked_block_id uuid references public.assignment_blocks (id) on delete set null;

create index if not exists assignment_resources_linked_block_idx
  on public.assignment_resources (linked_block_id);

create index if not exists assignment_resources_assignment_kind_idx
  on public.assignment_resources (assignment_id, resource_kind);

-- ── Submitted worksheet load indexes ─────────────────────────────────────────

create index if not exists student_responses_submission_qid_idx
  on public.student_responses (submission_id, question_id);

create index if not exists response_cells_lookup_idx
  on public.response_cells (student_response_id, row_index, col_index);

-- ── Storage MIME allow-list for worksheet media ──────────────────────────────

do $$
begin
  update storage.buckets
  set allowed_mime_types = array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'audio/mpeg',
    'video/mp4',
    'video/webm'
  ]
  where id = 'assignment-resources';
exception
  when undefined_table then null;
  when undefined_column then null;
end $$;

-- No public bucket: existing authenticated storage policies remain in force.
-- Worksheet media uploads use the existing private `assignment-resources` bucket.
-- Access continues through signed URLs for authorised class members / teachers.

-- Ensure resource_kind can describe block media uploads.
do $$
begin
  update public.assignment_resources
  set resource_kind = coalesce(nullif(resource_kind, ''), 'other')
  where resource_kind is null;
exception
  when undefined_column then null;
  when undefined_table then null;
end $$;

notify pgrst, 'reload schema';
