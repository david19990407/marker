-- Phase 8 correction: annotation toolbar preferences + linked comment provenance
-- Run after:
--   1. supabase/phase_06_annotations_and_stamps.sql
--   2. supabase/fix_phase_08_marking_workspace_usability.sql
--   3. supabase/fix_phase_08_stamp_editing_and_palette_visibility.sql
-- Idempotent.

-- ── Teacher-specific stamp order / pins ─────────────────────────────────────

create table if not exists public.teacher_annotation_preferences (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  stamp_id uuid not null references public.school_marking_symbols (id) on delete cascade,
  display_order integer not null default 0,
  is_pinned boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (teacher_id, stamp_id)
);

create index if not exists teacher_annotation_preferences_teacher_idx
  on public.teacher_annotation_preferences (teacher_id, display_order);

drop trigger if exists teacher_annotation_preferences_set_updated_at
  on public.teacher_annotation_preferences;
create trigger teacher_annotation_preferences_set_updated_at
  before update on public.teacher_annotation_preferences
  for each row execute function public.set_updated_at();

alter table public.teacher_annotation_preferences enable row level security;

drop policy if exists teacher_annotation_preferences_own
  on public.teacher_annotation_preferences;
create policy teacher_annotation_preferences_own
  on public.teacher_annotation_preferences
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

drop policy if exists teacher_annotation_preferences_admin_read
  on public.teacher_annotation_preferences;
create policy teacher_annotation_preferences_admin_read
  on public.teacher_annotation_preferences
  for select to authenticated
  using (public.is_admin());

grant select, insert, update, delete on public.teacher_annotation_preferences
  to authenticated;

-- ── Persist linked-comment provenance on annotations ────────────────────────

create or replace function public.upsert_submission_annotation(
  p_payload jsonb
)
returns public.submission_annotations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_existing public.submission_annotations;
  v_incoming_version bigint := coalesce((p_payload->>'client_version')::bigint, 1);
  v_row public.submission_annotations;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_id is not null then
    select * into v_existing
    from public.submission_annotations
    where id = v_id
    for update;

    if v_existing.id is not null and v_incoming_version < v_existing.client_version then
      raise exception 'stale_annotation_version';
    end if;
  end if;

  insert into public.submission_annotations (
    id, submission_id, assignment_id, question_id, block_id, page_number,
    target_kind, target_path, annotation_type,
    x_norm, y_norm, w_norm, h_norm, geometry, text_content,
    colour, opacity, stroke_width, stamp_id, source_comment_item_id, visibility,
    client_version, is_deleted, created_by
  ) values (
    coalesce(v_id, gen_random_uuid()),
    (p_payload->>'submission_id')::uuid,
    (p_payload->>'assignment_id')::uuid,
    nullif(p_payload->>'question_id', '')::uuid,
    nullif(p_payload->>'block_id', ''),
    nullif(p_payload->>'page_number', '')::int,
    coalesce(p_payload->>'target_kind', 'worksheet'),
    nullif(p_payload->>'target_path', ''),
    (p_payload->>'annotation_type')::public.annotation_type,
    coalesce((p_payload->>'x_norm')::numeric, 0),
    coalesce((p_payload->>'y_norm')::numeric, 0),
    coalesce((p_payload->>'w_norm')::numeric, 0),
    coalesce((p_payload->>'h_norm')::numeric, 0),
    coalesce(p_payload->'geometry', '{}'::jsonb),
    nullif(p_payload->>'text_content', ''),
    coalesce(nullif(p_payload->>'colour', ''), '#ef4444'),
    coalesce((p_payload->>'opacity')::numeric, 0.35),
    coalesce((p_payload->>'stroke_width')::numeric, 2),
    nullif(p_payload->>'stamp_id', '')::uuid,
    nullif(p_payload->>'source_comment_item_id', '')::uuid,
    coalesce(
      nullif(p_payload->>'visibility', '')::public.annotation_visibility,
      'teacher_only'::public.annotation_visibility
    ),
    v_incoming_version,
    coalesce((p_payload->>'is_deleted')::boolean, false),
    v_uid
  )
  on conflict (id) do update
  set
    question_id = excluded.question_id,
    block_id = excluded.block_id,
    page_number = excluded.page_number,
    target_kind = excluded.target_kind,
    target_path = excluded.target_path,
    x_norm = excluded.x_norm,
    y_norm = excluded.y_norm,
    w_norm = excluded.w_norm,
    h_norm = excluded.h_norm,
    geometry = excluded.geometry,
    text_content = excluded.text_content,
    colour = excluded.colour,
    opacity = excluded.opacity,
    stroke_width = excluded.stroke_width,
    stamp_id = excluded.stamp_id,
    source_comment_item_id = excluded.source_comment_item_id,
    visibility = excluded.visibility,
    client_version = excluded.client_version,
    is_deleted = excluded.is_deleted,
    updated_at = now()
  where public.submission_annotations.client_version <= excluded.client_version
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.upsert_submission_annotation(jsonb) from public, anon;
grant execute on function public.upsert_submission_annotation(jsonb) to authenticated;

notify pgrst, 'reload schema';
