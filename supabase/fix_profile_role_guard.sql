-- Migration: allow admins (and service role) to change other users' roles,
-- while blocking self-role changes except for the first seeded admin.
-- Safe to run once. Does NOT recreate tables, enums, or storage buckets.

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
    -- Authenticated self-edit: only the first seeded admin may change their own role.
    if v_actor is not null and v_actor = new.id then
      if not public.is_seeded_admin(v_actor) then
        raise exception 'Users cannot change their own role';
      end if;
    -- Other-user edits require an admin session or the trusted service role.
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
