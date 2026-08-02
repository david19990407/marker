-- =============================================================================
-- Phase 8 fix: scanned-upload question IDs + idempotent draft submissions
-- Additive only. Does NOT rerun full schema.sql.
-- =============================================================================

-- Treat scanned homework uploads as assessable response blocks so
-- assignment_questions rows are upserted (and not deleted) on save.

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
    'scanned_homework_upload',
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


-- Backfill missing parent question rows for existing scanned-upload blocks.
insert into public.assignment_questions (
  id,
  block_id,
  prompt,
  max_marks,
  required,
  response_type,
  choices,
  sort_order,
  review_only,
  marks_apply,
  marking_mode
)
select
  gen_random_uuid(),
  b.id,
  coalesce(nullif(b.content, ''), 'Scanned homework upload'),
  coalesce(
    nullif((b.config -> 'scanned_upload' ->> 'maximum_mark'), '')::numeric,
    (
      select sum(coalesce((q ->> 'maximum_mark')::numeric, 0))
      from jsonb_array_elements(
        coalesce(b.config -> 'scanned_upload' -> 'subquestions', '[]'::jsonb)
      ) q
      where coalesce((q ->> 'include_in_total')::boolean, true)
    ),
    0
  ),
  true,
  'scanned_homework_upload',
  '[]'::jsonb,
  b.sort_order,
  false,
  true,
  'teacher_reviewed'
from public.assignment_blocks b
where b.block_type = 'scanned_homework_upload'
  and not exists (
    select 1 from public.assignment_questions q where q.block_id = b.id
  );

-- Ensure one submission per student per assignment (idempotent).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'submissions_assignment_id_student_id_key'
  ) then
    alter table public.submissions
      add constraint submissions_assignment_id_student_id_key
      unique (assignment_id, student_id);
  end if;
exception
  when duplicate_table then null;
  when duplicate_object then null;
end $$;

create index if not exists scanned_upload_questions_block_order_idx
  on public.scanned_upload_questions (block_id, display_order);

notify pgrst, 'reload schema';
