-- ============================================================================
-- Phase 6: structured homework builder enhancements
-- Safe to re-run after phase_04_structured_homework_builder.sql.
-- Preserves production data, IDs, and existing student_responses.
-- ============================================================================

-- Divider block type (worksheet visual separator)
do $$ begin
  alter type public.assignment_block_type add value if not exists 'divider';
exception
  when duplicate_object then null;
  when others then null;
end $$;

-- Question configuration columns
alter table public.assignment_questions
  add column if not exists teacher_note text;
alter table public.assignment_questions
  add column if not exists mark_scheme_note text;
alter table public.assignment_questions
  add column if not exists word_limit integer;
alter table public.assignment_questions
  add column if not exists char_limit integer;
alter table public.assignment_questions
  add column if not exists allow_attachments boolean not null default false;
alter table public.assignment_questions
  add column if not exists min_value numeric(12,4);
alter table public.assignment_questions
  add column if not exists max_value numeric(12,4);
alter table public.assignment_questions
  add column if not exists correct_answer jsonb;
alter table public.assignment_questions
  add column if not exists comment_bank_key text;
alter table public.assignment_questions
  add column if not exists review_only boolean not null default false;

create index if not exists assignment_questions_comment_bank_idx
  on public.assignment_questions (comment_bank_key)
  where comment_bank_key is not null;

create index if not exists assignment_questions_review_only_idx
  on public.assignment_questions (review_only)
  where review_only = true;

-- Compatibility aliases for suggested schema names (views, non-destructive)
create or replace view public.assignment_block_options as
select
  q.id,
  q.block_id,
  q.choices as options,
  q.correct_answer,
  q.sort_order,
  q.created_at,
  q.updated_at
from public.assignment_questions q;

create or replace view public.response_table_cells as
select * from public.response_cells;

create or replace view public.response_values as
select
  r.id,
  r.submission_id,
  r.question_id,
  r.text_value,
  r.numeric_value,
  r.boolean_value,
  r.json_value,
  r.file_name,
  r.storage_path,
  r.created_at,
  r.updated_at
from public.student_responses r;

-- Hide unpublished / unreleased homework from students
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

-- Insert/upsert one block, preserving IDs when provided and owned by template
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
  v_question_id uuid := nullif(p_block ->> 'question_id', '')::uuid;
  v_is_response boolean;
  v_cell jsonb;
  v_existing_section uuid;
begin
  v_is_response := (p_block ->> 'block_type') in (
    'numbered_question', 'short_text', 'extended_writing', 'numeric',
    'multiple_choice', 'tick_box', 'teacher_review', 'file_upload',
    'table', 'vocabulary_table'
  );

  if v_block_id is not null then
    select b.section_id into v_existing_section
    from public.assignment_blocks b
    join public.assignment_sections s on s.id = b.section_id
    where b.id = v_block_id and s.template_id = p_template_id;

    if v_existing_section is null then
      v_block_id := null;
    end if;
  end if;

  if v_block_id is null then
    insert into public.assignment_blocks (
      section_id, block_type, sort_order, content, config, teacher_only
    ) values (
      p_section_id,
      (p_block ->> 'block_type')::public.assignment_block_type,
      p_sort_order,
      coalesce(p_block ->> 'content', ''),
      coalesce(p_block -> 'config', '{}'::jsonb),
      coalesce((p_block ->> 'teacher_only')::boolean, false)
        or (p_block ->> 'block_type') in ('mark_scheme', 'teacher_review')
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
        or (p_block ->> 'block_type') in ('mark_scheme', 'teacher_review'),
      updated_at = now()
    where id = v_block_id;
  end if;

  if v_is_response then
    if v_question_id is not null then
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
        updated_at = now()
      where q.id = v_question_id
        and exists (
          select 1 from public.assignment_blocks b
          join public.assignment_sections s on s.id = b.section_id
          where b.id = q.block_id and s.template_id = p_template_id
        );
      if not found then
        v_question_id := null;
      end if;
    end if;

    if v_question_id is null then
      insert into public.assignment_questions (
        block_id, prompt, max_marks, required, response_type, choices, sort_order,
        teacher_note, mark_scheme_note, word_limit, char_limit, allow_attachments,
        min_value, max_value, correct_answer, comment_bank_key, review_only
      ) values (
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
          or (p_block ->> 'block_type') = 'teacher_review'
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
        updated_at = now();
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

-- Non-destructive structure save: upsert by id, delete removed sections only
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

  -- Accept JSON string payloads from some clients
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
    if v_section_id is not null then
      update public.assignment_sections
      set
        title = coalesce(nullif(v_section ->> 'title', ''), 'Section'),
        sort_order = v_section_ord,
        parent_section_id = null,
        updated_at = now()
      where id = v_section_id and template_id = p_template_id;
      if not found then
        v_section_id := null;
      end if;
    end if;

    if v_section_id is null then
      insert into public.assignment_sections (
        template_id, title, sort_order, parent_section_id
      ) values (
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
      if v_sub_id is not null then
        update public.assignment_sections
        set
          title = coalesce(nullif(v_subsection ->> 'title', ''), 'Subsection'),
          sort_order = v_sub_ord,
          parent_section_id = v_section_id,
          updated_at = now()
        where id = v_sub_id and template_id = p_template_id;
        if not found then
          v_sub_id := null;
        end if;
      end if;

      if v_sub_id is null then
        insert into public.assignment_sections (
          template_id, parent_section_id, title, sort_order
        ) values (
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

  -- Remove blocks no longer present (cascade cleans questions; responses SET NULL via FK?
  -- student_responses.question_id references questions ON DELETE CASCADE — preserve by
  -- only deleting blocks not in keep list. Teachers deleting a question intentionally
  -- removes orphaned answers for that question only.)
  delete from public.assignment_blocks b
  using public.assignment_sections s
  where b.section_id = s.id
    and s.template_id = p_template_id
    and not (b.id = any (v_keep_block_ids));

  delete from public.assignment_sections s
  where s.template_id = p_template_id
    and not (s.id = any (v_keep_section_ids));
end;
$$;

-- Keep legacy insert helper for older callers
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

revoke all on function public._upsert_structure_block(uuid, jsonb, int, uuid) from public, anon;
revoke all on function public._insert_structure_block(uuid, jsonb, int) from public, anon;
revoke all on function public.save_assignment_structure(uuid, jsonb) from public, anon;
grant execute on function public.save_assignment_structure(uuid, jsonb) to authenticated;

grant select on public.assignment_block_options to authenticated;
grant select on public.response_table_cells to authenticated;
grant select on public.response_values to authenticated;

notify pgrst, 'reload schema';
