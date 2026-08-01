-- =============================================================================
-- Fix structured submission status + marking data integrity
-- Safe for live databases. Does NOT rerun full schema.sql.
-- Preserves existing submissions, responses, and legacy written_response/files.
-- =============================================================================

-- ── Uniqueness / indexes (idempotent) ────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'student_responses_submission_question_key'
  ) then
    begin
      alter table public.student_responses
        add constraint student_responses_submission_question_key
        unique (submission_id, question_id);
    exception
      when duplicate_table then null;
      when duplicate_object then null;
    end;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'response_cells_response_row_col_key'
  ) then
    begin
      alter table public.response_cells
        add constraint response_cells_response_row_col_key
        unique (student_response_id, row_index, col_index);
    exception
      when duplicate_table then null;
      when duplicate_object then null;
    end;
  end if;
end $$;

create index if not exists student_responses_submission_question_idx
  on public.student_responses (submission_id, question_id);

create index if not exists student_responses_submission_updated_idx
  on public.student_responses (submission_id, updated_at desc);

create index if not exists response_cells_response_row_col_idx
  on public.response_cells (student_response_id, row_index, col_index);

create index if not exists submissions_assignment_status_idx
  on public.submissions (assignment_id, status);

create index if not exists submissions_student_status_idx
  on public.submissions (student_id, status);

create index if not exists submissions_assignment_student_idx
  on public.submissions (assignment_id, student_id);

-- ── Safe relationship repair ─────────────────────────────────────────────────
-- Drop orphan cells whose parent response no longer exists (should be rare).

delete from public.response_cells c
where not exists (
  select 1 from public.student_responses r where r.id = c.student_response_id
);

-- Drop responses whose submission no longer exists.

delete from public.student_responses r
where not exists (
  select 1 from public.submissions s where s.id = r.submission_id
);

-- Drop responses pointing at deleted questions (cascade should already handle).

delete from public.student_responses r
where not exists (
  select 1 from public.assignment_questions q where q.id = r.question_id
);

-- ── Transactional structured submit RPC ──────────────────────────────────────

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
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_status not in ('submitted', 'late') then
    raise exception 'Invalid submission status';
  end if;

  if not exists (
    select 1
    from public.assignments a
    where a.id = p_assignment_id
      and a.status = 'published'
      and public.student_in_class(a.class_id)
  ) then
    raise exception 'Assignment not available';
  end if;

  update public.submissions s
  set
    status = p_status,
    submitted_at = coalesce(p_submitted_at, now()),
    updated_at = now()
  where s.assignment_id = p_assignment_id
    and s.student_id = v_uid
    and s.status in ('draft', 'returned')
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
  'Atomically mark the caller''s draft/returned submission as submitted/late. Structured answers must already be saved in student_responses.';

-- ── Teacher helper: can mark a submission ────────────────────────────────────

create or replace function public.teacher_can_mark_submission(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      where s.id = p_submission_id
        and public.teacher_can_mark_submissions(a.class_id)
    );
$$;

revoke all on function public.teacher_can_mark_submission(uuid) from public, anon;
grant execute on function public.teacher_can_mark_submission(uuid) to authenticated;

-- ── Reaffirm RLS for structured response reads (teachers with mark rights) ───

drop policy if exists student_responses_select on public.student_responses;
create policy student_responses_select on public.student_responses
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.submissions s
      where s.id = submission_id and s.student_id = auth.uid()
    )
    or public.teacher_can_mark_submission(submission_id)
  );

drop policy if exists response_cells_select on public.response_cells;
create policy response_cells_select on public.response_cells
  for select to authenticated
  using (
    exists (
      select 1 from public.student_responses r
      where r.id = student_response_id
        and (
          public.is_admin()
          or exists (
            select 1 from public.submissions s
            where s.id = r.submission_id and s.student_id = auth.uid()
          )
          or public.teacher_can_mark_submission(r.submission_id)
        )
    )
  );

-- Students still cannot write after submit/lock.
drop policy if exists student_responses_student_write on public.student_responses;
create policy student_responses_student_write on public.student_responses
  for all to authenticated
  using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and s.student_id = auth.uid()
        and s.status in ('draft', 'returned')
    )
  )
  with check (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and s.student_id = auth.uid()
        and s.status in ('draft', 'returned')
    )
  );

drop policy if exists response_cells_student_write on public.response_cells;
create policy response_cells_student_write on public.response_cells
  for all to authenticated
  using (
    exists (
      select 1
      from public.student_responses r
      join public.submissions s on s.id = r.submission_id
      where r.id = student_response_id
        and s.student_id = auth.uid()
        and s.status in ('draft', 'returned')
    )
  )
  with check (
    exists (
      select 1
      from public.student_responses r
      join public.submissions s on s.id = r.submission_id
      where r.id = student_response_id
        and s.student_id = auth.uid()
        and s.status in ('draft', 'returned')
    )
  );

notify pgrst, 'reload schema';
