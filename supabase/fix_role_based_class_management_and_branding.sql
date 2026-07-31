-- ============================================================================
-- Homework Passport — role-based class management + theme branding
-- Safe to re-run. Preserves production data. Does not disable RLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Theme colours on school_settings
-- ---------------------------------------------------------------------------
alter table public.school_settings
  add column if not exists primary_colour text not null default '#7C3AED';
alter table public.school_settings
  add column if not exists secondary_colour text not null default '#4F46E5';
alter table public.school_settings
  add column if not exists accent_colour text not null default '#0D9488';

update public.school_settings
set
  primary_colour = coalesce(nullif(btrim(primary_colour), ''), '#7C3AED'),
  secondary_colour = coalesce(nullif(btrim(secondary_colour), ''), '#4F46E5'),
  accent_colour = coalesce(nullif(btrim(accent_colour), ''), '#0D9488');

-- ---------------------------------------------------------------------------
-- 2. Column-level protection for class updates (teachers)
-- Teachers may only change join_code. Admins / service role may change all.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_class_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role / system writes (no JWT) are allowed.
  if auth.uid() is null then
    return NEW;
  end if;

  if public.is_admin() then
    return NEW;
  end if;

  if public.is_teacher() and public.teacher_in_class(OLD.id) then
    if NEW.name is distinct from OLD.name
       or NEW.subject is distinct from OLD.subject
       or NEW.year_group is distinct from OLD.year_group
       or NEW.teacher_id is distinct from OLD.teacher_id
       or NEW.archived is distinct from OLD.archived
       or NEW.colour_hex is distinct from OLD.colour_hex
       or NEW.subject_id is distinct from OLD.subject_id
       or NEW.year_group_id is distinct from OLD.year_group_id
    then
      raise exception
        'Teachers cannot change class configuration. Ask an administrator.';
    end if;
    -- join_code (and updated_at) may change
    return NEW;
  end if;

  raise exception 'Not authorized to update this class';
end;
$$;

drop trigger if exists trg_enforce_class_update_permissions on public.classes;
create trigger trg_enforce_class_update_permissions
  before update on public.classes
  for each row
  execute function public.enforce_class_update_permissions();

