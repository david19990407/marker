-- ============================================================================
-- Homework Passport — repair school settings: year groups, subjects, colours
-- Safe to re-run. Preserves production data. Does not replace schema.sql.
-- Extends existing school_year_groups / school_subjects / school_class_colours.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- school_settings branding
-- ---------------------------------------------------------------------------
create table if not exists public.school_settings (
  id uuid primary key default gen_random_uuid(),
  school_name text not null default 'My School',
  platform_display_name text not null default 'Homework Passport',
  max_upload_bytes bigint not null default 20971520,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.school_settings
  add column if not exists school_name text not null default 'My School';
alter table public.school_settings
  add column if not exists platform_display_name text not null default 'Homework Passport';
alter table public.school_settings
  add column if not exists created_at timestamptz not null default now();
alter table public.school_settings
  add column if not exists updated_at timestamptz not null default now();

update public.school_settings
set platform_display_name = 'Homework Passport'
where platform_display_name is null
   or btrim(platform_display_name) = ''
   or platform_display_name in ('LitCoach', 'Homework Platform');

insert into public.school_settings (school_name, platform_display_name)
select 'My School', 'Homework Passport'
where not exists (select 1 from public.school_settings);

-- ---------------------------------------------------------------------------
-- Year groups (enhance school_year_groups)
-- Suggested fields: id, name, code, display_order, is_active, archived_at, …
-- Existing column "label" is the display name; "sort_order" is display order.
-- ---------------------------------------------------------------------------
create table if not exists public.school_year_groups (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.school_year_groups add column if not exists name text;
alter table public.school_year_groups add column if not exists code text;
alter table public.school_year_groups add column if not exists archived_at timestamptz;
alter table public.school_year_groups add column if not exists updated_at timestamptz not null default now();

-- Keep name in sync with label (name is the canonical display field going forward)
update public.school_year_groups
set name = label
where name is null or btrim(name) = '';

alter table public.school_year_groups alter column name set default '';

-- Backfill codes for standard years
update public.school_year_groups
set code = case lower(btrim(coalesce(name, label)))
  when 'year 7' then 'Y7'
  when 'year 8' then 'Y8'
  when 'year 9' then 'Y9'
  when 'year 10' then 'Y10'
  when 'year 11' then 'Y11'
  when 'year 12' then 'Y12'
  when 'year 13' then 'Y13'
  else code
end
where code is null or btrim(code) = '';

create unique index if not exists school_year_groups_name_unique_ci
  on public.school_year_groups (lower(btrim(name)));

create unique index if not exists school_year_groups_code_unique_ci
  on public.school_year_groups (lower(btrim(code)))
  where code is not null and btrim(code) <> '';

insert into public.school_year_groups (label, name, code, sort_order, is_active)
select v.label, v.label, v.code, v.sort_order, true
from (
  values
    ('Year 7', 'Y7', 1),
    ('Year 8', 'Y8', 2),
    ('Year 9', 'Y9', 3),
    ('Year 10', 'Y10', 4),
    ('Year 11', 'Y11', 5),
    ('Year 12', 'Y12', 6),
    ('Year 13', 'Y13', 7)
) as v(label, code, sort_order)
where not exists (
  select 1 from public.school_year_groups yg
  where lower(btrim(coalesce(yg.name, yg.label))) = lower(btrim(v.label))
);

-- Normalise sort_order to 1..n for defaults where still using year number (7..13)
update public.school_year_groups
set sort_order = case lower(btrim(coalesce(name, label)))
  when 'year 7' then 1
  when 'year 8' then 2
  when 'year 9' then 3
  when 'year 10' then 4
  when 'year 11' then 5
  when 'year 12' then 6
  when 'year 13' then 7
  else sort_order
end
where lower(btrim(coalesce(name, label))) like 'year %';

-- Allow custom year groups on profiles (no hard-coded list)
alter table public.profiles drop constraint if exists profiles_year_group_check;

-- ---------------------------------------------------------------------------
-- Subjects (enhance school_subjects)
-- ---------------------------------------------------------------------------
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

alter table public.school_subjects add column if not exists code text;
alter table public.school_subjects add column if not exists icon_type text;
alter table public.school_subjects add column if not exists icon_value text;
alter table public.school_subjects add column if not exists colour text;
alter table public.school_subjects add column if not exists archived_at timestamptz;

update public.school_subjects
set icon_type = case
  when icon_storage_path is not null and btrim(icon_storage_path) <> '' then 'upload'
  else 'built_in'
end
where icon_type is null;

update public.school_subjects
set icon_value = coalesce(
  nullif(btrim(icon_storage_path), ''),
  nullif(btrim(icon_key), ''),
  'book'
)
where icon_value is null or btrim(icon_value) = '';

update public.school_subjects
set colour = coalesce(nullif(btrim(colour), ''), '#7C3AED')
where colour is null or btrim(colour) = '';

update public.school_subjects
set code = 'ENG'
where lower(btrim(name)) = 'english'
  and (code is null or btrim(code) = '');

create unique index if not exists school_subjects_name_unique_ci
  on public.school_subjects (lower(btrim(name)));

create unique index if not exists school_subjects_code_unique_ci
  on public.school_subjects (lower(btrim(code)))
  where code is not null and btrim(code) <> '';

-- Seed English as the initial subject (do not remove existing subjects)
insert into public.school_subjects (
  name, code, icon_key, icon_type, icon_value, colour, sort_order, is_active
)
select 'English', 'ENG', 'book', 'built_in', 'book', '#7C3AED', 1, true
where not exists (
  select 1 from public.school_subjects s where lower(btrim(s.name)) = 'english'
);

-- ---------------------------------------------------------------------------
-- Class colours (enhance school_class_colours)
-- ---------------------------------------------------------------------------
create table if not exists public.school_class_colours (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  hex text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.school_class_colours (name, hex, sort_order, is_active)
select v.name, v.hex, v.sort_order, true
from (
  values
    ('Violet', '#7C3AED', 1),
    ('Indigo', '#4F46E5', 2),
    ('Blue', '#2563EB', 3),
    ('Teal', '#0D9488', 4),
    ('Green', '#16A34A', 5),
    ('Amber', '#D97706', 6),
    ('Rose', '#E11D48', 7),
    ('Slate', '#475569', 8)
) as v(name, hex, sort_order)
where not exists (
  select 1 from public.school_class_colours c
  where lower(btrim(c.name)) = lower(btrim(v.name))
     or lower(btrim(c.hex)) = lower(btrim(v.hex))
);

-- ---------------------------------------------------------------------------
-- Link classes to subject / year group IDs (keep legacy text columns)
-- ---------------------------------------------------------------------------
alter table public.classes
  add column if not exists colour_hex text;
alter table public.classes
  add column if not exists subject_id uuid references public.school_subjects(id) on delete set null;
alter table public.classes
  add column if not exists year_group_id uuid references public.school_year_groups(id) on delete set null;

create index if not exists classes_subject_id_idx on public.classes (subject_id);
create index if not exists classes_year_group_id_idx on public.classes (year_group_id);

update public.classes c
set subject_id = s.id
from public.school_subjects s
where c.subject_id is null
  and lower(btrim(c.subject)) = lower(btrim(s.name));

update public.classes c
set year_group_id = yg.id
from public.school_year_groups yg
where c.year_group_id is null
  and lower(btrim(c.year_group)) = lower(btrim(coalesce(yg.name, yg.label)));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.school_settings enable row level security;
alter table public.school_year_groups enable row level security;
alter table public.school_subjects enable row level security;
alter table public.school_class_colours enable row level security;

drop policy if exists school_settings_select on public.school_settings;
create policy school_settings_select on public.school_settings
  for select to authenticated using (true);

-- Public branding on login / password pages
drop policy if exists school_settings_anon_select on public.school_settings;
create policy school_settings_anon_select on public.school_settings
  for select to anon using (true);

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

grant select on public.school_settings to anon, authenticated;
grant select, insert, update, delete on public.school_settings to authenticated;
grant select on public.school_year_groups to authenticated;
grant select, insert, update, delete on public.school_year_groups to authenticated;
grant select on public.school_subjects to authenticated;
grant select, insert, update, delete on public.school_subjects to authenticated;
grant select on public.school_class_colours to authenticated;
grant select, insert, update, delete on public.school_class_colours to authenticated;

-- ---------------------------------------------------------------------------
-- Safe delete helpers (block when dependents exist)
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_year_group(p_year_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_class_count integer;
  v_profile_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can delete year groups';
  end if;

  select coalesce(name, label) into v_name
  from public.school_year_groups
  where id = p_year_group_id;

  if v_name is null then
    raise exception 'Year group not found';
  end if;

  select count(*) into v_class_count
  from public.classes
  where year_group_id = p_year_group_id
     or lower(btrim(coalesce(year_group, ''))) = lower(btrim(v_name));

  select count(*) into v_profile_count
  from public.profiles
  where lower(btrim(coalesce(year_group, ''))) = lower(btrim(v_name));

  if v_class_count > 0 or v_profile_count > 0 then
    raise exception
      'Cannot delete year group "%" because it is used by % class(es) and % user(s). Archive it instead.',
      v_name, v_class_count, v_profile_count;
  end if;

  delete from public.school_year_groups where id = p_year_group_id;
end;
$$;

create or replace function public.admin_delete_subject(p_subject_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_class_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can delete subjects';
  end if;

  select name into v_name from public.school_subjects where id = p_subject_id;
  if v_name is null then
    raise exception 'Subject not found';
  end if;

  select count(*) into v_class_count
  from public.classes
  where subject_id = p_subject_id
     or lower(btrim(coalesce(subject, ''))) = lower(btrim(v_name));

  if v_class_count > 0 then
    raise exception
      'Cannot delete subject "%" because it is used by % class(es). Archive it instead.',
      v_name, v_class_count;
  end if;

  delete from public.school_subjects where id = p_subject_id;
end;
$$;

revoke all on function public.admin_delete_year_group(uuid) from public;
revoke all on function public.admin_delete_subject(uuid) from public;
grant execute on function public.admin_delete_year_group(uuid) to authenticated;
grant execute on function public.admin_delete_subject(uuid) to authenticated;

-- Keep label synced when name changes (legacy readers)
create or replace function public.sync_year_group_label()
returns trigger
language plpgsql
as $$
begin
  if new.name is not null and btrim(new.name) <> '' then
    new.label := new.name;
  elsif new.label is not null and btrim(new.label) <> '' then
    new.name := new.label;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sync_year_group_label on public.school_year_groups;
create trigger trg_sync_year_group_label
  before insert or update on public.school_year_groups
  for each row execute function public.sync_year_group_label();

-- Keep icon_key / icon_storage_path in sync with icon_type / icon_value
create or replace function public.sync_subject_icon_fields()
returns trigger
language plpgsql
as $$
begin
  if new.icon_type = 'upload' then
    new.icon_storage_path := new.icon_value;
  else
    new.icon_type := coalesce(nullif(btrim(new.icon_type), ''), 'built_in');
    new.icon_key := coalesce(nullif(btrim(new.icon_value), ''), nullif(btrim(new.icon_key), ''), 'book');
    new.icon_value := new.icon_key;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sync_subject_icon_fields on public.school_subjects;
create trigger trg_sync_subject_icon_fields
  before insert or update on public.school_subjects
  for each row execute function public.sync_subject_icon_fields();

-- Subject icon storage bucket
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('subject-icons', 'subject-icons', true)
  on conflict (id) do nothing;
exception
  when undefined_table then null;
  when others then null;
end $$;

do $$
begin
  drop policy if exists "Authenticated read subject icons" on storage.objects;
  create policy "Authenticated read subject icons"
    on storage.objects for select to authenticated
    using (bucket_id = 'subject-icons');

  drop policy if exists "Admins upload subject icons" on storage.objects;
  create policy "Admins upload subject icons"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'subject-icons' and public.is_admin());

  drop policy if exists "Admins update subject icons" on storage.objects;
  create policy "Admins update subject icons"
    on storage.objects for update to authenticated
    using (bucket_id = 'subject-icons' and public.is_admin())
    with check (bucket_id = 'subject-icons' and public.is_admin());

  drop policy if exists "Admins delete subject icons" on storage.objects;
  create policy "Admins delete subject icons"
    on storage.objects for delete to authenticated
    using (bucket_id = 'subject-icons' and public.is_admin());
exception
  when undefined_table then null;
  when others then null;
end $$;

notify pgrst, 'reload schema';
