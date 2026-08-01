-- ============================================================================
-- Homework Passport — repair/improve Phase 4/6 structured homework builder
-- Safe to re-run. Additive only; does not drop production data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Builder enum extensions (best effort for already-applied databases)
-- ---------------------------------------------------------------------------
do $$
declare
  v_value text;
begin
  foreach v_value in array array[
    'passage',
    'embedded_video',
    'multiple_select',
    'teacher_instruction',
    'moderation_note',
    'staff_resource'
  ]
  loop
    begin
      execute format(
        'alter type public.assignment_block_type add value if not exists %L',
        v_value
      );
    exception
      when duplicate_object then null;
      when undefined_object then null;
      when others then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Question configuration columns
-- ---------------------------------------------------------------------------
alter table public.assignment_questions
  add column if not exists marks_apply boolean not null default true;
alter table public.assignment_questions
  add column if not exists marking_mode text default 'teacher_reviewed';
alter table public.assignment_questions
  add column if not exists shuffle_options boolean not null default false;
alter table public.assignment_questions
  add column if not exists suggested_minutes integer;
alter table public.assignment_questions
  add column if not exists passage_block_ids jsonb default '[]'::jsonb;
alter table public.assignment_questions
  add column if not exists option_feedback jsonb default '[]'::jsonb;
alter table public.assignment_questions
  add column if not exists correct_option_indexes jsonb default '[]'::jsonb;
alter table public.assignment_questions
  add column if not exists table_marks_mode text default 'none';
alter table public.assignment_questions
  add column if not exists table_total_marks numeric(8,2);

update public.assignment_questions
set marking_mode = 'teacher_reviewed'
where marking_mode is not null
  and marking_mode not in ('teacher_reviewed', 'automatic');

update public.assignment_questions
set table_marks_mode = 'none'
where table_marks_mode is not null
  and table_marks_mode not in ('none', 'per_row', 'per_cell', 'total');

do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignment_questions_marking_mode_check'
      and conrelid = 'public.assignment_questions'::regclass
  ) then
    alter table public.assignment_questions
      add constraint assignment_questions_marking_mode_check
      check (
        marking_mode is null
        or marking_mode in ('teacher_reviewed', 'automatic')
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignment_questions_table_marks_mode_check'
      and conrelid = 'public.assignment_questions'::regclass
  ) then
    alter table public.assignment_questions
      add constraint assignment_questions_table_marks_mode_check
      check (
        table_marks_mode is null
        or table_marks_mode in ('none', 'per_row', 'per_cell', 'total')
      );
  end if;
end $$;

comment on column public.assignment_questions.option_feedback is
  'Parallel to choices; per-option feedback for automatic and teacher-reviewed marking.';
comment on column public.assignment_questions.correct_option_indexes is
  'Zero-based correct choice indexes for multiple_select questions.';
comment on column public.assignment_questions.passage_block_ids is
  'JSON array of assignment_blocks.id values that provide source passages for this question.';

-- assignment_blocks.config is already jsonb and remains the flexible per-block
-- configuration surface for rich builder blocks.
comment on column public.assignment_blocks.config is
  'Flexible JSONB configuration for structured homework builder blocks.';

-- ---------------------------------------------------------------------------
-- 3. Template/deployment mark and overview metadata
-- ---------------------------------------------------------------------------
alter table public.assignment_templates
  add column if not exists calculated_maximum_mark numeric(10,2);
alter table public.assignment_templates
  add column if not exists overview text;
alter table public.assignment_templates
  add column if not exists marking_instructions text;

alter table public.assignments
  add column if not exists calculated_maximum_mark numeric(10,2);

-- Only perform the legacy manual-override backfill when the column is first
-- introduced. Re-running the migration must not mark newly-created deployments
-- as manual overrides.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'assignments'
      and column_name = 'marks_manual_override'
  ) then
    alter table public.assignments
      add column marks_manual_override boolean not null default false;

    update public.assignments
    set marks_manual_override = true
    where maximum_mark is not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Assignment resources enhancements
-- ---------------------------------------------------------------------------
create table if not exists public.assignment_resources (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  file_name text not null default '',
  storage_path text not null default '',
  file_type text not null default 'application/octet-stream',
  file_size bigint,
  created_at timestamptz not null default now()
);

alter table public.assignment_resources
  add column if not exists resource_kind text;
alter table public.assignment_resources
  add column if not exists title text;
