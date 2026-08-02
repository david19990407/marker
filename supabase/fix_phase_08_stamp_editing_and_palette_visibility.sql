-- =============================================================================
-- Phase 8: stamp editing, palette visibility, immutable asset versions
-- Additive only. Preserves existing annotations and stamp definitions.
-- =============================================================================

alter table public.school_marking_symbols
  add column if not exists is_palette_visible boolean not null default true,
  add column if not exists default_width_px integer not null default 64,
  add column if not exists default_height_px integer not null default 64,
  add column if not exists current_asset_id uuid,
  add column if not exists asset_version integer not null default 1,
  add column if not exists updated_by uuid references public.profiles (id) on delete set null,
  add column if not exists archived_by uuid references public.profiles (id) on delete set null,
  add column if not exists is_internal boolean not null default false;

-- Hide internal fallbacks from administrators and teachers.
create index if not exists school_marking_symbols_palette_idx
  on public.school_marking_symbols (is_active, is_palette_visible, sort_order)
  where archived_at is null and is_internal = false;

create table if not exists public.annotation_stamp_assets (
  id uuid primary key default gen_random_uuid(),
  stamp_id uuid not null references public.school_marking_symbols (id) on delete cascade,
  storage_path text not null,
  mime_type text,
  width integer not null default 64,
  height integer not null default 64,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  is_current boolean not null default true,
  unique (stamp_id, version)
);

create index if not exists annotation_stamp_assets_stamp_idx
  on public.annotation_stamp_assets (stamp_id, is_current);

-- Backfill one asset version from existing stamp storage paths.
insert into public.annotation_stamp_assets (
  stamp_id,
  storage_path,
  mime_type,
  width,
  height,
  version,
  created_by,
  is_current
)
select
  s.id,
  s.storage_path,
  s.mime_type,
  coalesce(s.default_width_px, 64),
  coalesce(s.default_height_px, 64),
  greatest(1, coalesce(s.asset_version, 1)),
  s.created_by,
  true
from public.school_marking_symbols s
where s.storage_path is not null
  and not exists (
    select 1 from public.annotation_stamp_assets a where a.stamp_id = s.id
  );

update public.school_marking_symbols s
set current_asset_id = a.id,
    asset_version = a.version
from public.annotation_stamp_assets a
where a.stamp_id = s.id
  and a.is_current = true
  and (s.current_asset_id is null or s.current_asset_id is distinct from a.id);

do $$ begin
  alter table public.school_marking_symbols
    add constraint school_marking_symbols_current_asset_fk
    foreign key (current_asset_id)
    references public.annotation_stamp_assets (id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

alter table public.annotation_stamp_assets enable row level security;

drop policy if exists annotation_stamp_assets_select on public.annotation_stamp_assets;
create policy annotation_stamp_assets_select on public.annotation_stamp_assets
  for select to authenticated
  using (true);

drop policy if exists annotation_stamp_assets_admin on public.annotation_stamp_assets;
create policy annotation_stamp_assets_admin on public.annotation_stamp_assets
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

grant select on public.annotation_stamp_assets to authenticated;
grant select, insert, update, delete on public.annotation_stamp_assets to authenticated;

notify pgrst, 'reload schema';
