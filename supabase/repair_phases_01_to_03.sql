-- ============================================================================
-- REPAIR: Phases 1–3 for an EXISTING production Homework Passport database
-- File: supabase/repair_phases_01_to_03.sql
--
-- Run this ONCE in the Supabase SQL Editor against the live project.
-- Do NOT re-run supabase/schema.sql.
--
-- Safe / idempotent goals:
--   * create missing school_settings and related config tables + seeds
--   * create class_teachers and backfill lead teachers from classes.teacher_id
--   * create assignment_templates, link existing assignments, create deploy RPCs
--   * grant execute to authenticated; block students inside SECURITY DEFINER body
--   * reload PostgREST schema cache
-- Does NOT drop users, profiles, classes, memberships, submissions or feedback.
-- ============================================================================


-- ===== SECTION A: School settings (phase_01) =====
-- Phase 1–2 (existing databases): branding-safe school settings + Year 7–13.
-- Does NOT recreate existing tables or enums.
-- Safe to run once on a live Homework Passport / LitCoach Supabase project.

-- ---------------------------------------------------------------------------
-- Expand year group constraint (profiles)
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_year_group_check;
alter table public.profiles
  add constraint profiles_year_group_check check (
    year_group is null
    or year_group in (
      'Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Year 13'
    )
  );

-- ---------------------------------------------------------------------------
-- School settings (singleton-style configuration)
-- ---------------------------------------------------------------------------
create table if not exists public.school_settings (
  id uuid primary key default gen_random_uuid(),
  school_name text not null default 'My School',
  platform_display_name text not null default 'Homework Passport',
  max_upload_bytes bigint not null default 20971520
    check (max_upload_bytes > 0 and max_upload_bytes <= 104857600),
  permitted_mime_types text[] not null default array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml'
  ],
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.school_settings (school_name, platform_display_name)
select 'My School', 'Homework Passport'
where not exists (select 1 from public.school_settings);

