-- Migration: repair promote_user_to_admin bootstrap on an existing Homework Passport database.
-- Safe to run once. Does NOT recreate tables, enums, or storage buckets.
--
-- After this migration succeeds, promote your first admin with:
--   select public.promote_user_to_admin('your.email@school.edu');
--
-- Note: role-guard rules for admin edits of other users live in
-- supabase/fix_profile_role_guard.sql (run that as well if promoting
-- users from the Admin UI fails with "Users cannot change their own role").

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

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_jwt_role text;
  v_is_service boolean := false;
begin
  -- Allow only the SECURITY DEFINER bootstrap/admin path that sets this GUC.
  if current_setting('app.bypass_profile_security', true) = 'on' then
    return new;
  end if;

  begin
    v_jwt_role := coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    );
  exception
    when others then
      v_jwt_role := null;
  end;

  v_is_service := coalesce(v_jwt_role = 'service_role', false);

  if new.role is distinct from old.role then
    if v_actor is not null and v_actor = new.id then
      if not public.is_seeded_admin(v_actor) then
        raise exception 'Users cannot change their own role';
      end if;
    elsif not (public.is_admin() or v_is_service) then
      raise exception 'Users cannot change their own role';
    end if;
  end if;

  if not (public.is_admin() or v_is_service) then
    if new.is_active is distinct from old.is_active then
      raise exception 'Users cannot change active status';
    end if;
    if new.email is distinct from old.email then
      raise exception 'Email must be changed via authentication settings';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.promote_user_to_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Transaction-local bypass for protect_profile_security_fields only.
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
