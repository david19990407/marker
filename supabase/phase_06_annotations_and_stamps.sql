-- =============================================================================
-- Phase 8 (filename phase_06 per plan): annotations, stamps, question marks
-- Safe for live databases. Does NOT rerun full schema.sql.
-- Preserves assignments, submissions, responses, feedback, comment banks.
-- =============================================================================

-- ── Enums ────────────────────────────────────────────────────────────────────

do $$ begin
  create type public.annotation_type as enum (
    'text_highlight',
    'freehand',
    'text_comment',
    'area_comment',
    'stamp',
    'selection'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.annotation_visibility as enum (
    'teacher_only',
    'student_visible'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.question_marking_status as enum (
    'unmarked',
    'partially_marked',
    'marked',
    'flagged',
    'not_applicable'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.question_review_state as enum (
    'not_reviewed',
    'reviewed',
    'flag_follow_up',
    'not_attempted'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.question_marking_mode as enum (
    'numeric',
    'reviewed',
    'auto_mcq',
    'comment_only',
    'not_applicable'
  );
exception when duplicate_object then null;
end $$;

-- ── Extend school_marking_symbols → full stamp assets ─────────────────────────

alter table public.school_marking_symbols
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists category text not null default 'general',
  add column if not exists accessible_label text,
  add column if not exists default_size_pct numeric(5,2) not null default 8.0,
  add column if not exists subject_restriction text,
  add column if not exists teacher_restriction_ids uuid[] not null default '{}',
  add column if not exists assignment_restriction_ids uuid[] not null default '{}',
  add column if not exists archived_at timestamptz,
  add column if not exists created_by uuid references public.profiles (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.school_marking_symbols
set accessible_label = coalesce(nullif(btrim(accessible_label), ''), name)
where accessible_label is null;

create index if not exists school_marking_symbols_active_sort_idx
  on public.school_marking_symbols (is_active, sort_order)
  where archived_at is null;

create index if not exists school_marking_symbols_category_idx
  on public.school_marking_symbols (category);

drop trigger if exists school_marking_symbols_set_updated_at on public.school_marking_symbols;
create trigger school_marking_symbols_set_updated_at
  before update on public.school_marking_symbols
  for each row execute function public.set_updated_at();

-- ── Assignment stamp selection (relationship, not file copy) ─────────────────

create table if not exists public.assignment_stamp_selections (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  stamp_id uuid not null references public.school_marking_symbols (id) on delete restrict,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  default_size_pct_override numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, stamp_id)
);

create index if not exists assignment_stamp_selections_assignment_idx
  on public.assignment_stamp_selections (assignment_id, sort_order);

drop trigger if exists assignment_stamp_selections_set_updated_at
  on public.assignment_stamp_selections;
create trigger assignment_stamp_selections_set_updated_at
  before update on public.assignment_stamp_selections
  for each row execute function public.set_updated_at();

-- ── Submission annotations (separate from student files) ─────────────────────

create table if not exists public.submission_annotations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  question_id uuid,
  block_id text,
  page_number integer,
  target_kind text not null default 'worksheet'
    check (target_kind in ('worksheet', 'pdf', 'image', 'docx', 'file')),
  target_path text,
  annotation_type public.annotation_type not null,
  x_norm numeric(8,6) not null default 0
    check (x_norm >= 0 and x_norm <= 1),
  y_norm numeric(8,6) not null default 0
    check (y_norm >= 0 and y_norm <= 1),
  w_norm numeric(8,6) not null default 0
    check (w_norm >= 0 and w_norm <= 1),
  h_norm numeric(8,6) not null default 0
    check (h_norm >= 0 and h_norm <= 1),
  geometry jsonb not null default '{}'::jsonb,
  text_content text,
  colour text not null default '#ef4444',
  opacity numeric(4,3) not null default 0.35
    check (opacity >= 0 and opacity <= 1),
  stroke_width numeric(6,2) not null default 2,
  stamp_id uuid references public.school_marking_symbols (id) on delete restrict,
  visibility public.annotation_visibility not null default 'teacher_only',
  client_version bigint not null default 1,
  is_deleted boolean not null default false,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists submission_annotations_submission_idx
  on public.submission_annotations (submission_id)
  where is_deleted = false;

create index if not exists submission_annotations_question_idx
  on public.submission_annotations (submission_id, question_id)
  where is_deleted = false;

create index if not exists submission_annotations_assignment_idx
  on public.submission_annotations (assignment_id);

create index if not exists submission_annotations_stamp_idx
  on public.submission_annotations (stamp_id)
  where stamp_id is not null;

drop trigger if exists submission_annotations_set_updated_at on public.submission_annotations;
create trigger submission_annotations_set_updated_at
  before update on public.submission_annotations
  for each row execute function public.set_updated_at();

create table if not exists public.submission_annotation_events (
  id uuid primary key default gen_random_uuid(),
  annotation_id uuid references public.submission_annotations (id) on delete set null,
  submission_id uuid not null references public.submissions (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists submission_annotation_events_submission_idx
  on public.submission_annotation_events (submission_id, created_at desc);

-- ── Question-level marking records ───────────────────────────────────────────

create table if not exists public.question_marks (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  question_id uuid not null,
  marking_mode public.question_marking_mode not null default 'numeric',
  awarded_mark numeric(8,2),
  maximum_mark numeric(8,2) not null default 0,
  review_state public.question_review_state,
  marking_status public.question_marking_status not null default 'unmarked',
  question_feedback text,
  teacher_only_note text,
  automatic_mark numeric(8,2),
  override_mark numeric(8,2),
  override_reason text,
  flagged boolean not null default false,
  client_version bigint not null default 1,
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_marks_submission_question_key unique (submission_id, question_id),
  constraint question_marks_range_chk check (
    awarded_mark is null
    or (awarded_mark >= 0 and awarded_mark <= greatest(maximum_mark, 0))
  )
);

create index if not exists question_marks_submission_idx
  on public.question_marks (submission_id);

create index if not exists question_marks_status_idx
  on public.question_marks (submission_id, marking_status);

drop trigger if exists question_marks_set_updated_at on public.question_marks;
create trigger question_marks_set_updated_at
  before update on public.question_marks
  for each row execute function public.set_updated_at();

-- Optional document preview metadata (DOCX derived preview, etc.)
create table if not exists public.submission_file_previews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  source_storage_path text not null,
  preview_kind text not null check (preview_kind in ('pdf', 'html', 'image', 'unsupported')),
  preview_storage_path text,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, source_storage_path)
);

drop trigger if exists submission_file_previews_set_updated_at on public.submission_file_previews;
create trigger submission_file_previews_set_updated_at
  before update on public.submission_file_previews
  for each row execute function public.set_updated_at();

-- Assignment marking preferences
alter table public.assignments
  add column if not exists annotation_default_visibility public.annotation_visibility
    not null default 'teacher_only',
  add column if not exists allow_decimal_question_marks boolean not null default false,
  add column if not exists circular_mark_threshold integer not null default 10;

-- ── Storage bucket: marking-stamps (private) ─────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marking-stamps',
  'marking-stamps',
  false,
  2097152,
  array['image/png', 'image/svg+xml', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists marking_stamps_admin_all on storage.objects;
create policy marking_stamps_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'marking-stamps' and public.is_admin())
  with check (bucket_id = 'marking-stamps' and public.is_admin());

drop policy if exists marking_stamps_teacher_read on storage.objects;
create policy marking_stamps_teacher_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'marking-stamps'
    and (public.is_admin() or public.is_teacher())
  );

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.assignment_stamp_selections enable row level security;
alter table public.submission_annotations enable row level security;
alter table public.submission_annotation_events enable row level security;
alter table public.question_marks enable row level security;
alter table public.submission_file_previews enable row level security;

-- Stamp selections
drop policy if exists assignment_stamp_selections_admin on public.assignment_stamp_selections;
create policy assignment_stamp_selections_admin on public.assignment_stamp_selections
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists assignment_stamp_selections_teacher on public.assignment_stamp_selections;
create policy assignment_stamp_selections_teacher on public.assignment_stamp_selections
  for all to authenticated
  using (
    public.is_teacher()
    and exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and public.teacher_in_class(a.class_id)
    )
  )
  with check (
    public.is_teacher()
    and exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and public.teacher_in_class(a.class_id)
    )
  );

-- Annotations
drop policy if exists submission_annotations_admin on public.submission_annotations;
create policy submission_annotations_admin on public.submission_annotations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists submission_annotations_teacher on public.submission_annotations;
create policy submission_annotations_teacher on public.submission_annotations
  for all to authenticated
  using (
    public.is_teacher()
    and public.teacher_can_mark_submission(submission_id)
  )
  with check (
    public.is_teacher()
    and public.teacher_can_mark_submission(submission_id)
  );

drop policy if exists submission_annotations_student_read on public.submission_annotations;
create policy submission_annotations_student_read on public.submission_annotations
  for select to authenticated
  using (
    public.is_student()
    and is_deleted = false
    and visibility = 'student_visible'
    and exists (
      select 1
      from public.submissions s
      join public.feedback f on f.submission_id = s.id
      where s.id = submission_annotations.submission_id
        and s.student_id = auth.uid()
        and f.status = 'released'
    )
  );

-- Annotation events
drop policy if exists submission_annotation_events_admin on public.submission_annotation_events;
create policy submission_annotation_events_admin on public.submission_annotation_events
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists submission_annotation_events_teacher on public.submission_annotation_events;
create policy submission_annotation_events_teacher on public.submission_annotation_events
  for all to authenticated
  using (
    public.is_teacher()
    and public.teacher_can_mark_submission(submission_id)
  )
  with check (
    public.is_teacher()
    and public.teacher_can_mark_submission(submission_id)
  );

-- Question marks
drop policy if exists question_marks_admin on public.question_marks;
create policy question_marks_admin on public.question_marks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists question_marks_teacher on public.question_marks;
create policy question_marks_teacher on public.question_marks
  for all to authenticated
  using (
    public.is_teacher()
    and public.teacher_can_mark_submission(submission_id)
  )
  with check (
    public.is_teacher()
    and public.teacher_can_mark_submission(submission_id)
  );

drop policy if exists question_marks_student_read on public.question_marks;
create policy question_marks_student_read on public.question_marks
  for select to authenticated
  using (
    public.is_student()
    and exists (
      select 1
      from public.submissions s
      join public.feedback f on f.submission_id = s.id
      where s.id = question_marks.submission_id
        and s.student_id = auth.uid()
        and f.status = 'released'
    )
  );

-- File previews
drop policy if exists submission_file_previews_admin on public.submission_file_previews;
create policy submission_file_previews_admin on public.submission_file_previews
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists submission_file_previews_teacher on public.submission_file_previews;
create policy submission_file_previews_teacher on public.submission_file_previews
  for all to authenticated
  using (
    public.is_teacher()
    and public.teacher_can_mark_submission(submission_id)
  )
  with check (
    public.is_teacher()
    and public.teacher_can_mark_submission(submission_id)
  );

-- Grants
grant select, insert, update, delete on public.assignment_stamp_selections to authenticated;
grant select, insert, update, delete on public.submission_annotations to authenticated;
grant select, insert on public.submission_annotation_events to authenticated;
grant select, insert, update, delete on public.question_marks to authenticated;
grant select, insert, update, delete on public.submission_file_previews to authenticated;

-- Optimistic concurrency helper for annotations
create or replace function public.upsert_submission_annotation(
  p_payload jsonb
)
returns public.submission_annotations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_existing public.submission_annotations;
  v_incoming_version bigint := coalesce((p_payload->>'client_version')::bigint, 1);
  v_row public.submission_annotations;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_id is not null then
    select * into v_existing
    from public.submission_annotations
    where id = v_id
    for update;

    if v_existing.id is not null and v_incoming_version < v_existing.client_version then
      raise exception 'stale_annotation_version';
    end if;
  end if;

  insert into public.submission_annotations (
    id, submission_id, assignment_id, question_id, block_id, page_number,
    target_kind, target_path, annotation_type,
    x_norm, y_norm, w_norm, h_norm, geometry, text_content,
    colour, opacity, stroke_width, stamp_id, visibility,
    client_version, is_deleted, created_by
  ) values (
    coalesce(v_id, gen_random_uuid()),
    (p_payload->>'submission_id')::uuid,
    (p_payload->>'assignment_id')::uuid,
    nullif(p_payload->>'question_id', '')::uuid,
    nullif(p_payload->>'block_id', ''),
    nullif(p_payload->>'page_number', '')::int,
    coalesce(p_payload->>'target_kind', 'worksheet'),
    nullif(p_payload->>'target_path', ''),
    (p_payload->>'annotation_type')::public.annotation_type,
    coalesce((p_payload->>'x_norm')::numeric, 0),
    coalesce((p_payload->>'y_norm')::numeric, 0),
    coalesce((p_payload->>'w_norm')::numeric, 0),
    coalesce((p_payload->>'h_norm')::numeric, 0),
    coalesce(p_payload->'geometry', '{}'::jsonb),
    nullif(p_payload->>'text_content', ''),
    coalesce(nullif(p_payload->>'colour', ''), '#ef4444'),
    coalesce((p_payload->>'opacity')::numeric, 0.35),
    coalesce((p_payload->>'stroke_width')::numeric, 2),
    nullif(p_payload->>'stamp_id', '')::uuid,
    coalesce(
      nullif(p_payload->>'visibility', '')::public.annotation_visibility,
      'teacher_only'::public.annotation_visibility
    ),
    v_incoming_version,
    coalesce((p_payload->>'is_deleted')::boolean, false),
    v_uid
  )
  on conflict (id) do update
  set
    question_id = excluded.question_id,
    block_id = excluded.block_id,
    page_number = excluded.page_number,
    target_kind = excluded.target_kind,
    target_path = excluded.target_path,
    x_norm = excluded.x_norm,
    y_norm = excluded.y_norm,
    w_norm = excluded.w_norm,
    h_norm = excluded.h_norm,
    geometry = excluded.geometry,
    text_content = excluded.text_content,
    colour = excluded.colour,
    opacity = excluded.opacity,
    stroke_width = excluded.stroke_width,
    stamp_id = excluded.stamp_id,
    visibility = excluded.visibility,
    client_version = excluded.client_version,
    is_deleted = excluded.is_deleted,
    updated_at = now()
  where public.submission_annotations.client_version <= excluded.client_version
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.upsert_submission_annotation(jsonb) from public, anon;
grant execute on function public.upsert_submission_annotation(jsonb) to authenticated;

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
    automatic_mark, override_mark, override_reason, flagged,
    client_version, marked_by, marked_at
  ) values (
    v_submission_id,
    v_question_id,
    coalesce(
      nullif(p_payload->>'marking_mode', '')::public.question_marking_mode,
      'numeric'::public.question_marking_mode
    ),
    nullif(p_payload->>'awarded_mark', '')::numeric,
    coalesce((p_payload->>'maximum_mark')::numeric, 0),
    nullif(p_payload->>'review_state', '')::public.question_review_state,
    v_status,
    nullif(p_payload->>'question_feedback', ''),
    nullif(p_payload->>'teacher_only_note', ''),
    nullif(p_payload->>'automatic_mark', '')::numeric,
    nullif(p_payload->>'override_mark', '')::numeric,
    nullif(p_payload->>'override_reason', ''),
    coalesce((p_payload->>'flagged')::boolean, false),
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
    client_version = excluded.client_version,
    marked_by = excluded.marked_by,
    marked_at = excluded.marked_at,
    updated_at = now()
  where public.question_marks.client_version <= excluded.client_version
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.upsert_question_mark(jsonb) from public, anon;
grant execute on function public.upsert_question_mark(jsonb) to authenticated;

notify pgrst, 'reload schema';