create table if not exists public.school_year_groups (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.school_year_groups (label, sort_order)
values
  ('Year 7', 7),
  ('Year 8', 8),
  ('Year 9', 9),
  ('Year 10', 10),
  ('Year 11', 11),
  ('Year 12', 12),
  ('Year 13', 13)
on conflict (label) do nothing;

create table if not exists public.school_subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon_key text not null default 'book',
  icon_storage_path text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.school_subjects (name, icon_key, sort_order)
values
  ('English', 'book-open', 1),
  ('Mathematics', 'calculator', 2),
  ('Science', 'flask', 3),
  ('History', 'landmark', 4),
  ('Geography', 'globe', 5),
  ('Languages', 'languages', 6),
  ('Art', 'palette', 7),
  ('Computing', 'cpu', 8)
on conflict (name) do nothing;

create table if not exists public.school_class_colours (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  hex text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.school_class_colours (name, hex, sort_order)
values
  ('Violet', '#7c3aed', 1),
  ('Indigo', '#4f46e5', 2),
  ('Sky', '#0284c7', 3),
  ('Teal', '#0d9488', 4),
  ('Emerald', '#059669', 5),
  ('Amber', '#d97706', 6),
  ('Rose', '#e11d48', 7),
  ('Slate', '#475569', 8)
on conflict (name) do nothing;

create table if not exists public.school_marking_symbols (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  symbol_key text not null unique,
  description text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.school_marking_symbols (name, symbol_key, description, sort_order)
values
  ('Tick', 'tick', 'Correct / good work', 1),
  ('Cross', 'cross', 'Incorrect', 2),
  ('Question', 'question', 'Unclear / query', 3),
  ('Exclamation', 'exclamation', 'Important note', 4),
  ('Underline', 'underline', 'Underline emphasis', 5)
on conflict (name) do nothing;

create table if not exists public.school_default_comment_banks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.school_default_comment_banks (name, description, sort_order)
values
  ('What went well', 'Positive feedback prompts', 1),
  ('Even better if', 'Improvement prompts', 2),
  ('Next steps', 'Target / next-step prompts', 3)
on conflict (name) do nothing;

-- Optional class colour column (non-breaking)
alter table public.classes
  add column if not exists colour_hex text;

-- ---------------------------------------------------------------------------
-- RLS for school settings (admin write; authenticated read)
-- ---------------------------------------------------------------------------
alter table public.school_settings enable row level security;
alter table public.school_year_groups enable row level security;
alter table public.school_subjects enable row level security;
alter table public.school_class_colours enable row level security;
alter table public.school_marking_symbols enable row level security;
alter table public.school_default_comment_banks enable row level security;

drop policy if exists school_settings_select on public.school_settings;
create policy school_settings_select on public.school_settings
  for select to authenticated using (true);
drop policy if exists school_settings_admin on public.school_settings;
create policy school_settings_admin on public.school_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists school_year_groups_select on public.school_year_groups;
create policy school_year_groups_select on public.school_year_groups
  for select to authenticated using (true);
drop policy if exists school_year_groups_admin on public.school_year_groups;
create policy school_year_groups_admin on public.school_year_groups
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists school_subjects_select on public.school_subjects;
create policy school_subjects_select on public.school_subjects
  for select to authenticated using (true);
drop policy if exists school_subjects_admin on public.school_subjects;
create policy school_subjects_admin on public.school_subjects
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists school_class_colours_select on public.school_class_colours;
create policy school_class_colours_select on public.school_class_colours
  for select to authenticated using (true);
drop policy if exists school_class_colours_admin on public.school_class_colours;
create policy school_class_colours_admin on public.school_class_colours
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists school_marking_symbols_select on public.school_marking_symbols;
create policy school_marking_symbols_select on public.school_marking_symbols
  for select to authenticated using (true);
drop policy if exists school_marking_symbols_admin on public.school_marking_symbols;
create policy school_marking_symbols_admin on public.school_marking_symbols
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists school_default_comment_banks_select on public.school_default_comment_banks;
create policy school_default_comment_banks_select on public.school_default_comment_banks
  for select to authenticated using (true);
drop policy if exists school_default_comment_banks_admin on public.school_default_comment_banks;
create policy school_default_comment_banks_admin on public.school_default_comment_banks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());



-- ===== SECTION B: Multi-teacher classes (phase_02) =====
-- Phase 3: multiple teachers per class (many-to-many).
-- Migrates existing classes.teacher_id into class_teachers as lead_teacher.
-- Keeps classes.teacher_id as the denormalised lead teacher for compatibility.

do $$ begin
  create type public.class_teacher_role as enum (
    'lead_teacher',
    'teacher',
    'teaching_assistant',
    'cover_teacher'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.class_teachers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  membership_role public.class_teacher_role not null default 'teacher',
  can_create_assignments boolean not null default true,
  can_mark_submissions boolean not null default true,
  can_manage_members boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (class_id, teacher_id)
);

create index if not exists class_teachers_class_idx on public.class_teachers (class_id);
create index if not exists class_teachers_teacher_idx on public.class_teachers (teacher_id);

insert into public.class_teachers (
  class_id, teacher_id, membership_role,
  can_create_assignments, can_mark_submissions, can_manage_members
)
select
  c.id, c.teacher_id, 'lead_teacher'::public.class_teacher_role,
  true, true, true
from public.classes c
on conflict (class_id, teacher_id) do update
set
  membership_role = 'lead_teacher',
  can_create_assignments = true,
  can_mark_submissions = true,
  can_manage_members = true;

create or replace function public.teacher_in_class(p_class_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.class_teachers ct
    where ct.class_id = p_class_id and ct.teacher_id = auth.uid()
  ) or public.is_admin();
$$;

create or replace function public.teacher_owns_class(p_class_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  -- Compatibility alias: assigned class teacher or admin.
  select public.teacher_in_class(p_class_id);
$$;

create or replace function public.teacher_is_lead(p_class_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.class_teachers ct
    where ct.class_id = p_class_id
      and ct.teacher_id = auth.uid()
      and ct.membership_role = 'lead_teacher'
  );
$$;

create or replace function public.teacher_can_create_assignments(p_class_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.class_teachers ct
    where ct.class_id = p_class_id
      and ct.teacher_id = auth.uid()
      and ct.can_create_assignments = true
  );
$$;

create or replace function public.teacher_can_mark_submissions(p_class_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.class_teachers ct
    where ct.class_id = p_class_id
      and ct.teacher_id = auth.uid()
      and ct.can_mark_submissions = true
  );
$$;

create or replace function public.teacher_can_manage_members(p_class_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.class_teachers ct
    where ct.class_id = p_class_id
      and ct.teacher_id = auth.uid()
      and (ct.can_manage_members = true or ct.membership_role = 'lead_teacher')
  );
$$;

create or replace function public.teacher_teaches_student(p_student_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.class_members cm
    join public.class_teachers ct on ct.class_id = cm.class_id
    where cm.student_id = p_student_id
      and ct.teacher_id = auth.uid()
  );
$$;

alter table public.class_teachers enable row level security;

drop policy if exists class_teachers_admin_all on public.class_teachers;
create policy class_teachers_admin_all on public.class_teachers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists class_teachers_select on public.class_teachers;
create policy class_teachers_select on public.class_teachers
  for select to authenticated
  using (
    public.is_admin()
    or teacher_id = auth.uid()
    or public.teacher_in_class(class_id)
    or public.student_in_class(class_id)
  );

drop policy if exists class_teachers_lead_manage on public.class_teachers;
create policy class_teachers_lead_manage on public.class_teachers
  for insert to authenticated
  with check (public.teacher_is_lead(class_id));

drop policy if exists class_teachers_lead_update on public.class_teachers;
create policy class_teachers_lead_update on public.class_teachers
  for update to authenticated
  using (public.teacher_is_lead(class_id))
  with check (public.teacher_is_lead(class_id));

drop policy if exists class_teachers_lead_delete on public.class_teachers;
create policy class_teachers_lead_delete on public.class_teachers
  for delete to authenticated
  using (public.teacher_is_lead(class_id));

-- Replace single-owner class policy
drop policy if exists "Teachers manage own classes" on public.classes;
create policy "Teachers manage own classes" on public.classes
  for all to authenticated
  using (public.is_teacher() and public.teacher_in_class(id))
  with check (
    public.is_teacher()
    and (public.teacher_is_lead(id) or teacher_id = auth.uid())
  );

-- Class members: require manage-members permission (leads by default)
drop policy if exists "Teachers manage members of own classes" on public.class_members;
create policy "Teachers manage members of own classes" on public.class_members
  for all to authenticated
  using (public.teacher_can_manage_members(class_id))
  with check (
    public.teacher_can_manage_members(class_id)
    and exists (
      select 1 from public.profiles p
      where p.id = student_id and p.role = 'student' and p.is_active = true
    )
  );

-- Assignments: any authorised class teacher
drop policy if exists "Teachers manage own assignments" on public.assignments;
create policy "Teachers manage own assignments" on public.assignments
  for all to authenticated
  using (
    public.is_teacher()
    and (
      teacher_id = auth.uid()
      or public.teacher_in_class(class_id)
    )
  )
  with check (
    public.is_teacher()
    and public.teacher_can_create_assignments(class_id)
  );

-- Assignment resources
drop policy if exists "Teachers manage resources for own assignments" on public.assignment_resources;
create policy "Teachers manage resources for own assignments" on public.assignment_resources
  for all to authenticated
  using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and public.teacher_in_class(a.class_id)
    )
  )
  with check (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and public.teacher_can_create_assignments(a.class_id)
    )
  );

