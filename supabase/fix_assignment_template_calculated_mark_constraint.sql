-- ============================================================================
-- Fix assignment template / assignment maximum-mark constraints for
-- calculated totals that may start at zero before questions exist.
-- Safe to re-run. Preserves all rows and IDs.
-- ============================================================================

-- Optional school setting for decimal mark policy (default true = current behaviour)
alter table public.school_settings
  add column if not exists allow_decimal_marks boolean not null default true;

comment on column public.school_settings.allow_decimal_marks is
  'When false, calculated and entered marks are rounded to whole numbers.';

-- Ensure calculated-mark columns exist (idempotent; from builder repair)
alter table public.assignment_templates
  add column if not exists calculated_maximum_mark numeric(10,2);
alter table public.assignments
  add column if not exists calculated_maximum_mark numeric(10,2);
alter table public.assignments
  add column if not exists marks_manual_override boolean not null default false;

-- ---------------------------------------------------------------------------
-- assignment_templates.default_maximum_mark: allow 0, block negatives
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'assignment_templates'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%default_maximum_mark%'
  loop
    execute format(
      'alter table public.assignment_templates drop constraint if exists %I',
      r.conname
    );
  end loop;
end $$;

alter table public.assignment_templates
  drop constraint if exists assignment_templates_default_maximum_mark_check;

alter table public.assignment_templates
  add constraint assignment_templates_default_maximum_mark_check
  check (default_maximum_mark >= 0);

alter table public.assignment_templates
  alter column default_maximum_mark set default 0;

