-- =============================================================================
-- Phase 6 follow-up: submission data-loss, unsubmit RLS, completion integrity
-- Safe for live databases. Does NOT rerun full schema.sql.
--
-- Root causes addressed:
--   1) Unsubmit failed under RLS: students may UPDATE submissions only when
--      status is draft|returned, so submitted→draft never matched rows when
--      the RPC ran as security invoker.
--   2) Submit must be status-only (never delete/recreate student_responses).
--   3) Upserts need uniqueness + protection metadata (client_version).
-- =============================================================================

-- Enum values (existing): draft | submitted | late | marked | returned

-- ── Client version column (reject stale / empty overwrites) ──────────────────

alter table public.student_responses
  add column if not exists client_version bigint not null default 0;

comment on column public.student_responses.client_version is
  'Monotonic client autosave version; older writes must not overwrite newer answers.';

-- ── Lifecycle audit events ───────────────────────────────────────────────────

create table if not exists public.submission_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null
    check (event_type in ('submitted', 'unsubmitted', 'resubmitted')),
  from_status public.submission_status,
  to_status public.submission_status,
  created_at timestamptz not null default now()
);

create index if not exists submission_lifecycle_events_submission_idx
  on public.submission_lifecycle_events (submission_id, created_at desc);

create index if not exists submission_lifecycle_events_assignment_idx
  on public.submission_lifecycle_events (assignment_id, created_at desc);

alter table public.submission_lifecycle_events enable row level security;

drop policy if exists submission_lifecycle_events_select on public.submission_lifecycle_events;
create policy submission_lifecycle_events_select on public.submission_lifecycle_events
  for select to authenticated
  using (
    public.is_admin()
    or student_id = auth.uid()
    or exists (
      select 1
      from public.assignments a
      where a.id = assignment_id
        and public.teacher_in_class(a.class_id)
    )
  );

-- Inserts only via SECURITY DEFINER RPCs.
revoke insert, update, delete on public.submission_lifecycle_events from public, anon, authenticated;
grant select on public.submission_lifecycle_events to authenticated;

-- ── Repair duplicate responses (keep most complete, then newest) ─────────────

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

-- Orphans
delete from public.response_cells c
where not exists (
  select 1 from public.student_responses r where r.id = c.student_response_id
);

delete from public.student_responses r
where not exists (
  select 1 from public.submissions s where s.id = r.submission_id
);

-- ── Repair duplicate submissions (keep richest response set) ─────────────────
-- Unique (assignment_id, student_id) should already exist; repair any leftovers.

do $$
declare
  rec record;
  keep_id uuid;
  drop_id uuid;
  keep_score int;
  drop_score int;
  ambiguous int := 0;
begin
  for rec in
    select assignment_id, student_id
    from public.submissions
    group by assignment_id, student_id
    having count(*) > 1
  loop
    select s.id into keep_id
    from public.submissions s
    where s.assignment_id = rec.assignment_id
      and s.student_id = rec.student_id
    order by
      (
        select count(*)::int
        from public.student_responses r
        where r.submission_id = s.id
      ) desc,
      (
        select count(*)::int
        from public.student_responses r
        where r.submission_id = s.id
          and (
            coalesce(nullif(btrim(r.text_value), ''), '') <> ''
            or r.numeric_value is not null
            or r.boolean_value is not null
            or r.json_value is not null
            or coalesce(r.file_name, r.storage_path) is not null
          )
      ) desc,
      s.updated_at desc nulls last,
      s.submitted_at desc nulls last,
      s.created_at desc nulls last,
      s.id desc
    limit 1;

    select
      (
        select count(*)::int from public.student_responses r where r.submission_id = keep_id
      )
    into keep_score;

    for drop_id in
      select s.id
      from public.submissions s
      where s.assignment_id = rec.assignment_id
        and s.student_id = rec.student_id
        and s.id <> keep_id
    loop
      select
        (
          select count(*)::int from public.student_responses r where r.submission_id = drop_id
        )
      into drop_score;

      if drop_score > 0 and drop_score >= keep_score then
        ambiguous := ambiguous + 1;
        raise notice
          'AMBIGUOUS duplicate submission: assignment=% student=% keep=% drop=% (manual review)',
          rec.assignment_id, rec.student_id, keep_id, drop_id;
      end if;

      -- Move responses that do not collide onto the kept submission.
      update public.student_responses r
      set submission_id = keep_id
      where r.submission_id = drop_id
        and not exists (
          select 1
          from public.student_responses x
          where x.submission_id = keep_id
            and x.question_id = r.question_id
        );

      -- Drop remaining colliding / empty rows on the duplicate, then the submission.
      delete from public.student_responses r where r.submission_id = drop_id;
      delete from public.submissions s where s.id = drop_id;
    end loop;
  end loop;

  if ambiguous > 0 then
    raise notice 'Duplicate submission repair finished with % ambiguous pair(s) requiring manual review.', ambiguous;
  end if;
end $$;

-- Ensure uniqueness constraints (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'submissions_assignment_student_key'
  ) then
    begin
      alter table public.submissions
        add constraint submissions_assignment_student_key
        unique (assignment_id, student_id);
    exception
      when unique_violation then
        raise notice 'Could not add submissions_assignment_student_key — duplicates remain for manual review.';
      when duplicate_object then null;
    end;
  end if;
end $$;

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

create index if not exists student_responses_submission_updated_idx
  on public.student_responses (submission_id, updated_at desc);

create index if not exists submissions_assignment_student_idx
  on public.submissions (assignment_id, student_id);

-- ── Helper: record lifecycle event ───────────────────────────────────────────

