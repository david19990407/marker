-- LitCoach Homework Platform — production Supabase schema
-- Run this in the Supabase SQL editor after creating a project.
-- Public self-registration should remain disabled in Auth settings.
--
-- Execution order (required for a fresh database):
--   1. Extensions
--   2. Enums
--   3. Tables
--   4. Indexes
--   5. Functions
--   6. Triggers
--   7. Storage buckets
--   8. Row Level Security (enable + policies last)

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 2. Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'teacher', 'student');
create type public.assignment_status as enum ('draft', 'published', 'archived');
create type public.submission_status as enum ('draft', 'submitted', 'late', 'marked', 'returned');
create type public.feedback_status as enum ('draft', 'released');
create type public.notification_type as enum (
  'assignment_published',
  'deadline_approaching',
  'homework_submitted',
  'feedback_released',
  'submission_reopened'
);

-- ---------------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  first_name text not null,
  last_name text not null,
  display_name text not null,
  role public.user_role not null,
  year_group text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_year_group_check check (
    year_group is null or year_group in ('Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11')
  )
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null default 'English',
  year_group text,
  teacher_id uuid not null references public.profiles (id) on delete restrict,
  join_code text not null unique,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (class_id, student_id)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete restrict,
  title text not null,
  instructions text not null default '',
  due_at timestamptz,
  maximum_mark numeric(6,2) not null default 30 check (maximum_mark > 0),
  status public.assignment_status not null default 'draft',
  allow_text_submission boolean not null default true,
  allow_file_submission boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assignment_resources (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  file_type text not null,
  file_size bigint,
  created_at timestamptz not null default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  written_response text,
  file_name text,
  storage_path text,
  status public.submission_status not null default 'draft',
  submitted_at timestamptz,
  marked_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete restrict,
  mark numeric(6,2),
  strengths text,
  improvements text,
  next_steps text,
  private_notes text,
  status public.feedback_status not null default 'draft',
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text,
  link_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------
create index profiles_role_idx on public.profiles (role);
create index profiles_email_idx on public.profiles (email);
create index profiles_active_idx on public.profiles (is_active);
create index classes_teacher_idx on public.classes (teacher_id);
create index classes_join_code_idx on public.classes (join_code);
create index class_members_student_idx on public.class_members (student_id);
create index class_members_class_idx on public.class_members (class_id);
create index assignments_class_idx on public.assignments (class_id);
create index assignments_teacher_idx on public.assignments (teacher_id);
create index assignments_status_idx on public.assignments (status);
create index submissions_assignment_idx on public.submissions (assignment_id);
create index submissions_student_idx on public.submissions (student_id);
create index submissions_status_idx on public.submissions (status);
create index feedback_teacher_idx on public.feedback (teacher_id);
create index feedback_status_idx on public.feedback (status);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Functions (after tables they reference)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

-- First administrator by created_at (bootstrap / seed admin).
create or replace function public.is_seeded_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles candidate
    where candidate.id = p_user_id
      and candidate.id = (
        select p.id
        from public.profiles p
        where p.role = 'admin'
        order by p.created_at asc, p.id asc
        limit 1
      )
  );
$$;

revoke all on function public.is_seeded_admin(uuid) from public;
grant execute on function public.is_seeded_admin(uuid) to authenticated, service_role;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher' and is_active = true
  );
$$;

create or replace function public.is_student()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'student' and is_active = true
  );
$$;

create or replace function public.teacher_owns_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id
      and c.teacher_id = auth.uid()
      and public.is_teacher()
  );
$$;

create or replace function public.student_in_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_members cm
    where cm.class_id = p_class_id
      and cm.student_id = auth.uid()
  );
$$;

create or replace function public.teacher_teaches_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_members cm
    join public.classes c on c.id = cm.class_id
    where cm.student_id = p_student_id
      and c.teacher_id = auth.uid()
      and c.archived = false
  );
$$;

-- Auto-create profile row when an auth user is created (values come from user metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text := coalesce(new.raw_user_meta_data ->> 'first_name', '');
  v_last text := coalesce(new.raw_user_meta_data ->> 'last_name', '');
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'student');
  v_year text := new.raw_user_meta_data ->> 'year_group';
  v_display text;
