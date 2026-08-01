-- =============================================================================
-- Phase 6 CRITICAL FIX: resubmission must keep the latest active response
-- Safe for live databases. Does NOT rerun full schema.sql.
--
-- Root cause (application): after reload, autosave client_version restarted at 0,
-- so post-unsubmit edits were rejected as stale and Submit only flipped status.
--
-- This migration:
--   1) preserves older duplicate values into a history table where appropriate
--   2) repairs duplicate submissions / response rows
--   3) enforces uniqueness for one submission + one active response
--   4) ensures submit/unsubmit RPCs are status-only (no answer cloning)
--   5) ensures client_version + indexes + grants
-- =============================================================================

-- ── Versioning column (idempotent) ───────────────────────────────────────────

alter table public.student_responses
  add column if not exists client_version bigint not null default 0;

comment on column public.student_responses.client_version is
  'Monotonic client autosave version; older writes must not overwrite newer answers.';

-- ── Immutable history for superseded duplicate active rows ───────────────────

create table if not exists public.student_response_history (
  id uuid primary key default gen_random_uuid(),
  source_response_id uuid,
  submission_id uuid not null references public.submissions (id) on delete cascade,
  question_id uuid not null,
  text_value text,
  numeric_value numeric,
  boolean_value boolean,
  json_value jsonb,
  file_name text,
  storage_path text,
  client_version bigint,
  reason text not null default 'duplicate_repair',
  archived_at timestamptz not null default now(),
  original_created_at timestamptz,
  original_updated_at timestamptz
);

create index if not exists student_response_history_submission_idx
  on public.student_response_history (submission_id, question_id, archived_at desc);

alter table public.student_response_history enable row level security;

drop policy if exists student_response_history_select on public.student_response_history;
create policy student_response_history_select on public.student_response_history
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.submissions s
      where s.id = submission_id
        and (
          s.student_id = auth.uid()
          or exists (
            select 1
            from public.assignments a
            where a.id = s.assignment_id
              and public.teacher_in_class(a.class_id)
          )
        )
    )
  );

revoke insert, update, delete on public.student_response_history from public, anon, authenticated;
grant select on public.student_response_history to authenticated;

-- ── Archive + remove duplicate active response rows ──────────────────────────

with ranked as (
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
    r.client_version,
    r.created_at,
    r.updated_at,
    row_number() over (
      partition by r.submission_id, r.question_id
      order by
        r.client_version desc nulls last,
        r.updated_at desc nulls last,
        r.created_at desc nulls last,
        (
          case when coalesce(nullif(btrim(r.text_value), ''), '') <> '' then 4 else 0 end
          + case when r.numeric_value is not null then 2 else 0 end
          + case when r.boolean_value is not null then 1 else 0 end
          + case when r.json_value is not null then 2 else 0 end
          + case when coalesce(r.file_name, r.storage_path) is not null then 3 else 0 end
        ) desc,
        r.id desc
    ) as rn
  from public.student_responses r
)
insert into public.student_response_history (
  source_response_id,
  submission_id,
  question_id,
  text_value,
  numeric_value,
  boolean_value,
  json_value,
  file_name,
  storage_path,
  client_version,
  reason,
  original_created_at,
  original_updated_at
)
select
  ranked.id,
  ranked.submission_id,
  ranked.question_id,
  ranked.text_value,
  ranked.numeric_value,
  ranked.boolean_value,
  ranked.json_value,
  ranked.file_name,
  ranked.storage_path,
  ranked.client_version,
  'duplicate_repair',
  ranked.created_at,
  ranked.updated_at
from ranked
where ranked.rn > 1;

with ranked as (
  select
    r.id,
    row_number() over (
      partition by r.submission_id, r.question_id
      order by
        r.client_version desc nulls last,
        r.updated_at desc nulls last,
        r.created_at desc nulls last,
        (
          case when coalesce(nullif(btrim(r.text_value), ''), '') <> '' then 4 else 0 end
          + case when r.numeric_value is not null then 2 else 0 end
          + case when r.boolean_value is not null then 1 else 0 end
          + case when r.json_value is not null then 2 else 0 end
          + case when coalesce(r.file_name, r.storage_path) is not null then 3 else 0 end
        ) desc,
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

-- ── Repair duplicate submissions (one per student + assignment/deployment) ───

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

      -- Relink non-colliding latest responses onto the kept submission.
      update public.student_responses r
      set submission_id = keep_id
      where r.submission_id = drop_id
        and not exists (
          select 1
          from public.student_responses x
          where x.submission_id = keep_id
            and x.question_id = r.question_id
        );

      -- Archive remaining colliding rows before delete.
      insert into public.student_response_history (
        source_response_id,
        submission_id,
        question_id,
        text_value,
        numeric_value,
        boolean_value,
        json_value,
        file_name,
        storage_path,
        client_version,
        reason,
        original_created_at,
        original_updated_at
      )
      select
        r.id,
        keep_id,
        r.question_id,
        r.text_value,
        r.numeric_value,
        r.boolean_value,
        r.json_value,
        r.file_name,
        r.storage_path,
        r.client_version,
        'duplicate_submission_repair',
        r.created_at,
        r.updated_at
      from public.student_responses r
      where r.submission_id = drop_id;

      delete from public.student_responses r where r.submission_id = drop_id;
      delete from public.submissions s where s.id = drop_id;
    end loop;
  end loop;

  if ambiguous > 0 then
    raise notice
      'Duplicate submission repair finished with % ambiguous pair(s) requiring manual review.',
      ambiguous;
  end if;
end $$;

-- ── Uniqueness constraints ───────────────────────────────────────────────────

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
        raise notice
          'Could not add submissions_assignment_student_key — duplicates remain for manual review.';
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
  when unique_violation then
    raise notice
      'Could not add student_responses_submission_question_key — duplicates remain for manual review.';
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

create index if not exists student_responses_submission_version_idx
  on public.student_responses (submission_id, client_version desc);

create index if not exists submissions_assignment_student_idx
  on public.submissions (assignment_id, student_id);

-- ── Lifecycle events table (idempotent) ──────────────────────────────────────

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

revoke insert, update, delete on public.submission_lifecycle_events from public, anon, authenticated;
grant select on public.submission_lifecycle_events to authenticated;

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

-- ── Submit / unsubmit: status-only, never clone or restore answers ───────────

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

  -- Status / timestamps / audit only. Never touch student_responses content.
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
  'Status-only submit/resubmit. Preserves submission id and all active student_responses. Never restores snapshots.';

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
  'Status-only unsubmit (submitted/late → draft). Same submission id. Never deletes or restores answers.';

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

-- Report remaining ambiguity for ops (do not delete silently).
do $$
declare
  v_dup_submissions int;
  v_dup_responses int;
begin
  select count(*) into v_dup_submissions
  from (
    select assignment_id, student_id
    from public.submissions
    group by assignment_id, student_id
    having count(*) > 1
  ) d;

  select count(*) into v_dup_responses
  from (
    select submission_id, question_id
    from public.student_responses
    group by submission_id, question_id
    having count(*) > 1
  ) d;

  if v_dup_submissions > 0 then
    raise notice
      'WARNING: % assignment/student pairs still have duplicate submissions — manual review required.',
      v_dup_submissions;
  end if;
  if v_dup_responses > 0 then
    raise notice
      'WARNING: % submission/question pairs still have duplicate responses — manual review required.',
      v_dup_responses;
  end if;
end $$;

notify pgrst, 'reload schema';
