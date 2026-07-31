-- Fix class creation RLS / lead-teacher bootstrap.
-- Safe for existing production data. Does not drop classes or memberships.
--
-- Root cause: the "Teachers manage own classes" FOR ALL policy required
-- teacher_in_class(id) / teacher_is_lead(id), which cannot pass on INSERT
-- before a class_teachers row exists (chicken-and-egg).

-- ---------------------------------------------------------------------------
-- 1. Split class policies: insert must not depend on class_teachers
-- ---------------------------------------------------------------------------
drop policy if exists "Teachers manage own classes" on public.classes;
drop policy if exists classes_teacher_select on public.classes;
drop policy if exists classes_teacher_insert on public.classes;
drop policy if exists classes_teacher_update on public.classes;
drop policy if exists classes_teachers_select on public.classes;
drop policy if exists classes_teachers_insert on public.classes;
drop policy if exists classes_teachers_update on public.classes;

-- Admins policy from schema.sql remains: "Admins manage classes"

create policy classes_teacher_select on public.classes
  for select to authenticated
  using (
    public.is_admin()
    or public.teacher_in_class(id)
    or (public.is_teacher() and teacher_id = auth.uid())
  );

create policy classes_teacher_insert on public.classes
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.is_teacher()
      and teacher_id = auth.uid()
    )
  );

create policy classes_teacher_update on public.classes
  for update to authenticated
  using (
    public.is_admin()
    or public.teacher_is_lead(id)
    or (public.is_teacher() and teacher_id = auth.uid())
  )
  with check (
    public.is_admin()
    or public.teacher_is_lead(id)
    or (public.is_teacher() and teacher_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 2. class_teachers: allow a teacher to insert themselves as lead on create
-- ---------------------------------------------------------------------------
drop policy if exists class_teachers_self_lead_insert on public.class_teachers;
create policy class_teachers_self_lead_insert on public.class_teachers
  for insert to authenticated
  with check (
    public.is_admin()
    or public.teacher_is_lead(class_id)
    or (
      public.is_teacher()
      and teacher_id = auth.uid()
      and membership_role = 'lead_teacher'
      and exists (
        select 1 from public.classes c
        where c.id = class_id
          and c.teacher_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Atomic create RPC (preferred path for app actions)
-- ---------------------------------------------------------------------------
create or replace function public.create_class_with_lead_teacher(
  p_name text,
  p_subject text default 'English',
  p_year_group text default null,
  p_teacher_id uuid default null,
  p_colour_hex text default null,
  p_additional_teacher_ids uuid[] default '{}'::uuid[]
)
returns public.classes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_lead uuid;
  v_join text;
  v_class public.classes;
  v_extra uuid;
  v_attempt int;
  v_has_subject_id boolean := false;
  v_has_year_group_id boolean := false;
  v_subject_id uuid;
  v_year_group_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authorized';
  end if;

  if not (public.is_admin() or public.is_teacher()) then
    raise exception 'Not authorized';
  end if;

  -- Teachers may only create classes for themselves as lead.
  if public.is_admin() then
    v_lead := coalesce(p_teacher_id, v_actor);
  else
    v_lead := v_actor;
    if p_teacher_id is not null and p_teacher_id <> v_actor then
      raise exception 'Teachers can only create classes for themselves';
    end if;
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_lead
      and p.is_active = true
      and p.role in ('teacher', 'admin')
  ) then
    raise exception 'Lead teacher not found';
  end if;

  -- Optional FK columns added by fix_school_settings_subjects_year_groups.sql
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'classes' and column_name = 'subject_id'
  ) into v_has_subject_id;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'classes' and column_name = 'year_group_id'
  ) into v_has_year_group_id;

  if v_has_subject_id then
    begin
      execute
        $q$
        select id from public.school_subjects
        where lower(btrim(name)) = lower(btrim($1))
          and (archived_at is null)
        order by is_active desc
        limit 1
        $q$
        into v_subject_id
        using coalesce(nullif(trim(p_subject), ''), 'English');
    exception
      when undefined_column then
        execute
          $q$
          select id from public.school_subjects
          where lower(btrim(name)) = lower(btrim($1))
          order by is_active desc
          limit 1
          $q$
          into v_subject_id
          using coalesce(nullif(trim(p_subject), ''), 'English');
      when undefined_table then
        v_subject_id := null;
    end;
  end if;

  if v_has_year_group_id and nullif(trim(coalesce(p_year_group, '')), '') is not null then
    begin
      execute
        $q$
        select id from public.school_year_groups
        where (
          lower(btrim(coalesce(name, label))) = lower(btrim($1))
          or lower(btrim(label)) = lower(btrim($1))
        )
          and archived_at is null
        order by is_active desc
        limit 1
        $q$
        into v_year_group_id
        using trim(p_year_group);
    exception
      when undefined_column then
        execute
          $q$
          select id from public.school_year_groups
          where lower(btrim(label)) = lower(btrim($1))
          order by is_active desc
          limit 1
          $q$
          into v_year_group_id
          using trim(p_year_group);
      when undefined_table then
        v_year_group_id := null;
    end;
  end if;

  for v_attempt in 1..8 loop
    v_join := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      if v_has_subject_id and v_has_year_group_id then
        execute
          'insert into public.classes (
             name, subject, year_group, teacher_id, join_code, colour_hex, subject_id, year_group_id
           ) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *'
          into v_class
          using
            trim(p_name),
            coalesce(nullif(trim(p_subject), ''), 'English'),
            nullif(trim(coalesce(p_year_group, '')), ''),
            v_lead,
            v_join,
            p_colour_hex,
            v_subject_id,
            v_year_group_id;
      else
        insert into public.classes (
          name, subject, year_group, teacher_id, join_code, colour_hex
        ) values (
          trim(p_name),
          coalesce(nullif(trim(p_subject), ''), 'English'),
          nullif(trim(coalesce(p_year_group, '')), ''),
          v_lead,
          v_join,
          p_colour_hex
        )
        returning * into v_class;
      end if;
      exit;
    exception
      when unique_violation then
        if v_attempt = 8 then
          raise exception 'Could not generate a unique join code';
        end if;
    end;
  end loop;

  insert into public.class_teachers (
    class_id, teacher_id, membership_role,
    can_create_assignments, can_mark_submissions, can_manage_members
  ) values (
    v_class.id, v_lead, 'lead_teacher', true, true, true
  )
  on conflict (class_id, teacher_id) do update
  set
    membership_role = 'lead_teacher',
    can_create_assignments = true,
    can_mark_submissions = true,
    can_manage_members = true;

  if p_additional_teacher_ids is not null then
    foreach v_extra in array p_additional_teacher_ids loop
      if v_extra is distinct from v_lead
         and exists (
           select 1 from public.profiles p
           where p.id = v_extra and p.is_active and p.role in ('teacher', 'admin')
         )
      then
        insert into public.class_teachers (
          class_id, teacher_id, membership_role,
          can_create_assignments, can_mark_submissions, can_manage_members
        ) values (
          v_class.id, v_extra, 'teacher', true, true, false
        )
        on conflict (class_id, teacher_id) do nothing;
      end if;
    end loop;
  end if;

  return v_class;
end;
$$;

revoke all on function public.create_class_with_lead_teacher(
  text, text, text, uuid, text, uuid[]
) from public, anon;

grant execute on function public.create_class_with_lead_teacher(
  text, text, text, uuid, text, uuid[]
) to authenticated;

notify pgrst, 'reload schema';
