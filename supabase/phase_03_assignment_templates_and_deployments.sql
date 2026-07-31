-- Phase 4: assignment templates + multi-class deployments.
-- Existing assignments become deployments of a 1:1 migrated template.
-- submissions.assignment_id continues to point at public.assignments.id (deployment).

create table if not exists public.assignment_templates (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete restrict,
  title text not null,
  instructions text not null default '',
  allow_text_submission boolean not null default true,
  allow_file_submission boolean not null default true,
  default_maximum_mark numeric(6,2) not null default 30 check (default_maximum_mark > 0),
  academic_year text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assignment_templates_created_by_idx
  on public.assignment_templates (created_by);

alter table public.assignments
  add column if not exists template_id uuid references public.assignment_templates (id) on delete restrict;

alter table public.assignments
  add column if not exists release_at timestamptz;

alter table public.assignments
  add column if not exists sync_content_from_template boolean not null default true;

create index if not exists assignments_template_idx on public.assignments (template_id);

-- Migrate each existing assignment into its own template (preserves deployment id).
do $$
declare
  r record;
  v_template_id uuid;
begin
  for r in
    select * from public.assignments where template_id is null
  loop
    insert into public.assignment_templates (
      created_by, title, instructions,
      allow_text_submission, allow_file_submission, default_maximum_mark,
      created_at, updated_at
    ) values (
      r.teacher_id, r.title, r.instructions,
      r.allow_text_submission, r.allow_file_submission, r.maximum_mark,
      r.created_at, r.updated_at
    )
    returning id into v_template_id;

    update public.assignments
    set template_id = v_template_id
    where id = r.id;
  end loop;
end $$;

-- Only enforce NOT NULL when every row has been backfilled.
do $$ begin
  if not exists (select 1 from public.assignments where template_id is null) then
    alter table public.assignments alter column template_id set not null;
  end if;
end $$;

-- Unique deployment per template+class
do $$ begin
  alter table public.assignments
    add constraint assignments_template_class_unique unique (template_id, class_id);
exception when duplicate_object then null;
end $$;

create or replace function public.set_assignment_template_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists assignment_templates_set_updated_at on public.assignment_templates;
create trigger assignment_templates_set_updated_at
  before update on public.assignment_templates
  for each row execute function public.set_assignment_template_updated_at();

-- When template content changes and sync is enabled, push to linked deployments.
create or replace function public.sync_assignment_template_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.assignments a
  set
    title = new.title,
    instructions = new.instructions,
    allow_text_submission = new.allow_text_submission,
    allow_file_submission = new.allow_file_submission,
    updated_at = now()
  where a.template_id = new.id
    and a.sync_content_from_template = true;
  return new;
end;
$$;

drop trigger if exists assignment_templates_sync_content on public.assignment_templates;
create trigger assignment_templates_sync_content
  after update of title, instructions, allow_text_submission, allow_file_submission
  on public.assignment_templates
  for each row execute function public.sync_assignment_template_content();

alter table public.assignment_templates enable row level security;

drop policy if exists assignment_templates_admin on public.assignment_templates;
create policy assignment_templates_admin on public.assignment_templates
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists assignment_templates_teacher_select on public.assignment_templates;
create policy assignment_templates_teacher_select on public.assignment_templates
  for select to authenticated
  using (
    public.is_admin()
    or created_by = auth.uid()
    or exists (
      select 1 from public.assignments a
      where a.template_id = id
        and public.teacher_in_class(a.class_id)
    )
  );

drop policy if exists assignment_templates_teacher_insert on public.assignment_templates;
create policy assignment_templates_teacher_insert on public.assignment_templates
  for insert to authenticated
  with check (public.is_teacher() and created_by = auth.uid());

drop policy if exists assignment_templates_teacher_update on public.assignment_templates;
create policy assignment_templates_teacher_update on public.assignment_templates
  for update to authenticated
  using (
    public.is_admin()
    or created_by = auth.uid()
    or exists (
      select 1 from public.assignments a
      where a.template_id = id
        and public.teacher_can_create_assignments(a.class_id)
    )
  )
  with check (
    public.is_admin()
    or created_by = auth.uid()
  );

-- Secure multi-class deploy helper (preserves auth.uid())
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

  v_mark := coalesce(p_maximum_mark, v_template.default_maximum_mark);

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
      allow_text_submission, allow_file_submission, sync_content_from_template
    ) values (
      v_class_id, v_actor, p_template_id,
      v_template.title, v_template.instructions, v_due, p_release_at, v_mark, p_status,
      v_template.allow_text_submission, v_template.allow_file_submission, true
    )
    on conflict (template_id, class_id) do update
    set
      due_at = excluded.due_at,
      release_at = excluded.release_at,
      maximum_mark = excluded.maximum_mark,
      status = excluded.status,
      updated_at = now()
    returning *;
  end loop;
end;
$$;

revoke all on function public.deploy_assignment_template(
  uuid, uuid[], timestamptz, timestamptz, numeric, public.assignment_status, jsonb
) from public, anon;

grant execute on function public.deploy_assignment_template(
  uuid, uuid[], timestamptz, timestamptz, numeric, public.assignment_status, jsonb
) to authenticated;

create or replace function public.create_assignment_template_and_deploy(
  p_title text,
  p_instructions text,
  p_class_ids uuid[],
  p_due_at timestamptz default null,
  p_release_at timestamptz default null,
  p_maximum_mark numeric default 30,
  p_allow_text boolean default true,
  p_allow_file boolean default true,
  p_status public.assignment_status default 'draft',
  p_per_class_due_at jsonb default '{}'::jsonb,
  p_academic_year text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_template_id uuid;
begin
  if v_actor is null or not (public.is_teacher() or public.is_admin()) then
    raise exception 'Not authorized';
  end if;

  if p_class_ids is null or array_length(p_class_ids, 1) is null then
    raise exception 'Select at least one class';
  end if;

  insert into public.assignment_templates (
    created_by, title, instructions,
    allow_text_submission, allow_file_submission,
    default_maximum_mark, academic_year
  ) values (
    v_actor, p_title, coalesce(p_instructions, ''),
    coalesce(p_allow_text, true), coalesce(p_allow_file, true),
    coalesce(p_maximum_mark, 30), p_academic_year
  )
  returning id into v_template_id;

  perform public.deploy_assignment_template(
    v_template_id, p_class_ids, p_due_at, p_release_at,
    p_maximum_mark, p_status, coalesce(p_per_class_due_at, '{}'::jsonb)
  );

  return v_template_id;
end;
$$;

revoke all on function public.create_assignment_template_and_deploy(
  text, text, uuid[], timestamptz, timestamptz, numeric, boolean, boolean,
  public.assignment_status, jsonb, text
) from public, anon;

grant execute on function public.create_assignment_template_and_deploy(
  text, text, uuid[], timestamptz, timestamptz, numeric, boolean, boolean,
  public.assignment_status, jsonb, text
) to authenticated;
