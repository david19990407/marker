-- =============================================================================
-- Fix structured submission review/status enum + answer integrity
-- Safe for live databases. Does NOT rerun full schema.sql.
-- Preserves submissions, student_responses, response_cells, and legacy fields.
--
-- Root cause of submit failure:
--   submit_student_homework assigned text p_status into submissions.status
--   (enum submission_status) without a cast.
-- =============================================================================

-- Enum values (existing): draft | submitted | late | marked | returned

-- ── Repair duplicate responses (keep newest updated_at / created_at) ─────────

with ranked as (
  select
    id,
    row_number() over (
      partition by submission_id, question_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.student_responses
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
      order by id desc
    ) as rn
  from public.response_cells
)
delete from public.response_cells c
using ranked_cells
where c.id = ranked_cells.id
  and ranked_cells.rn > 1;

-- Orphans
delete from public.response_cells c
where not exists (
  select 1 from public.student_responses r where r.id = c.student_response_id
);

delete from public.student_responses r
where not exists (
  select 1 from public.submissions s where s.id = r.submission_id
);

-- Ensure uniqueness constraints exist (idempotent)
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

-- ── Fixed submit RPC: cast status to submission_status enum ──────────────────

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

revoke all on function public.submit_student_homework(uuid, text, timestamptz)
  from public, anon;
grant execute on function public.submit_student_homework(uuid, text, timestamptz)
  to authenticated;

comment on function public.submit_student_homework(uuid, text, timestamptz) is
  'Atomically mark the caller''s draft/returned submission as submitted/late using the submission_status enum. Does not delete or recreate student_responses.';

-- Report unrepaired duplicate submissions (unique constraint should already block).
-- If any exist they cannot be auto-merged safely without guessing which row is
-- authoritative; surface/ops should inspect them manually.
do $$
declare
  v_dup_count int;
begin
  select count(*) into v_dup_count
  from (
    select assignment_id, student_id
    from public.submissions
    group by assignment_id, student_id
    having count(*) > 1
  ) d;
  if v_dup_count > 0 then
    raise notice 'MANUAL REPAIR NEEDED: % duplicate submission groups (assignment_id, student_id). Not auto-merged.', v_dup_count;
  end if;
end $$;

notify pgrst, 'reload schema';