begin
  if v_role not in ('admin', 'teacher', 'student') then
    v_role := 'student';
  end if;

  v_display := nullif(trim(both from coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if v_display is null then
    v_display := trim(both from (v_first || ' ' || v_last));
  end if;
  if v_display = '' then
    v_display := split_part(new.email, '@', 1);
  end if;

  insert into public.profiles (
    id, email, first_name, last_name, display_name, role, year_group
  ) values (
    new.id,
    new.email,
    coalesce(nullif(v_first, ''), 'User'),
    coalesce(nullif(v_last, ''), 'Account'),
    v_display,
    v_role::public.user_role,
    nullif(v_year, '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Protect role / is_active / email:
-- - admins may change other users' roles
-- - nobody may change their own role (auth.uid() vs OLD.id / NEW.id)
-- - teachers/students cannot change roles
-- - trusted SECURITY DEFINER helpers set app.bypass_profile_security
create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if current_setting('app.bypass_profile_security', true) = 'on' then
    return new;
  end if;

  if new.role is distinct from old.role then
    if v_actor is not null and (v_actor = old.id or v_actor = new.id) then
      raise exception 'Users cannot change their own role';
    end if;

    if v_actor is null or not public.is_admin() then
      raise exception 'Only administrators can change user roles';
    end if;
  end if;

  if new.is_active is distinct from old.is_active
     or new.email is distinct from old.email then
    if v_actor is null or not public.is_admin() then
      if new.is_active is distinct from old.is_active then
        raise exception 'Users cannot change active status';
      end if;
      if new.email is distinct from old.email then
        raise exception 'Email must be changed via authentication settings';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- Authenticated-admin RPC for profile edits (preserves auth.uid() context).
create or replace function public.admin_update_user_profile(
  p_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_display_name text,
  p_role public.user_role,
  p_year_group text,
  p_is_active boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_existing public.profiles;
  v_updated public.profiles;
begin
  if v_actor is null or not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select *
  into v_existing
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'User not found';
  end if;

  if v_actor = p_user_id and p_role is distinct from v_existing.role then
    raise exception 'Users cannot change their own role';
  end if;

  perform set_config('app.bypass_profile_security', 'on', true);

  update public.profiles
  set
    first_name = p_first_name,
    last_name = p_last_name,
    display_name = p_display_name,
    role = p_role,
    year_group = nullif(trim(coalesce(p_year_group, '')), ''),
    is_active = p_is_active
  where id = p_user_id
  returning * into v_updated;

  return v_updated;
end;
$$;

revoke all on function public.admin_update_user_profile(
  uuid, text, text, text, public.user_role, text, boolean
) from public, anon;

grant execute on function public.admin_update_user_profile(
  uuid, text, text, text, public.user_role, text, boolean
) to authenticated;

-- Bootstrap helper: promote an existing auth user to admin by email.
-- Usage (run as database owner in SQL editor):
--   select public.promote_user_to_admin('you@school.edu');
-- Do not hard-code administrator emails in application source.
-- SECURITY DEFINER + transaction-local GUC bypasses protect_profile_security_fields
-- only for this function call. Normal users remain blocked from changing their role.
create or replace function public.promote_user_to_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Transaction-local bypass for the profile security trigger.
  perform set_config('app.bypass_profile_security', 'on', true);

  update public.profiles
  set role = 'admin', is_active = true
  where lower(email) = lower(p_email);

  if not found then
    raise exception 'No profile found for %', p_email;
  end if;
end;
$$;

revoke all on function public.promote_user_to_admin(text) from public, anon, authenticated;
-- Execute only via service role / SQL editor (postgres).

-- ---------------------------------------------------------------------------
-- 6. Triggers (after tables and functions)
-- ---------------------------------------------------------------------------
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function public.set_updated_at();

create trigger assignments_set_updated_at
  before update on public.assignments
  for each row execute function public.set_updated_at();

create trigger submissions_set_updated_at
  before update on public.submissions
  for each row execute function public.set_updated_at();

create trigger feedback_set_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_protect_security_fields
  before update on public.profiles
  for each row execute function public.protect_profile_security_fields();

-- ---------------------------------------------------------------------------
-- 7. Storage buckets (after schema tables exist)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'assignment-resources',
    'assignment-resources',
    false,
    20971520,
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
      'image/png',
      'image/jpeg',
      'image/webp'
    ]
  ),
  (
    'student-submissions',
    'student-submissions',
    false,
    20971520,
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ]
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Row Level Security — enable tables, then create policies last
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_resources enable row level security;
alter table public.submissions enable row level security;
alter table public.feedback enable row level security;
alter table public.notifications enable row level security;

-- Profiles
create policy "Admins manage all profiles"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own safe profile fields"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Teachers can view students in their classes"
  on public.profiles for select
  using (
    public.is_teacher()
    and (
      id = auth.uid()
      or public.teacher_teaches_student(id)
      or role = 'teacher'
    )
  );

-- Classes
create policy "Admins manage classes"
  on public.classes for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Teachers manage own classes"
  on public.classes for all
  using (public.is_teacher() and teacher_id = auth.uid())
  with check (public.is_teacher() and teacher_id = auth.uid());

create policy "Students view classes they belong to"
  on public.classes for select
  using (public.student_in_class(id) and archived = false);

-- Class members
create policy "Admins manage class members"
  on public.class_members for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Teachers manage members of own classes"
  on public.class_members for all
  using (public.teacher_owns_class(class_id))
  with check (
    public.teacher_owns_class(class_id)
    and exists (
      select 1 from public.profiles p
      where p.id = student_id and p.role = 'student' and p.is_active = true
    )
  );

create policy "Students view own memberships"
  on public.class_members for select
  using (student_id = auth.uid());

create policy "Students can join via insert of self"
  on public.class_members for insert
  with check (
    student_id = auth.uid()
    and public.is_student()
    and exists (
      select 1 from public.classes c
      where c.id = class_id and c.archived = false
    )
  );

-- Assignments
create policy "Admins manage assignments"
  on public.assignments for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Teachers manage own assignments"
  on public.assignments for all
  using (public.is_teacher() and teacher_id = auth.uid())
  with check (
    public.is_teacher()
    and teacher_id = auth.uid()
    and public.teacher_owns_class(class_id)
  );

create policy "Students view published assignments for their classes"
  on public.assignments for select
  using (
    status = 'published'
    and public.student_in_class(class_id)
  );

-- Assignment resources
create policy "Admins manage assignment resources"
  on public.assignment_resources for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Teachers manage resources for own assignments"
  on public.assignment_resources for all
  using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id and a.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id and a.teacher_id = auth.uid()
    )
  );

create policy "Students view resources for published class assignments"
  on public.assignment_resources for select
  using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and a.status = 'published'
        and public.student_in_class(a.class_id)
    )
  );