create or replace function public._record_submission_lifecycle_event(
  p_submission_id uuid,
  p_assignment_id uuid,
  p_student_id uuid,
  p_event_type text,
  p_from public.submission_status,
  p_to public.submission_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.submission_lifecycle_events (
    submission_id, assignment_id, student_id, event_type, from_status, to_status
  ) values (
    p_submission_id, p_assignment_id, p_student_id, p_event_type, p_from, p_to
  );
end;
$$;

revoke all on function public._record_submission_lifecycle_event(uuid, uuid, uuid, text, public.submission_status, public.submission_status)
  from public, anon, authenticated;

-- ── Submit: status-only, preserves all response rows ─────────────────────────

create or replace function public.submit_structured_homework(
  p_assignment_id uuid,
  p_status text default 'submitted',
  p_submitted_at timestamptz default now()
)
returns public.submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.submissions;
  v_status public.submission_status;
  v_from public.submission_status;
  v_before int;
  v_after int;
  v_event text;
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

  -- Lock the authoritative submission row for this student + deployment.
  select s.*
  into v_row
  from public.submissions s
  where s.assignment_id = p_assignment_id
    and s.student_id = v_uid
  for update;

  if v_row.id is null then
    raise exception 'Submission is locked or missing';
  end if;

  if v_row.status not in (
    'draft'::public.submission_status,
    'returned'::public.submission_status
  ) then
    raise exception 'Submission is locked or missing';
  end if;

  select count(*)::int into v_before
  from public.student_responses r
  where r.submission_id = v_row.id;

  v_from := v_row.status;

  update public.submissions s
  set
    status = v_status,
    submitted_at = coalesce(p_submitted_at, now()),
    updated_at = now()
  where s.id = v_row.id
  returning * into v_row;

  select count(*)::int into v_after
  from public.student_responses r
  where r.submission_id = v_row.id;

  if v_after <> v_before then
    raise exception 'Submit aborted: response row count changed (% -> %)', v_before, v_after;
  end if;

  v_event := case
    when exists (
      select 1
      from public.submission_lifecycle_events e
      where e.submission_id = v_row.id
        and e.event_type in ('submitted', 'resubmitted')
    ) then 'resubmitted'
    else 'submitted'
  end;

  perform public._record_submission_lifecycle_event(
    v_row.id, p_assignment_id, v_uid, v_event, v_from, v_status
  );

  return v_row;
end;
$$;

revoke all on function public.submit_structured_homework(uuid, text, timestamptz)
  from public, anon;
grant execute on function public.submit_structured_homework(uuid, text, timestamptz)
  to authenticated;

comment on function public.submit_structured_homework(uuid, text, timestamptz) is
  'Locks the student submission, updates only status/submitted_at/updated_at, preserves all student_responses, writes lifecycle audit.';

-- ── Unsubmit: SECURITY DEFINER so RLS does not block submitted→draft ─────────

create or replace function public.unsubmit_structured_homework(
  p_assignment_id uuid
)
returns public.submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.submissions;
  v_from public.submission_status;
  v_before int;
  v_after int;
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

  select s.*
  into v_row
  from public.submissions s
  where s.assignment_id = p_assignment_id
    and s.student_id = v_uid
  for update;

  if v_row.id is null then
    raise exception 'Submission cannot be unsubmitted';
  end if;

  if v_row.status not in (
    'submitted'::public.submission_status,
    'late'::public.submission_status
  ) then
    raise exception 'Submission cannot be unsubmitted';
  end if;

  select count(*)::int into v_before
  from public.student_responses r
  where r.submission_id = v_row.id;

  v_from := v_row.status;

  update public.submissions s
  set
    status = 'draft'::public.submission_status,
    updated_at = now()
    -- keep submitted_at for audit history; never touch response rows
  where s.id = v_row.id
  returning * into v_row;

  select count(*)::int into v_after
  from public.student_responses r
  where r.submission_id = v_row.id;

  if v_after <> v_before then
    raise exception 'Unsubmit aborted: response row count changed (% -> %)', v_before, v_after;
  end if;

  perform public._record_submission_lifecycle_event(
    v_row.id,
    p_assignment_id,
    v_uid,
    'unsubmitted',
    v_from,
    'draft'::public.submission_status
  );

  return v_row;
end;
$$;

revoke all on function public.unsubmit_structured_homework(uuid)
  from public, anon;
grant execute on function public.unsubmit_structured_homework(uuid)
  to authenticated;

comment on function public.unsubmit_structured_homework(uuid) is
  'SECURITY DEFINER status-only unsubmit (submitted/late → draft). Preserves responses and submission id.';

-- Alias legacy names to the same secure implementations for compatibility.

create or replace function public.submit_student_homework(
  p_assignment_id uuid,
  p_status text default 'submitted',
  p_submitted_at timestamptz default now()
)
returns public.submissions
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.submit_structured_homework(p_assignment_id, p_status, p_submitted_at);
end;
$$;

revoke all on function public.submit_student_homework(uuid, text, timestamptz)
  from public, anon;
grant execute on function public.submit_student_homework(uuid, text, timestamptz)
  to authenticated;

create or replace function public.unsubmit_student_homework(
  p_assignment_id uuid
)
returns public.submissions
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.unsubmit_structured_homework(p_assignment_id);
end;
$$;

revoke all on function public.unsubmit_student_homework(uuid) from public, anon;
grant execute on function public.unsubmit_student_homework(uuid) to authenticated;

-- Report any remaining duplicate submissions for ops review.
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
    raise notice 'WARNING: % assignment/student pairs still have duplicate submissions — manual review required.', v_dup_count;
  end if;
end $$;

notify pgrst, 'reload schema';