-- Keep calculated_maximum_mark non-negative when present
do $$ begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'assignment_templates'
      and column_name = 'calculated_maximum_mark'
  ) then
    alter table public.assignment_templates
      drop constraint if exists assignment_templates_calculated_maximum_mark_check;
    alter table public.assignment_templates
      add constraint assignment_templates_calculated_maximum_mark_check
      check (calculated_maximum_mark is null or calculated_maximum_mark >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- assignments.maximum_mark: allow 0 for empty calculated drafts
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'assignments'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%maximum_mark%'
      and pg_get_constraintdef(c.oid) not ilike '%calculated%'
  loop
    execute format(
      'alter table public.assignments drop constraint if exists %I',
      r.conname
    );
  end loop;
end $$;

alter table public.assignments
  drop constraint if exists assignments_maximum_mark_check;

alter table public.assignments
  add constraint assignments_maximum_mark_check
  check (maximum_mark >= 0);

alter table public.assignments
  alter column maximum_mark set default 0;

do $$ begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'assignments'
      and column_name = 'calculated_maximum_mark'
  ) then
    alter table public.assignments
      drop constraint if exists assignments_calculated_maximum_mark_check;
    alter table public.assignments
      add constraint assignments_calculated_maximum_mark_check
      check (calculated_maximum_mark is null or calculated_maximum_mark >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Recalculate helper: sync zero totals; respect decimal school setting
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
  v_allow_decimals boolean := true;
begin
  select coalesce(allow_decimal_marks, true)
  into v_allow_decimals
  from public.school_settings
  order by created_at asc
  limit 1;

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

  v_total := greatest(coalesce(v_total, 0), 0);
  if coalesce(v_allow_decimals, true) then
    v_total := round(v_total, 2);
  else
    v_total := round(v_total, 0);
  end if;

  update public.assignment_templates
  set
    calculated_maximum_mark = v_total,
    default_maximum_mark = v_total,
    updated_at = now()
  where id = p_template_id;

  update public.assignments
  set
    calculated_maximum_mark = v_total,
    maximum_mark = case
      when coalesce(marks_manual_override, false) then maximum_mark
      else v_total
    end,
    updated_at = now()
  where template_id = p_template_id;

  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deploy / create RPCs: initial calculated total may be 0
-- ---------------------------------------------------------------------------
create or replace function public.deploy_assignment_template(
  p_template_id uuid,
  p_class_ids uuid[],
  p_due_at timestamptz default null,
  p_release_at timestamptz default null,
  p_maximum_mark numeric default null,
  p_status public.assignment_status default 'draft',
  p_per_class_due_at jsonb default '{}'::jsonb
)
returns setof public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_template public.assignment_templates;
  v_class_id uuid;
  v_due timestamptz;
  v_mark numeric;
begin
  if v_actor is null or not (public.is_teacher() or public.is_admin()) then
    raise exception 'Not authorized';
  end if;

  select * into v_template from public.assignment_templates where id = p_template_id;
  if not found then
    raise exception 'Template not found';
  end if;

  -- 0 is a valid calculated total; only fall back when the argument is null.
  v_mark := greatest(
    coalesce(
      p_maximum_mark,
      v_template.calculated_maximum_mark,
      v_template.default_maximum_mark,
      0
    ),
    0
  );

  foreach v_class_id in array p_class_ids loop
    if not public.teacher_can_create_assignments(v_class_id) then
      raise exception 'Not authorised for class %', v_class_id;
    end if;

    v_due := coalesce(
      nullif(p_per_class_due_at ->> v_class_id::text, '')::timestamptz,
      p_due_at
    );

    return query
    insert into public.assignments (
      class_id, teacher_id, template_id,
      title, instructions, due_at, release_at, maximum_mark, status,
      allow_text_submission, allow_file_submission, sync_content_from_template,
      calculated_maximum_mark, marks_manual_override
    ) values (
      v_class_id, v_actor, p_template_id,
      v_template.title, v_template.instructions, v_due, p_release_at, v_mark, p_status,
      v_template.allow_text_submission, v_template.allow_file_submission, true,
      v_mark, false
    )
    on conflict (template_id, class_id) do update
    set
      due_at = excluded.due_at,
      release_at = excluded.release_at,
      maximum_mark = excluded.maximum_mark,
      calculated_maximum_mark = excluded.calculated_maximum_mark,
      marks_manual_override = false,
      status = excluded.status,
      title = excluded.title,
      instructions = excluded.instructions,
      allow_text_submission = excluded.allow_text_submission,
      allow_file_submission = excluded.allow_file_submission,
      updated_at = now()
    returning *;
  end loop;
end;
$$;

create or replace function public.create_assignment_template_and_deploy(
  p_title text,
  p_instructions text,
  p_class_ids uuid[],
  p_due_at timestamptz default null,
  p_release_at timestamptz default null,
  p_maximum_mark numeric default 0,
  p_allow_text boolean default true,
  p_allow_file boolean default true,
  p_status public.assignment_status default 'draft',
  p_per_class_due_at jsonb default '{}'::jsonb,
  p_academic_year text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_template_id uuid;
  v_deployment_ids uuid[];
  v_mark numeric(10,2);
begin
  if v_actor is null or not (public.is_teacher() or public.is_admin()) then
    raise exception 'Not authorized';
  end if;

  if p_class_ids is null or coalesce(array_length(p_class_ids, 1), 0) = 0 then
    raise exception 'Select at least one class';
  end if;

  -- Explicit 0 is valid for a draft with no marked questions yet.
  v_mark := greatest(coalesce(p_maximum_mark, 0), 0);

  insert into public.assignment_templates (
    created_by, title, instructions,
    allow_text_submission, allow_file_submission,
    default_maximum_mark, calculated_maximum_mark, academic_year
  ) values (
    v_actor,
    p_title,
    coalesce(p_instructions, ''),
    coalesce(p_allow_text, true),
    coalesce(p_allow_file, true),
    v_mark,
    v_mark,
    p_academic_year
  )
  returning id into v_template_id;

  select coalesce(array_agg(d.id), '{}'::uuid[])
  into v_deployment_ids
  from public.deploy_assignment_template(
    v_template_id,
    p_class_ids,
    p_due_at,
    p_release_at,
    v_mark,
    p_status,
    coalesce(p_per_class_due_at, '{}'::jsonb)
  ) as d;

  return jsonb_build_object(
    'template_id', v_template_id,
    'deployment_ids', to_jsonb(v_deployment_ids)
  );
end;
$$;

revoke all on function public.recalculate_template_maximum_mark(uuid) from public, anon;
revoke all on function public.create_assignment_template_and_deploy(
  text, text, uuid[], timestamptz, timestamptz, numeric, boolean, boolean,
  public.assignment_status, jsonb, text
) from public, anon;
revoke all on function public.deploy_assignment_template(
  uuid, uuid[], timestamptz, timestamptz, numeric, public.assignment_status, jsonb
) from public, anon;

grant execute on function public.recalculate_template_maximum_mark(uuid) to authenticated;
grant execute on function public.create_assignment_template_and_deploy(
  text, text, uuid[], timestamptz, timestamptz, numeric, boolean, boolean,
  public.assignment_status, jsonb, text
) to authenticated;
grant execute on function public.deploy_assignment_template(
  uuid, uuid[], timestamptz, timestamptz, numeric, public.assignment_status, jsonb
) to authenticated;

notify pgrst, 'reload schema';
