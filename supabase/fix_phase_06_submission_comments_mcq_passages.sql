-- =============================================================================
-- Phase 6 follow-up: comments, submission lifecycle, passage labels, MCQ safety
-- Safe for live databases. Does NOT rerun full schema.sql.
-- Preserves users, classes, assignments, submissions, responses, comments.
-- =============================================================================

-- ── Comment linking extensions ───────────────────────────────────────────────

alter table public.assignment_comments
  add column if not exists linked_question_ids jsonb not null default '[]'::jsonb;

alter table public.assignment_comments
  add column if not exists linked_section_id uuid;

alter table public.assignment_comments
  add column if not exists available_for_annotation boolean not null default false;

alter table public.assignment_comments
  add column if not exists assessment_objective text;

comment on column public.assignment_comments.linked_question_ids is
  'Array of assignment_questions.id values this comment applies to.';

-- Backfill multi-link array from legacy single FK.
update public.assignment_comments
set linked_question_ids = jsonb_build_array(linked_question_id)
where linked_question_id is not null
  and (linked_question_ids is null or linked_question_ids = '[]'::jsonb);

-- ── Atomic comment save (upsert then delete orphans) ─────────────────────────

create or replace function public.save_assignment_comments(
  p_template_id uuid,
  p_comments jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[] := array[]::uuid[];
  v_item jsonb;
  v_id uuid;
  v_linked_ids jsonb;
  v_primary uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.is_admin()
    or public.teacher_can_edit_template(p_template_id)
  ) then
    raise exception 'Not authorised';
  end if;

  if p_comments is null or jsonb_typeof(p_comments) <> 'array' then
    raise exception 'Comments payload must be an array';
  end if;

  for v_item in select * from jsonb_array_elements(p_comments)
  loop
    v_id := nullif(v_item ->> 'id', '')::uuid;
    if v_id is null then
      v_id := gen_random_uuid();
    end if;
    v_ids := array_append(v_ids, v_id);

    v_linked_ids := coalesce(v_item -> 'linked_question_ids', '[]'::jsonb);
    if jsonb_typeof(v_linked_ids) <> 'array' then
      v_linked_ids := '[]'::jsonb;
    end if;

    -- Drop links that do not exist (avoid FK failures).
    select coalesce(jsonb_agg(to_jsonb(q.id)), '[]'::jsonb)
      into v_linked_ids
    from jsonb_array_elements_text(v_linked_ids) as t(id)
    join public.assignment_questions q on q.id = t.id::uuid;

    v_primary := nullif(v_item ->> 'linked_question_id', '')::uuid;
    if v_primary is null and jsonb_array_length(v_linked_ids) > 0 then
      v_primary := (v_linked_ids ->> 0)::uuid;
    end if;
    if v_primary is not null
       and not exists (
         select 1 from public.assignment_questions q where q.id = v_primary
       )
    then
      v_primary := null;
    end if;

    insert into public.assignment_comments (
      id,
      template_id,
      short_label,
      full_comment,
      category,
      linked_question_id,
      linked_question_ids,
      linked_section_id,
      mark_range_min,
      mark_range_max,
      is_active,
      sort_order,
      available_for_drag_drop,
      available_for_overall,
      available_for_question,
      available_for_annotation,
      assessment_objective
    ) values (
      v_id,
      p_template_id,
      coalesce(nullif(v_item ->> 'short_label', ''), 'Untitled comment'),
      coalesce(v_item ->> 'full_comment', ''),
      nullif(v_item ->> 'category', ''),
      v_primary,
      v_linked_ids,
      nullif(v_item ->> 'linked_section_id', '')::uuid,
      nullif(v_item ->> 'mark_range_min', '')::numeric,
      nullif(v_item ->> 'mark_range_max', '')::numeric,
      coalesce((v_item ->> 'is_active')::boolean, true),
      coalesce((v_item ->> 'sort_order')::int, 0),
      coalesce((v_item ->> 'available_for_drag_drop')::boolean, true),
      coalesce((v_item ->> 'available_for_overall')::boolean, true),
      coalesce((v_item ->> 'available_for_question')::boolean, true),
      coalesce((v_item ->> 'available_for_annotation')::boolean, false),
      nullif(v_item ->> 'assessment_objective', '')
    )
    on conflict (id) do update set
      template_id = excluded.template_id,
      short_label = excluded.short_label,
      full_comment = excluded.full_comment,
      category = excluded.category,
      linked_question_id = excluded.linked_question_id,
      linked_question_ids = excluded.linked_question_ids,
      linked_section_id = excluded.linked_section_id,
      mark_range_min = excluded.mark_range_min,
      mark_range_max = excluded.mark_range_max,
      is_active = excluded.is_active,
      sort_order = excluded.sort_order,
      available_for_drag_drop = excluded.available_for_drag_drop,
      available_for_overall = excluded.available_for_overall,
      available_for_question = excluded.available_for_question,
      available_for_annotation = excluded.available_for_annotation,
      assessment_objective = excluded.assessment_objective,
      updated_at = now();
  end loop;

  if cardinality(v_ids) = 0 then
    delete from public.assignment_comments where template_id = p_template_id;
  else
    delete from public.assignment_comments
    where template_id = p_template_id
      and not (id = any (v_ids));
  end if;
end;
$$;

revoke all on function public.save_assignment_comments(uuid, jsonb) from public, anon;
grant execute on function public.save_assignment_comments(uuid, jsonb) to authenticated;

-- ── Unsubmit: restore draft without deleting responses ───────────────────────

create or replace function public.unsubmit_student_homework(
  p_assignment_id uuid
)
returns public.submissions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.submissions;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.assignments a
    where a.id = p_assignment_id
      and a.status = 'published'::public.assignment_status
      and public.student_in_class(a.class_id)
  ) then
    raise exception 'Assignment not available';
  end if;

  update public.submissions s
  set
    status = 'draft'::public.submission_status,
    updated_at = now()
    -- keep submitted_at for audit; do not wipe responses
  where s.assignment_id = p_assignment_id
    and s.student_id = v_uid
    and s.status in (
      'submitted'::public.submission_status,
      'late'::public.submission_status
    )
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Submission cannot be unsubmitted';
  end if;

  return v_row;
end;
$$;

revoke all on function public.unsubmit_student_homework(uuid) from public, anon;
grant execute on function public.unsubmit_student_homework(uuid) to authenticated;

-- Keep submit RPC enum-safe (idempotent with prior fix migration).
create or replace function public.submit_student_homework(
  p_assignment_id uuid,
  p_status text default 'submitted',
  p_submitted_at timestamptz default now()
)
returns public.submissions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.submissions;
  v_status public.submission_status;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_status is distinct from 'submitted' and p_status is distinct from 'late' then
    raise exception 'Invalid submission status';
  end if;

  v_status := p_status::public.submission_status;

  if not exists (
    select 1
    from public.assignments a
    where a.id = p_assignment_id
      and a.status = 'published'::public.assignment_status
      and public.student_in_class(a.class_id)
  ) then
    raise exception 'Assignment not available';
  end if;

  update public.submissions s
  set
    status = v_status,
    submitted_at = coalesce(p_submitted_at, now()),
    updated_at = now()
  where s.assignment_id = p_assignment_id
    and s.student_id = v_uid
    and s.status in (
      'draft'::public.submission_status,
      'returned'::public.submission_status
    )
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Submission is locked or missing';
  end if;

  return v_row;
end;
$$;

-- Teachers can read assignment comments for marking.
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

notify pgrst, 'reload schema';