-- Submissions view/update for authorised markers
drop policy if exists "Teachers view submissions in their classes" on public.submissions;
create policy "Teachers view submissions in their classes" on public.submissions
  for select to authenticated
  using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and public.teacher_can_mark_submissions(a.class_id)
    )
  );

drop policy if exists "Teachers update submissions in their classes" on public.submissions;
create policy "Teachers update submissions in their classes" on public.submissions
  for update to authenticated
  using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and public.teacher_can_mark_submissions(a.class_id)
    )
  )
  with check (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and public.teacher_can_mark_submissions(a.class_id)
    )
  );

drop policy if exists "Teachers manage feedback for their class submissions" on public.feedback;
create policy "Teachers manage feedback for their class submissions" on public.feedback
  for all to authenticated
  using (
    exists (
      select 1
      from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      where s.id = submission_id
        and public.teacher_can_mark_submissions(a.class_id)
    )
  )
  with check (
    exists (
      select 1
      from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      where s.id = submission_id
        and public.teacher_can_mark_submissions(a.class_id)
    )
  );



-- ===== SECTION C: Assignment templates (phase_03) =====
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

-- Unique deployment per template+class (idempotent)
do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignments_template_class_unique'
      and conrelid = 'public.assignments'::regclass
  ) then
    alter table public.assignments
      add constraint assignments_template_class_unique unique (template_id, class_id);
  end if;
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
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_template_id uuid;
  v_deployment_ids uuid[];