alter table public.assignment_resources
  add column if not exists description text;
alter table public.assignment_resources
  add column if not exists external_url text;
alter table public.assignment_resources
  add column if not exists mime_type text;
alter table public.assignment_resources
  add column if not exists file_size_bytes bigint;
alter table public.assignment_resources
  add column if not exists poster_storage_path text;
alter table public.assignment_resources
  add column if not exists captions_text text;
alter table public.assignment_resources
  add column if not exists transcript_text text;
alter table public.assignment_resources
  add column if not exists allow_download boolean not null default true;
alter table public.assignment_resources
  add column if not exists sort_order int not null default 0;
alter table public.assignment_resources
  add column if not exists visibility text not null default 'student';
alter table public.assignment_resources
  add column if not exists linked_question_id uuid references public.assignment_questions (id) on delete set null;
alter table public.assignment_resources
  add column if not exists archived boolean not null default false;

update public.assignment_resources
set
  file_size_bytes = coalesce(file_size_bytes, file_size),
  mime_type = coalesce(mime_type, nullif(file_type, '')),
  title = coalesce(title, nullif(file_name, ''))
where file_size_bytes is null
   or mime_type is null
   or title is null;

update public.assignment_resources
set resource_kind = case
  when resource_kind in (
    'pdf', 'docx', 'image', 'audio', 'video', 'external_video', 'other',
    'mark_scheme'
  ) then resource_kind
  when coalesce(external_url, '') <> ''
       and lower(coalesce(mime_type, file_type, '')) like '%video%' then 'external_video'
  when lower(coalesce(mime_type, file_type, file_name, '')) like '%pdf%' then 'pdf'
  when lower(coalesce(mime_type, file_type, file_name, '')) like '%word%'
       or lower(coalesce(mime_type, file_type, file_name, '')) like '%docx%' then 'docx'
  when lower(coalesce(mime_type, file_type, '')) like 'image/%' then 'image'
  when lower(coalesce(mime_type, file_type, '')) like 'audio/%' then 'audio'
  when lower(coalesce(mime_type, file_type, '')) like 'video/%' then 'video'
  else 'other'
end
where resource_kind is null
   or resource_kind not in (
    'pdf', 'docx', 'image', 'audio', 'video', 'external_video', 'other',
    'mark_scheme'
  );

update public.assignment_resources
set visibility = 'student'
where visibility not in ('student', 'staff');

