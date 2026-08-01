-- =============================================================================
-- Phase 6 follow-up: comment links, passage labels, MCQ option repair
-- Safe for live databases. Does NOT rerun full schema.sql.
-- =============================================================================

-- Ensure comment linking columns exist (idempotent with prior fix migration).
alter table public.assignment_comments
  add column if not exists linked_question_ids jsonb not null default '[]'::jsonb;

alter table public.assignment_comments
  add column if not exists linked_section_id uuid;

alter table public.assignment_comments
  add column if not exists available_for_annotation boolean not null default false;

alter table public.assignment_comments
  add column if not exists assessment_objective text;

-- Backfill multi-link array from legacy single FK when empty.
update public.assignment_comments
set linked_question_ids = jsonb_build_array(linked_question_id)
where linked_question_id is not null
  and (linked_question_ids is null or linked_question_ids = '[]'::jsonb);

-- Drop links to questions that no longer exist (safe cleanup).
update public.assignment_comments c
set
  linked_question_ids = coalesce((
    select jsonb_agg(to_jsonb(q.id))
    from jsonb_array_elements_text(c.linked_question_ids) as t(id)
    join public.assignment_questions q on q.id = t.id::uuid
  ), '[]'::jsonb),
  linked_question_id = case
    when c.linked_question_id is not null
      and exists (
        select 1 from public.assignment_questions q where q.id = c.linked_question_id
      )
    then c.linked_question_id
    else null
  end
where c.linked_question_ids is not null
   or c.linked_question_id is not null;

-- If primary link was cleared but array still has values, restore primary.
update public.assignment_comments
set linked_question_id = (linked_question_ids ->> 0)::uuid
where linked_question_id is null
  and jsonb_typeof(linked_question_ids) = 'array'
  and jsonb_array_length(linked_question_ids) > 0;

create index if not exists assignment_comments_linked_question_ids_gin
  on public.assignment_comments using gin (linked_question_ids);

create index if not exists assignment_comments_template_sort_idx
  on public.assignment_comments (template_id, sort_order);

-- Teachers marking a class can read assignment comments for that template.
drop policy if exists assignment_comments_teacher_read_marking on public.assignment_comments;
create policy assignment_comments_teacher_read_marking on public.assignment_comments
  for select to authenticated
  using (
    public.is_admin()
    or public.teacher_can_edit_template(template_id)
    or exists (
      select 1
      from public.assignment_templates t
      join public.assignments a on a.template_id = t.id
      where t.id = assignment_comments.template_id
        and (
          a.teacher_id = auth.uid()
          or exists (
            select 1 from public.class_teachers ct
            where ct.class_id = a.class_id
              and ct.teacher_id = auth.uid()
              and ct.can_mark_submissions = true
          )
        )
    )
  );

-- ── MCQ option repair helpers ────────────────────────────────────────────────
-- Normalise string-only choices into objects with stable ids when possible.
-- Does NOT invent a correct answer when ambiguous.

create or replace function public.repair_mcq_choices_payload(p_choices jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_idx int := 0;
  v_label text;
  v_id text;
  v_correct boolean;
  v_feedback text;
begin
  if p_choices is null or jsonb_typeof(p_choices) <> 'array' then
    return '[]'::jsonb;
  end if;

  for v_item in select * from jsonb_array_elements(p_choices)
  loop
    if jsonb_typeof(v_item) = 'string' then
      v_label := v_item #>> '{}';
      v_id := 'opt-' || v_idx::text;
      v_correct := false;
      v_feedback := '';
    elsif jsonb_typeof(v_item) = 'object' then
      v_label := coalesce(
        nullif(v_item ->> 'label', ''),
        nullif(v_item ->> 'text', ''),
        ''
      );
      v_id := coalesce(
        nullif(v_item ->> 'id', ''),
        'opt-' || v_idx::text
      );
      v_correct := coalesce(
        (v_item ->> 'is_correct')::boolean,
        (v_item ->> 'correct')::boolean,
        false
      );
      v_feedback := coalesce(v_item ->> 'feedback', '');
    else
      v_idx := v_idx + 1;
      continue;
    end if;

    v_out := v_out || jsonb_build_array(
      jsonb_build_object(
        'id', v_id,
        'label', v_label,
        'feedback', v_feedback,
        'is_correct', v_correct
      )
    );
    v_idx := v_idx + 1;
  end loop;

  return v_out;
end;
$$;

-- Repair questions whose choices are a bare string array (legacy shape).
update public.assignment_questions q
set choices = public.repair_mcq_choices_payload(q.choices)
where q.response_type in ('multiple_choice', 'multiple_select')
  and q.choices is not null
  and jsonb_typeof(q.choices) = 'array'
  and jsonb_array_length(q.choices) > 0
  and jsonb_typeof(q.choices -> 0) = 'string';

-- Ambiguous automatic MCQs (missing correct flags / too few options) are left
-- untouched for teachers to fix in the builder. Inspect with:
--   select q.id, q.prompt, q.choices
--   from assignment_questions q
--   where q.response_type in ('multiple_choice','multiple_select')
--     and coalesce(q.marking_mode,'automatic') = 'automatic'
--     and (
--       q.choices is null
--       or jsonb_array_length(q.choices) < 2
--       or not exists (
--         select 1 from jsonb_array_elements(q.choices) opt
--         where coalesce((opt->>'is_correct')::boolean,(opt->>'correct')::boolean,false)
--       )
--     );

notify pgrst, 'reload schema';
