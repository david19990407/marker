-- Phase 8 live blocker: comment annotation source references
-- Root cause: assignment_comments.id was written into
--   submission_annotations.source_comment_item_id
-- which REFERENCES comment_bank_items(id), causing
--   submission_annotations_source_comment_item_id_fkey
--
-- Run after:
--   1. supabase/phase_05_flexible_feedback_and_comment_banks.sql
--   2. supabase/phase_06_annotations_and_stamps.sql
--   3. supabase/fix_phase_08_marking_workspace_usability.sql
-- Idempotent. Does not delete annotations.

alter table public.submission_annotations
  add column if not exists source_assignment_comment_id uuid
    references public.assignment_comments (id) on delete set null;

alter table public.submission_annotations
  add column if not exists source_type text;

alter table public.submission_annotations
  add column if not exists text_snapshot text;

alter table public.submission_annotations
  add column if not exists source_title_snapshot text;

alter table public.submission_annotations
  add column if not exists source_short_label_snapshot text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'submission_annotations_one_source_chk'
  ) then
    alter table public.submission_annotations
      add constraint submission_annotations_one_source_chk
      check (
        num_nonnulls(source_comment_item_id, source_assignment_comment_id) <= 1
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'submission_annotations_source_type_chk'
  ) then
    alter table public.submission_annotations
      add constraint submission_annotations_source_type_chk
      check (
        source_type is null
        or source_type in ('comment_bank_item', 'assignment_comment')
      );
  end if;
end $$;

create index if not exists submission_annotations_source_assignment_comment_idx
  on public.submission_annotations (source_assignment_comment_id)
  where source_assignment_comment_id is not null;

-- Preserve text; null invalid historical bank FKs (do not delete rows).
update public.submission_annotations
set text_snapshot = coalesce(
  nullif(text_snapshot, ''),
  nullif(text_content, ''),
  nullif(geometry ->> 'text_snapshot', '')
)
where annotation_type in ('area_comment', 'text_comment')
  and (text_snapshot is null or btrim(text_snapshot) = '');

update public.submission_annotations a
set source_comment_item_id = null
where a.source_comment_item_id is not null
  and not exists (
    select 1 from public.comment_bank_items i
    where i.id = a.source_comment_item_id
  );

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
  v_source_item uuid := nullif(p_payload->>'source_comment_item_id', '')::uuid;
  v_source_assignment uuid := nullif(p_payload->>'source_assignment_comment_id', '')::uuid;
  v_source_type text := nullif(p_payload->>'source_type', '');
  v_text_snapshot text := coalesce(
    nullif(p_payload->>'text_snapshot', ''),
    nullif(p_payload->>'text_content', ''),
    nullif(p_payload #>> '{geometry,text_snapshot}', '')
  );
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Validate optional sources; invalid IDs become null (never fail the annotation).
  if v_source_item is not null and not exists (
    select 1 from public.comment_bank_items i where i.id = v_source_item
  ) then
    raise notice 'annotation source_comment_item_id % invalid — storing null', v_source_item;
    v_source_item := null;
  end if;
  if v_source_assignment is not null and not exists (
    select 1 from public.assignment_comments c where c.id = v_source_assignment
  ) then
    raise notice 'annotation source_assignment_comment_id % invalid — storing null', v_source_assignment;
    v_source_assignment := null;
  end if;
  if v_source_item is not null and v_source_assignment is not null then
    v_source_assignment := null;
  end if;
  if v_source_type is null then
    if v_source_item is not null then
      v_source_type := 'comment_bank_item';
    elsif v_source_assignment is not null then
      v_source_type := 'assignment_comment';
    end if;
  elsif v_source_type = 'comment_bank_item' and v_source_item is null then
    v_source_type := null;
  elsif v_source_type = 'assignment_comment' and v_source_assignment is null then
    v_source_type := null;
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
    x_norm, y_norm, w_norm, h_norm, geometry, text_content, text_snapshot,
    source_title_snapshot, source_short_label_snapshot,
    colour, opacity, stroke_width, stamp_id,
    source_comment_item_id, source_assignment_comment_id, source_type,
    visibility, client_version, is_deleted, created_by
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
    v_text_snapshot,
    nullif(p_payload->>'source_title_snapshot', ''),
    nullif(p_payload->>'source_short_label_snapshot', ''),
    coalesce(nullif(p_payload->>'colour', ''), '#ef4444'),
    coalesce((p_payload->>'opacity')::numeric, 0.35),
    coalesce((p_payload->>'stroke_width')::numeric, 2),
    nullif(p_payload->>'stamp_id', '')::uuid,
    v_source_item,
    v_source_assignment,
    v_source_type,
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
    text_snapshot = coalesce(excluded.text_snapshot, public.submission_annotations.text_snapshot),
    source_title_snapshot = coalesce(excluded.source_title_snapshot, public.submission_annotations.source_title_snapshot),
    source_short_label_snapshot = coalesce(excluded.source_short_label_snapshot, public.submission_annotations.source_short_label_snapshot),
    colour = excluded.colour,
    opacity = excluded.opacity,
    stroke_width = excluded.stroke_width,
    stamp_id = excluded.stamp_id,
    source_comment_item_id = excluded.source_comment_item_id,
    source_assignment_comment_id = excluded.source_assignment_comment_id,
    source_type = excluded.source_type,
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
