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

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