-- Submissions
create policy "Admins manage submissions"
  on public.submissions for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Teachers view submissions in their classes"
  on public.submissions for select
  using (
    exists (
      select 1
      from public.assignments a
      join public.classes c on c.id = a.class_id
      where a.id = assignment_id
        and c.teacher_id = auth.uid()
    )
  );

create policy "Teachers update submissions in their classes"
  on public.submissions for update
  using (
    exists (
      select 1
      from public.assignments a
      join public.classes c on c.id = a.class_id
      where a.id = assignment_id
        and c.teacher_id = auth.uid()
    )
  );

create policy "Students view own submissions"
  on public.submissions for select
  using (student_id = auth.uid());

create policy "Students insert own draft submissions"
  on public.submissions for insert
  with check (
    student_id = auth.uid()
    and public.is_student()
    and status = 'draft'
    and exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and a.status = 'published'
        and public.student_in_class(a.class_id)
    )
  );

create policy "Students update own draft or reopened submissions"
  on public.submissions for update
  using (
    student_id = auth.uid()
    and status in ('draft', 'returned')
  )
  with check (
    student_id = auth.uid()
  );

-- Feedback
create policy "Admins manage feedback"
  on public.feedback for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Teachers manage feedback for their class submissions"
  on public.feedback for all
  using (
    exists (
      select 1
      from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      join public.classes c on c.id = a.class_id
      where s.id = submission_id
        and c.teacher_id = auth.uid()
    )
  )
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1
      from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      join public.classes c on c.id = a.class_id
      where s.id = submission_id
        and c.teacher_id = auth.uid()
    )
  );

create policy "Students view released feedback on own submissions"
  on public.feedback for select
  using (
    status = 'released'
    and exists (
      select 1 from public.submissions s
      where s.id = submission_id and s.student_id = auth.uid()
    )
  );

-- Notifications
create policy "Users manage own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "Users update own notifications"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Admins manage notifications"
  on public.notifications for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Teachers insert notifications for own class students"
  on public.notifications for insert
  with check (
    public.is_admin()
    or (
      public.is_teacher()
      and (
        user_id = auth.uid()
        or public.teacher_teaches_student(user_id)
      )
    )
  );

-- Storage object policies (after buckets + helper functions exist)
create policy "Admins full access assignment resources storage"
  on storage.objects for all
  using (bucket_id = 'assignment-resources' and public.is_admin())
  with check (bucket_id = 'assignment-resources' and public.is_admin());

create policy "Teachers manage own assignment resource files"
  on storage.objects for all
  using (
    bucket_id = 'assignment-resources'
    and public.is_teacher()
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'assignment-resources'
    and public.is_teacher()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Students read assignment resource files for their classes"
  on storage.objects for select
  using (
    bucket_id = 'assignment-resources'
    and exists (
      select 1
      from public.assignment_resources ar
      join public.assignments a on a.id = ar.assignment_id
      where ar.storage_path = name
        and a.status = 'published'
        and public.student_in_class(a.class_id)
    )
  );

create policy "Admins full access student submissions storage"
  on storage.objects for all
  using (bucket_id = 'student-submissions' and public.is_admin())
  with check (bucket_id = 'student-submissions' and public.is_admin());

create policy "Students manage own submission files"
  on storage.objects for all
  using (
    bucket_id = 'student-submissions'
    and public.is_student()
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'student-submissions'
    and public.is_student()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Teachers read submission files for their classes"
  on storage.objects for select
  using (
    bucket_id = 'student-submissions'
    and public.is_teacher()
    and exists (
      select 1
      from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      join public.classes c on c.id = a.class_id
      where s.storage_path = name
        and c.teacher_id = auth.uid()
    )
  );