begin
  if v_actor is null or not (public.is_teacher() or public.is_admin()) then
    raise exception 'Not authorized';
  end if;

  if p_class_ids is null or coalesce(array_length(p_class_ids, 1), 0) = 0 then
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

  select coalesce(array_agg(d.id), '{}'::uuid[])
  into v_deployment_ids
  from public.deploy_assignment_template(
    v_template_id, p_class_ids, p_due_at, p_release_at,
    p_maximum_mark, p_status, coalesce(p_per_class_due_at, '{}'::jsonb)
  ) as d;

  return jsonb_build_object(
    'template_id', v_template_id,
    'deployment_ids', to_jsonb(v_deployment_ids)
  );
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



-- ============================================================================
-- SECTION D: RPC repair — drop ambiguous overloads, recreate exact app signature
-- Matches src/lib/actions/teacher.ts parameter names and returns jsonb:
--   { "template_id": uuid, "deployment_ids": uuid[] }
-- ============================================================================
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_assignment_template_and_deploy',
        'deploy_assignment_template'
      )
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

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
  p_maximum_mark numeric default 30,
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
begin
  if v_actor is null or not (public.is_teacher() or public.is_admin()) then
    raise exception 'Not authorized';
  end if;

  if p_class_ids is null or coalesce(array_length(p_class_ids, 1), 0) = 0 then
    raise exception 'Select at least one class';
  end if;

  insert into public.assignment_templates (
    created_by, title, instructions,
    allow_text_submission, allow_file_submission,
    default_maximum_mark, academic_year
  ) values (
    v_actor,
    p_title,
    coalesce(p_instructions, ''),
    coalesce(p_allow_text, true),
    coalesce(p_allow_file, true),
    coalesce(p_maximum_mark, 30),
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
    p_maximum_mark,
    p_status,
    coalesce(p_per_class_due_at, '{}'::jsonb)
  ) as d;

  return jsonb_build_object(
    'template_id', v_template_id,
    'deployment_ids', to_jsonb(v_deployment_ids)
  );
end;
$$;

revoke all on function public.deploy_assignment_template(
  uuid, uuid[], timestamptz, timestamptz, numeric, public.assignment_status, jsonb
) from public, anon;

grant execute on function public.deploy_assignment_template(
  uuid, uuid[], timestamptz, timestamptz, numeric, public.assignment_status, jsonb
) to authenticated;

revoke all on function public.create_assignment_template_and_deploy(
  text, text, uuid[], timestamptz, timestamptz, numeric, boolean, boolean,
  public.assignment_status, jsonb, text
) from public, anon;

grant execute on function public.create_assignment_template_and_deploy(
  text, text, uuid[], timestamptz, timestamptz, numeric, boolean, boolean,
  public.assignment_status, jsonb, text
) to authenticated;

-- Table privileges (RLS still enforced)
grant select, insert, update on public.school_settings to authenticated;
grant select, insert, update, delete on public.school_year_groups to authenticated;
grant select, insert, update, delete on public.school_subjects to authenticated;
grant select, insert, update, delete on public.school_class_colours to authenticated;
grant select on public.school_marking_symbols to authenticated;
grant select, insert, update, delete on public.school_marking_symbols to authenticated;
grant select on public.school_default_comment_banks to authenticated;
grant select, insert, update, delete on public.school_default_comment_banks to authenticated;
grant select, insert, update, delete on public.class_teachers to authenticated;
grant select, insert, update, delete on public.assignment_templates to authenticated;

-- ============================================================================
-- Final: reload PostgREST schema cache so tables/RPCs are visible immediately
-- ============================================================================
notify pgrst, 'reload schema';