-- Narrow teacher update policy: must be in class (join_code regen / memberships
-- still go through their own tables). Full config remains admin-only via trigger.
drop policy if exists classes_teacher_update on public.classes;
create policy classes_teacher_update on public.classes
  for update to authenticated
  using (
    public.is_admin()
    or public.teacher_in_class(id)
    or (public.is_teacher() and teacher_id = auth.uid())
  )
  with check (
    public.is_admin()
    or public.teacher_in_class(id)
    or (public.is_teacher() and teacher_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3. RPC: regenerate join code (admin or assigned teacher)
-- ---------------------------------------------------------------------------
create or replace function public.regenerate_class_join_code(p_class_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_code text;
  v_attempt int;
  v_archived boolean;
begin
  if v_actor is null then
    raise exception 'Not authorized';
  end if;

  if not (
    public.is_admin()
    or public.teacher_in_class(p_class_id)
  ) then
    raise exception 'Not authorized to regenerate this join code';
  end if;

  select archived into v_archived from public.classes where id = p_class_id;
  if v_archived is null then
    raise exception 'Class not found';
  end if;
  if v_archived then
    raise exception 'Cannot regenerate join code for an archived class';
  end if;

  for v_attempt in 1..8 loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      update public.classes
      set join_code = v_code, updated_at = now()
      where id = p_class_id;
      return v_code;
    exception
      when unique_violation then
        if v_attempt = 8 then
          raise exception 'Could not generate a unique join code';
        end if;
    end;
  end loop;

  raise exception 'Could not regenerate join code';
end;
$$;

revoke all on function public.regenerate_class_join_code(uuid) from public, anon;
grant execute on function public.regenerate_class_join_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC: admin update class configuration
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_class(
  p_class_id uuid,
  p_name text,
  p_subject text,
  p_year_group text default null,
  p_colour_hex text default null,
  p_lead_teacher_id uuid default null
)
returns public.classes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.classes;
  v_subject_id uuid;
  v_year_group_id uuid;
  v_old_lead uuid;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can update class configuration';
  end if;

  select * into v_class from public.classes where id = p_class_id for update;
  if not found then
    raise exception 'Class not found';
  end if;

  select id into v_subject_id
  from public.school_subjects
  where lower(btrim(name)) = lower(btrim(coalesce(nullif(trim(p_subject), ''), 'English')))
    and archived_at is null
  order by is_active desc
  limit 1;

  if nullif(trim(coalesce(p_year_group, '')), '') is not null then
    select id into v_year_group_id
    from public.school_year_groups
    where lower(btrim(coalesce(name, label))) = lower(btrim(p_year_group))
      and archived_at is null
    order by is_active desc
    limit 1;
  end if;

  v_old_lead := v_class.teacher_id;

  update public.classes
  set
    name = trim(p_name),
    subject = coalesce(nullif(trim(p_subject), ''), 'English'),
    year_group = nullif(trim(coalesce(p_year_group, '')), ''),
    colour_hex = p_colour_hex,
    subject_id = v_subject_id,
    year_group_id = v_year_group_id,
    teacher_id = coalesce(p_lead_teacher_id, teacher_id),
    updated_at = now()
  where id = p_class_id
  returning * into v_class;

  if p_lead_teacher_id is not null and p_lead_teacher_id is distinct from v_old_lead then
    if not exists (
      select 1 from public.profiles p
      where p.id = p_lead_teacher_id
        and p.is_active
        and p.role in ('teacher', 'admin')
    ) then
      raise exception 'Lead teacher not found';
    end if;

    insert into public.class_teachers (
      class_id, teacher_id, membership_role,
      can_create_assignments, can_mark_submissions, can_manage_members
    ) values (
      p_class_id, p_lead_teacher_id, 'lead_teacher', true, true, true
    )
    on conflict (class_id, teacher_id) do update
    set
      membership_role = 'lead_teacher',
      can_create_assignments = true,
      can_mark_submissions = true,
      can_manage_members = true;

    -- Demote previous lead if still a member
    update public.class_teachers
    set
      membership_role = 'teacher',
      can_manage_members = false
    where class_id = p_class_id
      and teacher_id = v_old_lead
      and teacher_id is distinct from p_lead_teacher_id
      and membership_role = 'lead_teacher';
  end if;

  return v_class;
end;
$$;

revoke all on function public.admin_update_class(uuid, text, text, text, text, uuid)
  from public, anon;
grant execute on function public.admin_update_class(uuid, text, text, text, text, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC: admin archive / restore
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_class_archived(
  p_class_id uuid,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can archive or restore classes';
  end if;

  update public.classes
  set archived = p_archived, updated_at = now()
  where id = p_class_id;

  if not found then
    raise exception 'Class not found';
  end if;
end;
$$;

revoke all on function public.admin_set_class_archived(uuid, boolean) from public, anon;
grant execute on function public.admin_set_class_archived(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC: admin manage class teachers (promote / demote / add / remove)
-- ---------------------------------------------------------------------------
create or replace function public.admin_upsert_class_teacher(
  p_class_id uuid,
  p_teacher_id uuid,
  p_membership_role text default 'teacher'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(nullif(trim(p_membership_role), ''), 'teacher');
begin
  if not public.is_admin() then
    raise exception 'Only administrators can manage class teachers';
  end if;

  if v_role not in ('lead_teacher', 'teacher', 'teaching_assistant', 'cover_teacher') then
    raise exception 'Invalid membership role';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_teacher_id and p.is_active and p.role in ('teacher', 'admin')
  ) then
    raise exception 'Teacher not found';
  end if;

  if v_role = 'lead_teacher' then
    update public.class_teachers
    set membership_role = 'teacher', can_manage_members = false
    where class_id = p_class_id
      and membership_role = 'lead_teacher'
      and teacher_id is distinct from p_teacher_id;

    update public.classes
    set teacher_id = p_teacher_id, updated_at = now()
    where id = p_class_id;
  end if;

  insert into public.class_teachers (
    class_id, teacher_id, membership_role,
    can_create_assignments, can_mark_submissions, can_manage_members
  ) values (
    p_class_id,
    p_teacher_id,
    v_role,
    true,
    true,
    v_role = 'lead_teacher'
  )
  on conflict (class_id, teacher_id) do update
  set
    membership_role = excluded.membership_role,
    can_create_assignments = true,
    can_mark_submissions = true,
    can_manage_members = (excluded.membership_role = 'lead_teacher');
end;
$$;

create or replace function public.admin_remove_class_teacher(
  p_class_id uuid,
  p_teacher_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can remove class teachers';
  end if;

  select membership_role into v_role
  from public.class_teachers
  where class_id = p_class_id and teacher_id = p_teacher_id;

  if v_role is null then
    raise exception 'Teacher is not a member of this class';
  end if;

  select count(*) into v_count
  from public.class_teachers
  where class_id = p_class_id;

  if v_count <= 1 then
    raise exception 'Cannot remove the final teacher from a class';
  end if;

  if v_role = 'lead_teacher' then
    raise exception 'Promote another teacher to lead before removing the current lead';
  end if;

  delete from public.class_teachers
  where class_id = p_class_id and teacher_id = p_teacher_id;
end;
$$;

revoke all on function public.admin_upsert_class_teacher(uuid, uuid, text) from public, anon;
revoke all on function public.admin_remove_class_teacher(uuid, uuid) from public, anon;
grant execute on function public.admin_upsert_class_teacher(uuid, uuid, text) to authenticated;
grant execute on function public.admin_remove_class_teacher(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
