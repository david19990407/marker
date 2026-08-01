-- =============================================================================
-- Phase 6: false MCQ publish validation + student response save failure
-- Safe for live databases. Does NOT rerun full schema.sql.
--
-- Root causes addressed:
--   1) PostgREST returns assignment_questions as a one-to-one OBJECT (unique
--      block_id). App code reading [0] dropped question rows → missing
--      question_id (student save) and missing choices (publish validation).
--   2) MCQ choices may still lack canonical `text` after older saves.
--   3) student_responses uniqueness / client_version for safe upserts.
-- =============================================================================

-- ── MCQ choices normalisation (idempotent with prior option-text migration) ──

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
  v_text text;
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
      v_text := v_item #>> '{}';
      v_label := v_text;
      v_id := 'opt-' || v_idx::text;
      v_correct := false;
      v_feedback := '';
    elsif jsonb_typeof(v_item) = 'object' then
      v_text := coalesce(
        nullif(btrim(v_item ->> 'text'), ''),
        nullif(btrim(v_item ->> 'label'), ''),
        ''
      );
      v_label := v_text;
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

      -- Heal "Option A" label with answer typed into feedback.
      if v_feedback <> ''
         and (
           v_text = ''
           or v_text ~* '^Option[[:space:]]+[A-Z0-9]+$'
         )
      then
        v_text := v_feedback;
        v_label := v_feedback;
        v_feedback := '';
      end if;
    else
      v_idx := v_idx + 1;
      continue;
    end if;

    -- Drop completely empty orphan placeholders only when every field is blank
    -- and the option is not marked correct (keeps intentional blank drafts).
    if v_text = '' and v_feedback = '' and v_correct is not true then
      -- Keep the slot so option indexes stay stable for existing answers.
      null;
    end if;

    v_out := v_out || jsonb_build_array(
      jsonb_build_object(
        'id', v_id,
        'text', v_text,
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

update public.assignment_questions q
set choices = public.repair_mcq_choices_payload(q.choices)
where q.response_type in ('multiple_choice', 'multiple_select')
  and q.choices is not null
  and jsonb_typeof(q.choices) = 'array'
  and jsonb_array_length(q.choices) > 0;

-- Default option label style on MCQ blocks that lack one.
update public.assignment_blocks b
set config = coalesce(b.config, '{}'::jsonb) || jsonb_build_object('option_label_style', 'letters')
where b.block_type in ('multiple_choice', 'multiple_select')
  and (
    b.config is null
    or b.config ->> 'option_label_style' is null
  );

-- ── Client version column for stale-write protection ─────────────────────────

alter table public.student_responses
  add column if not exists client_version bigint not null default 0;

-- ── Repair duplicate student responses (keep most complete) ──────────────────

with ranked as (
  select
    r.id,
    row_number() over (
      partition by r.submission_id, r.question_id
      order by
        (
          case when coalesce(nullif(btrim(r.text_value), ''), '') <> '' then 4 else 0 end
          + case when r.numeric_value is not null then 2 else 0 end
          + case when r.boolean_value is not null then 1 else 0 end
          + case when r.json_value is not null then 2 else 0 end
          + case when coalesce(r.file_name, r.storage_path) is not null then 3 else 0 end
          + (
            select count(*)::int
            from public.response_cells c
            where c.student_response_id = r.id
              and (
                coalesce(nullif(btrim(c.text_value), ''), '') <> ''
                or c.numeric_value is not null
                or c.boolean_value is not null
              )
          )
        ) desc,
        r.client_version desc nulls last,
        r.updated_at desc nulls last,
        r.created_at desc nulls last,
        r.id desc
    ) as rn
  from public.student_responses r
)
delete from public.student_responses r
using ranked
where r.id = ranked.id
  and ranked.rn > 1;

with ranked_cells as (
  select
    id,
    row_number() over (
      partition by student_response_id, row_index, col_index
      order by
        (
          case when coalesce(nullif(btrim(text_value), ''), '') <> '' then 2 else 0 end
          + case when numeric_value is not null then 1 else 0 end
          + case when boolean_value is not null then 1 else 0 end
        ) desc,
        id desc
    ) as rn
  from public.response_cells
)
delete from public.response_cells c
using ranked_cells
where c.id = ranked_cells.id
  and ranked_cells.rn > 1;

delete from public.response_cells c
where not exists (
  select 1 from public.student_responses r where r.id = c.student_response_id
);

delete from public.student_responses r
where not exists (
  select 1 from public.submissions s where s.id = r.submission_id
);

-- Ensure uniqueness (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'student_responses_submission_question_key'
  ) then
    alter table public.student_responses
      add constraint student_responses_submission_question_key
      unique (submission_id, question_id);
  end if;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'response_cells_response_row_col_key'
  ) then
    alter table public.response_cells
      add constraint response_cells_response_row_col_key
      unique (student_response_id, row_index, col_index);
  end if;
exception
  when duplicate_object then null;
end $$;

create index if not exists student_responses_submission_question_idx
  on public.student_responses (submission_id, question_id);

-- Report orphaned MCQ questions without blocks (manual review)
do $$
declare
  v_orphans int;
begin
  select count(*) into v_orphans
  from public.assignment_questions q
  where not exists (
    select 1 from public.assignment_blocks b where b.id = q.block_id
  );
  if v_orphans > 0 then
    raise notice 'WARNING: % orphaned assignment_questions rows (no block) — manual review.', v_orphans;
  end if;
end $$;

-- Ensure students can write responses only while editable (draft/returned).
-- Recreate policy if an older install drifted.
drop policy if exists student_responses_student_write on public.student_responses;
create policy student_responses_student_write on public.student_responses
  for all to authenticated
  using (
    exists (
      select 1
      from public.submissions s
      where s.id = submission_id
        and s.student_id = auth.uid()
        and s.status in (
          'draft'::public.submission_status,
          'returned'::public.submission_status
        )
    )
  )
  with check (
    exists (
      select 1
      from public.submissions s
      where s.id = submission_id
        and s.student_id = auth.uid()
        and s.status in (
          'draft'::public.submission_status,
          'returned'::public.submission_status
        )
    )
  );

notify pgrst, 'reload schema';
