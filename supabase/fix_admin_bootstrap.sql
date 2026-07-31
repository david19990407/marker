-- Migration: repair promote_user_to_admin bootstrap on an existing LitCoach database.
-- Safe to run once. Does NOT recreate tables, enums, or storage buckets.
--
-- After this migration succeeds, promote your first admin with:
--   select public.promote_user_to_admin('your.email@school.edu');

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow only the SECURITY DEFINER bootstrap/admin path that sets this GUC.
  if current_setting('app.bypass_profile_security', true) = 'on' then
    return new;
  end if;

  if not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Users cannot change their own role';
    end if;
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