do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignment_resources_resource_kind_check'
      and conrelid = 'public.assignment_resources'::regclass
  ) then
    alter table public.assignment_resources
      add constraint assignment_resources_resource_kind_check
      check (
        resource_kind is null
        or resource_kind in (
          'pdf', 'docx', 'image', 'audio', 'video', 'external_video', 'other',
          'mark_scheme'
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignment_resources_visibility_check'
      and conrelid = 'public.assignment_resources'::regclass
  ) then
    alter table public.assignment_resources
      add constraint assignment_resources_visibility_check
      check (visibility in ('student', 'staff'));
  end if;
end $$;

create index if not exists assignment_resources_assignment_sort_idx
  on public.assignment_resources (assignment_id, sort_order);
create index if not exists assignment_resources_linked_question_idx
  on public.assignment_resources (linked_question_id)
  where linked_question_id is not null;
create index if not exists assignment_resources_visibility_idx
  on public.assignment_resources (visibility, archived);

alter table public.assignment_resources enable row level security;

drop policy if exists "Admins manage assignment resources" on public.assignment_resources;
create policy "Admins manage assignment resources"
  on public.assignment_resources for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Teachers manage resources for own assignments" on public.assignment_resources;
create policy "Teachers manage resources for own assignments"
  on public.assignment_resources for all to authenticated
  using (
    exists (
      select 1
      from public.assignments a
      where a.id = assignment_id
        and public.teacher_in_class(a.class_id)
    )
  )
  with check (
    exists (
      select 1
      from public.assignments a
      where a.id = assignment_id
        and public.teacher_can_create_assignments(a.class_id)
    )
  );

drop policy if exists "Students view resources for published class assignments" on public.assignment_resources;
create policy "Students view resources for published class assignments"
  on public.assignment_resources for select to authenticated
  using (
    visibility = 'student'
    and archived = false
    and exists (
      select 1
      from public.assignments a
      where a.id = assignment_id
        and a.status = 'published'
        and public.student_in_class(a.class_id)
        and (a.release_at is null or a.release_at <= now())
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Dedicated assignment mark schemes
-- ---------------------------------------------------------------------------
create table if not exists public.assignment_mark_schemes (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.assignment_templates (id) on delete cascade,
  title text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text default 'application/pdf',
  file_size_bytes bigint,
  sort_order int not null default 0,
  linked_question_id uuid references public.assignment_questions (id) on delete set null,
  archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assignment_mark_schemes_template_idx
  on public.assignment_mark_schemes (template_id);
create index if not exists assignment_mark_schemes_sort_order_idx
  on public.assignment_mark_schemes (sort_order);
create index if not exists assignment_mark_schemes_template_sort_idx
  on public.assignment_mark_schemes (template_id, sort_order);

drop trigger if exists assignment_mark_schemes_set_updated_at on public.assignment_mark_schemes;
create trigger assignment_mark_schemes_set_updated_at
  before update on public.assignment_mark_schemes
  for each row execute function public.set_updated_at();

alter table public.assignment_mark_schemes enable row level security;

drop policy if exists assignment_mark_schemes_admin on public.assignment_mark_schemes;
create policy assignment_mark_schemes_admin on public.assignment_mark_schemes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists assignment_mark_schemes_teacher_edit on public.assignment_mark_schemes;
create policy assignment_mark_schemes_teacher_edit on public.assignment_mark_schemes
  for all to authenticated
  using (public.teacher_can_edit_template(template_id))
  with check (public.teacher_can_edit_template(template_id));

-- No student SELECT policy is created for assignment_mark_schemes.

-- ---------------------------------------------------------------------------
-- 6. Assignment comment bank links and assignment-specific comments
-- ---------------------------------------------------------------------------
create table if not exists public.assignment_comment_bank_links (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.assignment_templates (id) on delete cascade,
  comment_bank_id uuid not null references public.school_default_comment_banks (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (template_id, comment_bank_id)
);

create index if not exists assignment_comment_bank_links_template_idx
  on public.assignment_comment_bank_links (template_id);
create index if not exists assignment_comment_bank_links_comment_bank_idx
  on public.assignment_comment_bank_links (comment_bank_id);

alter table public.assignment_comment_bank_links enable row level security;

drop policy if exists assignment_comment_bank_links_admin on public.assignment_comment_bank_links;
create policy assignment_comment_bank_links_admin on public.assignment_comment_bank_links
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists assignment_comment_bank_links_teacher_edit on public.assignment_comment_bank_links;
create policy assignment_comment_bank_links_teacher_edit on public.assignment_comment_bank_links
  for all to authenticated
  using (public.teacher_can_edit_template(template_id))
  with check (public.teacher_can_edit_template(template_id));

create table if not exists public.assignment_comments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.assignment_templates (id) on delete cascade,
  short_label text not null,
  full_comment text not null,
  category text,
  linked_question_id uuid references public.assignment_questions (id) on delete set null,
  mark_range_min numeric,
  mark_range_max numeric,
  is_active boolean default true,
  sort_order int default 0,
  available_for_drag_drop boolean default true,
  available_for_overall boolean default true,
  available_for_question boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assignment_comments_template_idx
  on public.assignment_comments (template_id);
create index if not exists assignment_comments_template_sort_idx
  on public.assignment_comments (template_id, sort_order);
create index if not exists assignment_comments_linked_question_idx
  on public.assignment_comments (linked_question_id)
  where linked_question_id is not null;

drop trigger if exists assignment_comments_set_updated_at on public.assignment_comments;
create trigger assignment_comments_set_updated_at
  before update on public.assignment_comments
  for each row execute function public.set_updated_at();

alter table public.assignment_comments enable row level security;

drop policy if exists assignment_comments_admin on public.assignment_comments;
create policy assignment_comments_admin on public.assignment_comments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists assignment_comments_teacher_edit on public.assignment_comments;
create policy assignment_comments_teacher_edit on public.assignment_comments
  for all to authenticated
  using (public.teacher_can_edit_template(template_id))
  with check (public.teacher_can_edit_template(template_id));

-- No student SELECT policy is created for assignment_comments.

-- ---------------------------------------------------------------------------
-- 7. Student template visibility must continue to honour release_at.
-- ---------------------------------------------------------------------------
create or replace function public.student_can_view_template(p_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assignments a
    where a.template_id = p_template_id
      and a.status = 'published'
      and public.student_in_class(a.class_id)
      and (a.release_at is null or a.release_at <= now())
  );
$$;

-- ---------------------------------------------------------------------------
-- 8. Recalculate and sync calculated maximum marks
-- ---------------------------------------------------------------------------
create or replace function public.recalculate_template_maximum_mark(
  p_template_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(10,2);
begin
  select coalesce(
    sum(
      case
        when coalesce(q.marks_apply, true)
          and not coalesce(q.review_only, false)
        then
          coalesce(q.max_marks, 0)
          + case coalesce(q.table_marks_mode, 'none')
              when 'total' then coalesce(q.table_total_marks, 0)
              when 'per_row' then coalesce((
                select sum(coalesce(c.marks, 0))
                from public.assignment_table_cells c
                where c.block_id = q.block_id
              ), 0)
              when 'per_cell' then coalesce((
                select sum(coalesce(c.marks, 0))
                from public.assignment_table_cells c
                where c.block_id = q.block_id
              ), 0)
              else 0
            end
        else 0
      end
    ),
    0
  )::numeric(10,2)
  into v_total
  from public.assignment_questions q
  join public.assignment_blocks b on b.id = q.block_id
  join public.assignment_sections s on s.id = b.section_id
  where s.template_id = p_template_id;

  v_total := round(coalesce(v_total, 0), 2);

  update public.assignment_templates
  set calculated_maximum_mark = v_total,
      updated_at = now()
  where id = p_template_id;

  update public.assignments
  set calculated_maximum_mark = v_total,
      maximum_mark = case
        -- Existing maximum_mark is numeric(6,2) with a > 0 check in schema.sql.
        when v_total > 0 and v_total <= 9999.99 then v_total
        else maximum_mark
      end,
      updated_at = now()
  where template_id = p_template_id
    and marks_manual_override = false;

  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. ID-preserving structured builder save RPCs
-- ---------------------------------------------------------------------------
create or replace function public._upsert_structure_block(
  p_section_id uuid,
  p_block jsonb,
  p_sort_order int,
  p_template_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block_id uuid := nullif(p_block ->> 'id', '')::uuid;
  v_insert_block_id uuid;
  v_question_id uuid := nullif(p_block ->> 'question_id', '')::uuid;
  v_insert_question_id uuid;
  v_is_response boolean;
  v_cell jsonb;
  v_existing_section uuid;
  v_existing_template_id uuid;
  v_question_template_id uuid;
begin
  v_is_response := (p_block ->> 'block_type') in (
    'numbered_question',
    'short_text',
    'extended_writing',
    'numeric',
    'multiple_choice',
    'multiple_select',
    'tick_box',
    'teacher_review',
    'file_upload',
    'table',
    'vocabulary_table'
  );

  if v_block_id is not null then
    select b.section_id, s.template_id
    into v_existing_section, v_existing_template_id
    from public.assignment_blocks b
    join public.assignment_sections s on s.id = b.section_id
    where b.id = v_block_id;

    if found and v_existing_template_id <> p_template_id then
      -- Never let a client-supplied UUID move a block from another template.
      v_block_id := null;
    end if;
  end if;

  if v_block_id is null or v_existing_section is null then
    v_insert_block_id := coalesce(v_block_id, gen_random_uuid());

    insert into public.assignment_blocks (
      id, section_id, block_type, sort_order, content, config, teacher_only
    ) values (
      v_insert_block_id,
      p_section_id,
      (p_block ->> 'block_type')::public.assignment_block_type,
      p_sort_order,
      coalesce(p_block ->> 'content', ''),
      coalesce(p_block -> 'config', '{}'::jsonb),
      coalesce((p_block ->> 'teacher_only')::boolean, false)
        or (p_block ->> 'block_type') in (
          'mark_scheme',
          'teacher_review',
          'teacher_instruction',
          'moderation_note',
          'staff_resource'
        )
    )
    returning id into v_block_id;
  else
    update public.assignment_blocks
    set
      section_id = p_section_id,
      block_type = (p_block ->> 'block_type')::public.assignment_block_type,
      sort_order = p_sort_order,
      content = coalesce(p_block ->> 'content', ''),
      config = coalesce(p_block -> 'config', '{}'::jsonb),
      teacher_only = coalesce((p_block ->> 'teacher_only')::boolean, false)
        or (p_block ->> 'block_type') in (
          'mark_scheme',
          'teacher_review',
          'teacher_instruction',
          'moderation_note',
          'staff_resource'
        ),
      updated_at = now()
    where id = v_block_id;
  end if;

  if v_is_response then
    if v_question_id is not null then
      select s.template_id
      into v_question_template_id
      from public.assignment_questions q
      join public.assignment_blocks b on b.id = q.block_id
      join public.assignment_sections s on s.id = b.section_id
      where q.id = v_question_id;

      if found and v_question_template_id = p_template_id then
        update public.assignment_questions q
        set
          block_id = v_block_id,
          prompt = coalesce(nullif(p_block ->> 'prompt', ''), p_block ->> 'content', ''),
          max_marks = nullif(p_block ->> 'max_marks', '')::numeric,
          required = coalesce((p_block ->> 'required')::boolean, false),
          response_type = coalesce(nullif(p_block ->> 'response_type', ''), p_block ->> 'block_type'),
          choices = coalesce(p_block -> 'choices', '[]'::jsonb),
          sort_order = p_sort_order,
          teacher_note = p_block ->> 'teacher_note',
          mark_scheme_note = p_block ->> 'mark_scheme_note',
          word_limit = nullif(p_block ->> 'word_limit', '')::int,
          char_limit = nullif(p_block ->> 'char_limit', '')::int,
          allow_attachments = coalesce((p_block ->> 'allow_attachments')::boolean, false),
          min_value = nullif(p_block ->> 'min_value', '')::numeric,
          max_value = nullif(p_block ->> 'max_value', '')::numeric,
          correct_answer = p_block -> 'correct_answer',
          comment_bank_key = nullif(p_block ->> 'comment_bank_key', ''),
          review_only = coalesce((p_block ->> 'review_only')::boolean, false)
            or (p_block ->> 'block_type') = 'teacher_review',
          marks_apply = coalesce((p_block ->> 'marks_apply')::boolean, true),
          marking_mode = case
            when p_block ->> 'marking_mode' in ('teacher_reviewed', 'automatic')
              then p_block ->> 'marking_mode'
            else 'teacher_reviewed'
          end,
          shuffle_options = coalesce((p_block ->> 'shuffle_options')::boolean, false),
          suggested_minutes = nullif(p_block ->> 'suggested_minutes', '')::int,
          passage_block_ids = coalesce(p_block -> 'passage_block_ids', '[]'::jsonb),
          option_feedback = coalesce(p_block -> 'option_feedback', '[]'::jsonb),
          correct_option_indexes = coalesce(p_block -> 'correct_option_indexes', '[]'::jsonb),
          table_marks_mode = case
            when p_block ->> 'table_marks_mode' in ('none', 'per_row', 'per_cell', 'total')
              then p_block ->> 'table_marks_mode'
            else 'none'
          end,
          table_total_marks = nullif(p_block ->> 'table_total_marks', '')::numeric,
          updated_at = now()
        where q.id = v_question_id;
      elsif found then
        -- The UUID belongs to another template; generate a safe server ID.
        v_question_id := null;
      end if;
    end if;

    if v_question_id is null or v_question_template_id is null then
      v_insert_question_id := coalesce(v_question_id, gen_random_uuid());

      insert into public.assignment_questions (
        id,
        block_id,
        prompt,
        max_marks,
        required,
        response_type,
        choices,
        sort_order,
        teacher_note,
        mark_scheme_note,
        word_limit,
        char_limit,
        allow_attachments,
        min_value,
        max_value,
        correct_answer,
        comment_bank_key,
        review_only,
        marks_apply,
        marking_mode,
        shuffle_options,
        suggested_minutes,
        passage_block_ids,
        option_feedback,
        correct_option_indexes,
        table_marks_mode,
        table_total_marks
      ) values (
        v_insert_question_id,
        v_block_id,
        coalesce(nullif(p_block ->> 'prompt', ''), p_block ->> 'content', ''),
        nullif(p_block ->> 'max_marks', '')::numeric,
        coalesce((p_block ->> 'required')::boolean, false),
        coalesce(nullif(p_block ->> 'response_type', ''), p_block ->> 'block_type'),
        coalesce(p_block -> 'choices', '[]'::jsonb),
        p_sort_order,
        p_block ->> 'teacher_note',
        p_block ->> 'mark_scheme_note',
        nullif(p_block ->> 'word_limit', '')::int,
        nullif(p_block ->> 'char_limit', '')::int,
        coalesce((p_block ->> 'allow_attachments')::boolean, false),
        nullif(p_block ->> 'min_value', '')::numeric,
        nullif(p_block ->> 'max_value', '')::numeric,
        p_block -> 'correct_answer',
        nullif(p_block ->> 'comment_bank_key', ''),
        coalesce((p_block ->> 'review_only')::boolean, false)
          or (p_block ->> 'block_type') = 'teacher_review',
        coalesce((p_block ->> 'marks_apply')::boolean, true),
        case
          when p_block ->> 'marking_mode' in ('teacher_reviewed', 'automatic')
            then p_block ->> 'marking_mode'
          else 'teacher_reviewed'
        end,
        coalesce((p_block ->> 'shuffle_options')::boolean, false),
        nullif(p_block ->> 'suggested_minutes', '')::int,
        coalesce(p_block -> 'passage_block_ids', '[]'::jsonb),
        coalesce(p_block -> 'option_feedback', '[]'::jsonb),
        coalesce(p_block -> 'correct_option_indexes', '[]'::jsonb),
        case
          when p_block ->> 'table_marks_mode' in ('none', 'per_row', 'per_cell', 'total')
            then p_block ->> 'table_marks_mode'
          else 'none'
        end,
        nullif(p_block ->> 'table_total_marks', '')::numeric
      )
      on conflict (block_id) do update
      set
        prompt = excluded.prompt,
        max_marks = excluded.max_marks,
        required = excluded.required,
        response_type = excluded.response_type,
        choices = excluded.choices,
        sort_order = excluded.sort_order,
        teacher_note = excluded.teacher_note,
        mark_scheme_note = excluded.mark_scheme_note,
        word_limit = excluded.word_limit,
        char_limit = excluded.char_limit,
        allow_attachments = excluded.allow_attachments,
        min_value = excluded.min_value,
        max_value = excluded.max_value,
        correct_answer = excluded.correct_answer,
        comment_bank_key = excluded.comment_bank_key,
        review_only = excluded.review_only,
        marks_apply = excluded.marks_apply,
        marking_mode = excluded.marking_mode,
        shuffle_options = excluded.shuffle_options,
        suggested_minutes = excluded.suggested_minutes,
        passage_block_ids = excluded.passage_block_ids,
        option_feedback = excluded.option_feedback,
        correct_option_indexes = excluded.correct_option_indexes,
        table_marks_mode = excluded.table_marks_mode,
        table_total_marks = excluded.table_total_marks,
        updated_at = now()
      returning id into v_question_id;
    end if;

    delete from public.assignment_table_cells where block_id = v_block_id;
    if (p_block ->> 'block_type') in ('table', 'vocabulary_table')
       and jsonb_typeof(p_block -> 'cells') = 'array' then
      for v_cell in select value from jsonb_array_elements(p_block -> 'cells')
      loop
        insert into public.assignment_table_cells (
          block_id, row_index, col_index, cell_type, label, marks, read_only, config
        ) values (
          v_block_id,
          coalesce((v_cell ->> 'row_index')::int, 0),
          coalesce((v_cell ->> 'col_index')::int, 0),
          coalesce(v_cell ->> 'cell_type', 'student_text'),
          v_cell ->> 'label',
          nullif(v_cell ->> 'marks', '')::numeric,
          coalesce((v_cell ->> 'read_only')::boolean, false),
          coalesce(v_cell -> 'config', '{}'::jsonb)
        );
      end loop;
    end if;
  else
    delete from public.assignment_questions where block_id = v_block_id;
    delete from public.assignment_table_cells where block_id = v_block_id;
  end if;

  return v_block_id;
end;
$$;

create or replace function public.save_assignment_structure(
  p_template_id uuid,
  p_structure jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section jsonb;
  v_subsection jsonb;
  v_block jsonb;
  v_section_id uuid;
  v_sub_id uuid;
  v_insert_section_id uuid;
  v_section_template_id uuid;
  v_sub_template_id uuid;
  v_section_ord int := 0;
  v_sub_ord int;
  v_block_ord int;
  v_keep_section_ids uuid[] := '{}';
  v_keep_block_ids uuid[] := '{}';
  v_block_id uuid;
  v_structure jsonb := p_structure;
begin
  if auth.uid() is null or not public.teacher_can_edit_template(p_template_id) then
    raise exception 'Not authorized';
  end if;

  -- Accept JSON string payloads from some clients.
  if jsonb_typeof(v_structure) = 'string' then
    v_structure := (v_structure #>> '{}')::jsonb;
  end if;

  if v_structure is null or jsonb_typeof(v_structure) <> 'array' then
    raise exception 'Structure must be a JSON array of sections';
  end if;

  for v_section in
    select value
    from jsonb_array_elements(v_structure) with ordinality as t(value, ord)
    order by ord
  loop
    v_section_id := nullif(v_section ->> 'id', '')::uuid;
    v_section_template_id := null;

    if v_section_id is not null then
      select template_id
      into v_section_template_id
      from public.assignment_sections
      where id = v_section_id;

      if found and v_section_template_id = p_template_id then
        update public.assignment_sections
        set
          title = coalesce(nullif(v_section ->> 'title', ''), 'Section'),
          sort_order = v_section_ord,
          parent_section_id = null,
          updated_at = now()
        where id = v_section_id;
      elsif found then
        -- Do not move a section from another template.
        v_section_id := null;
      end if;
    end if;

    if v_section_id is null or v_section_template_id is null then
      v_insert_section_id := coalesce(v_section_id, gen_random_uuid());

      insert into public.assignment_sections (
        id, template_id, title, sort_order, parent_section_id
      ) values (
        v_insert_section_id,
        p_template_id,
        coalesce(nullif(v_section ->> 'title', ''), 'Section'),
        v_section_ord,
        null
      )
      returning id into v_section_id;
    end if;

    v_keep_section_ids := array_append(v_keep_section_ids, v_section_id);

    v_block_ord := 0;
    for v_block in
      select value
      from jsonb_array_elements(coalesce(v_section -> 'blocks', '[]'::jsonb))
           with ordinality as t(value, ord)
      order by ord
    loop
      v_block_id := public._upsert_structure_block(
        v_section_id, v_block, v_block_ord, p_template_id
      );
      v_keep_block_ids := array_append(v_keep_block_ids, v_block_id);
      v_block_ord := v_block_ord + 1;
    end loop;

    v_sub_ord := 0;
    for v_subsection in
      select value
      from jsonb_array_elements(coalesce(v_section -> 'subsections', '[]'::jsonb))
           with ordinality as t(value, ord)
      order by ord
    loop
      v_sub_id := nullif(v_subsection ->> 'id', '')::uuid;
      v_sub_template_id := null;

      if v_sub_id is not null then
        select template_id
        into v_sub_template_id
        from public.assignment_sections
        where id = v_sub_id;

        if found and v_sub_template_id = p_template_id then
          update public.assignment_sections
          set
            title = coalesce(nullif(v_subsection ->> 'title', ''), 'Subsection'),
            sort_order = v_sub_ord,
            parent_section_id = v_section_id,
            updated_at = now()
          where id = v_sub_id;
        elsif found then
          -- Do not move a section from another template.
          v_sub_id := null;
        end if;
      end if;

      if v_sub_id is null or v_sub_template_id is null then
        v_insert_section_id := coalesce(v_sub_id, gen_random_uuid());

        insert into public.assignment_sections (
          id, template_id, parent_section_id, title, sort_order
        ) values (
          v_insert_section_id,
          p_template_id,
          v_section_id,
          coalesce(nullif(v_subsection ->> 'title', ''), 'Subsection'),
          v_sub_ord
        )
        returning id into v_sub_id;
      end if;

      v_keep_section_ids := array_append(v_keep_section_ids, v_sub_id);

      v_block_ord := 0;
      for v_block in
        select value
        from jsonb_array_elements(coalesce(v_subsection -> 'blocks', '[]'::jsonb))
             with ordinality as t(value, ord)
        order by ord
      loop
        v_block_id := public._upsert_structure_block(
          v_sub_id, v_block, v_block_ord, p_template_id
        );
        v_keep_block_ids := array_append(v_keep_block_ids, v_block_id);
        v_block_ord := v_block_ord + 1;
      end loop;

      v_sub_ord := v_sub_ord + 1;
    end loop;

    v_section_ord := v_section_ord + 1;
  end loop;

  -- Removed blocks/sections are deleted only when omitted from the saved
  -- structure; surviving client-supplied IDs are preserved.
  delete from public.assignment_blocks b
  using public.assignment_sections s
  where b.section_id = s.id
    and s.template_id = p_template_id
    and not (b.id = any (v_keep_block_ids));

  delete from public.assignment_sections s
  where s.template_id = p_template_id
    and not (s.id = any (v_keep_section_ids));

  perform public.recalculate_template_maximum_mark(p_template_id);
end;
$$;

-- Keep legacy insert helper for older callers.
create or replace function public._insert_structure_block(
  p_section_id uuid,
  p_block jsonb,
  p_sort_order int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id uuid;
begin
  select template_id into v_template_id
  from public.assignment_sections
  where id = p_section_id;

  perform public._upsert_structure_block(
    p_section_id, p_block, p_sort_order, v_template_id
  );
end;
$$;

-- Backfill calculated maximum marks. Existing deployments keep manual maximum
-- marks because marks_manual_override was set when introduced above.
do $$
declare
  r record;
begin
  for r in select id from public.assignment_templates loop
    perform public.recalculate_template_maximum_mark(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Homework ordering indexes
-- ---------------------------------------------------------------------------
create index if not exists assignments_status_due_at_idx
  on public.assignments (status, due_at);
create index if not exists assignments_status_release_at_idx
  on public.assignments (status, release_at);
create index if not exists assignments_updated_at_desc_idx
  on public.assignments (updated_at desc);

-- ---------------------------------------------------------------------------
-- 11. Storage buckets and staff-only policy notes
-- ---------------------------------------------------------------------------
-- Existing bucket: assignment-resources (private). Student access is via the
-- public.assignment_resources row and storage.objects policies; staff-only rows
-- use assignment_resources.visibility = 'staff' and are excluded from student
-- table/storage policies.
--
-- Dedicated bucket: assignment-mark-schemes (private). Students receive no
-- public.assignment_mark_schemes or storage.objects policy for this bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assignment-mark-schemes',
  'assignment-mark-schemes',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
on conflict (id) do nothing;

drop policy if exists "Students read assignment resource files for their classes" on storage.objects;
create policy "Students read assignment resource files for their classes"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'assignment-resources'
    and exists (
      select 1
      from public.assignment_resources ar
      join public.assignments a on a.id = ar.assignment_id
      where ar.storage_path = name
        and ar.visibility = 'student'
        and ar.archived = false
        and a.status = 'published'
        and public.student_in_class(a.class_id)
        and (a.release_at is null or a.release_at <= now())
    )
  );

drop policy if exists "Admins full access assignment mark schemes storage" on storage.objects;
create policy "Admins full access assignment mark schemes storage"
  on storage.objects for all to authenticated
  using (bucket_id = 'assignment-mark-schemes' and public.is_admin())
  with check (bucket_id = 'assignment-mark-schemes' and public.is_admin());

drop policy if exists "Teachers manage own assignment mark scheme files" on storage.objects;
create policy "Teachers manage own assignment mark scheme files"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'assignment-mark-schemes'
    and public.is_teacher()
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'assignment-mark-schemes'
    and public.is_teacher()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Teachers read assignment mark scheme files" on storage.objects;
create policy "Teachers read assignment mark scheme files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'assignment-mark-schemes'
    and exists (
      select 1
      from public.assignment_mark_schemes ms
      where ms.storage_path = name
        and ms.archived = false
        and public.teacher_can_edit_template(ms.template_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 12. Grants (RLS remains authoritative)
-- ---------------------------------------------------------------------------
revoke all on function public._upsert_structure_block(uuid, jsonb, int, uuid) from public, anon;
revoke all on function public._insert_structure_block(uuid, jsonb, int) from public, anon;
revoke all on function public.save_assignment_structure(uuid, jsonb) from public, anon;
revoke all on function public.recalculate_template_maximum_mark(uuid) from public, anon;

grant execute on function public.save_assignment_structure(uuid, jsonb) to authenticated;
grant execute on function public.recalculate_template_maximum_mark(uuid) to authenticated;

grant select, insert, update, delete on public.assignment_resources to authenticated;
grant select, insert, update, delete on public.assignment_mark_schemes to authenticated;
grant select, insert, update, delete on public.assignment_comment_bank_links to authenticated;
grant select, insert, update, delete on public.assignment_comments to authenticated;
grant select, insert, update, delete on public.assignment_templates to authenticated;
grant select, insert, update, delete on public.assignments to authenticated;
grant select, insert, update, delete on public.assignment_questions to authenticated;

notify pgrst, 'reload schema';
