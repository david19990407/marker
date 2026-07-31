-- Migration: fix admin role editing for other users.
-- Safe to run once. Does NOT recreate tables, enums, or storage buckets.
--
-- Root cause: admin UI updates used the service-role client, so auth.uid()
-- was null inside protect_profile_security_fields and every role change was
-- rejected with "Users cannot change their own role".
--
-- Fix:
-- 1) Clarify the trigger: block self-role changes via auth.uid() vs OLD/NEW.id;
--    only admins may change other users' roles; SECURITY DEFINER paths may
--    set app.bypass_profile_security.
-- 2) Add admin_update_user_profile() RPC (SECURITY DEFINER) that runs as the
--    authenticated admin, enforces no self-role-change, then updates safely.

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- Trusted SECURITY DEFINER helpers (admin RPC / bootstrap) opt in explicitly.
  if current_setting('app.bypass_profile_security', true) = 'on' then
    return new;
  end if;

  if new.role is distinct from old.role then
    -- Always block changing your own role (compare actor to both OLD and NEW id).
    if v_actor is not null and (v_actor = old.id or v_actor = new.id) then
      raise exception 'Users cannot change their own role';
    end if;

    -- Teachers, students, and unauthenticated callers cannot change roles.
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

  -- Admins may edit other users, but never their own role.
  if v_actor = p_user_id and p_role is distinct from v_existing.role then
    raise exception 'Users cannot change their own role';
  end if;

  -- Bypass the row trigger only for this trusted admin path.
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
