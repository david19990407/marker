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

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
