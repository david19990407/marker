-- =============================================================================
-- Phase 8 usability follow-up: comment-bank groups, annotation provenance,
-- release-visible annotations, and assignment bank link modes.
-- Safe / additive. Does NOT rerun schema.sql.
-- =============================================================================

-- Comment bank groups (e.g. bank "Paper 1" → group "Question 2")
create table if not exists public.comment_bank_groups (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.comment_banks (id) on delete cascade,
  name text not null,
  short_code text,
  description text,
  sort_order integer not null default 0,
  linked_question_id uuid,
  mark_range_min numeric(6,2),
  mark_range_max numeric(6,2),
  category text not null default '',
  tags text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comment_bank_groups_bank_sort_idx
  on public.comment_bank_groups (bank_id, sort_order);

drop trigger if exists comment_bank_groups_set_updated_at on public.comment_bank_groups;
create trigger comment_bank_groups_set_updated_at
  before update on public.comment_bank_groups
  for each row execute function public.set_updated_at();

alter table public.comment_bank_items
  add column if not exists group_id uuid references public.comment_bank_groups (id) on delete set null;

create index if not exists comment_bank_items_group_idx
  on public.comment_bank_items (group_id)
  where group_id is not null;

-- Assignment ↔ Phase 7 comment_banks link with link/copy mode
create table if not exists public.assignment_comment_bank_imports (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.assignment_templates (id) on delete cascade,
  source_bank_id uuid not null references public.comment_banks (id) on delete restrict,
  import_mode text not null default 'link'
    check (import_mode in ('link', 'copy')),
  copied_bank_id uuid references public.comment_banks (id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, source_bank_id, import_mode)
);

create index if not exists assignment_comment_bank_imports_template_idx
  on public.assignment_comment_bank_imports (template_id, sort_order);

drop trigger if exists assignment_comment_bank_imports_set_updated_at
  on public.assignment_comment_bank_imports;
create trigger assignment_comment_bank_imports_set_updated_at
  before update on public.assignment_comment_bank_imports
  for each row execute function public.set_updated_at();

-- Optional per-group / per-comment disable for an assignment without mutating source
create table if not exists public.assignment_comment_bank_item_overrides (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.assignment_templates (id) on delete cascade,
  source_item_id uuid not null references public.comment_bank_items (id) on delete cascade,
  enabled boolean not null default true,
  personalised_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, source_item_id)
);

-- Annotation provenance for dragged bank comments
alter table public.submission_annotations
  add column if not exists source_comment_item_id uuid
    references public.comment_bank_items (id) on delete set null;

create index if not exists submission_annotations_source_comment_idx
  on public.submission_annotations (source_comment_item_id)
  where source_comment_item_id is not null;

-- Students see all non-deleted marking annotations after feedback release.
-- Teacher-only notes live on question_marks.teacher_only_note, not annotations.
drop policy if exists submission_annotations_student_read on public.submission_annotations;
create policy submission_annotations_student_read on public.submission_annotations
  for select to authenticated
  using (
    public.is_student()
    and is_deleted = false
    and visibility <> 'teacher_only'
    and exists (
      select 1
      from public.submissions s
      join public.feedback f on f.submission_id = s.id
      where s.id = submission_annotations.submission_id
        and s.student_id = auth.uid()
        and f.status = 'released'
    )
  );

-- RLS for new tables
alter table public.comment_bank_groups enable row level security;
alter table public.assignment_comment_bank_imports enable row level security;
alter table public.assignment_comment_bank_item_overrides enable row level security;

drop policy if exists comment_bank_groups_admin on public.comment_bank_groups;
create policy comment_bank_groups_admin on public.comment_bank_groups
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists comment_bank_groups_select on public.comment_bank_groups;
create policy comment_bank_groups_select on public.comment_bank_groups
  for select to authenticated
  using (true);

drop policy if exists comment_bank_groups_teacher_write on public.comment_bank_groups;
create policy comment_bank_groups_teacher_write on public.comment_bank_groups
  for all to authenticated
  using (
    public.is_teacher()
    and exists (
      select 1 from public.comment_banks b
      where b.id = bank_id
        and (
          b.scope in ('school', 'department')
          or b.owner_id = auth.uid()
          or (b.scope = 'class' and public.teacher_in_class(b.class_id))
          or (b.scope = 'assignment' and b.template_id is not null)
        )
    )
  )
  with check (
    public.is_teacher()
    and exists (
      select 1 from public.comment_banks b
      where b.id = bank_id
        and (
          public.is_admin()
          or b.owner_id = auth.uid()
          or b.scope in ('school', 'department')
          or (b.scope = 'class' and public.teacher_in_class(b.class_id))
          or (b.scope = 'assignment' and b.template_id is not null)
        )
    )
  );

drop policy if exists assignment_comment_bank_imports_admin on public.assignment_comment_bank_imports;
create policy assignment_comment_bank_imports_admin on public.assignment_comment_bank_imports
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists assignment_comment_bank_imports_teacher on public.assignment_comment_bank_imports;
create policy assignment_comment_bank_imports_teacher on public.assignment_comment_bank_imports
  for all to authenticated
  using (
    public.is_teacher()
    and exists (
      select 1
      from public.assignment_templates t
      join public.assignments a on a.template_id = t.id
      where t.id = template_id
        and public.teacher_in_class(a.class_id)
    )
  )
  with check (
    public.is_teacher()
    and exists (
      select 1
      from public.assignment_templates t
      join public.assignments a on a.template_id = t.id
      where t.id = template_id
        and public.teacher_in_class(a.class_id)
    )
  );

drop policy if exists assignment_comment_bank_item_overrides_admin
  on public.assignment_comment_bank_item_overrides;
create policy assignment_comment_bank_item_overrides_admin
  on public.assignment_comment_bank_item_overrides
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists assignment_comment_bank_item_overrides_teacher
  on public.assignment_comment_bank_item_overrides;
create policy assignment_comment_bank_item_overrides_teacher
  on public.assignment_comment_bank_item_overrides
  for all to authenticated
  using (
    public.is_teacher()
    and exists (
      select 1
      from public.assignment_templates t
      join public.assignments a on a.template_id = t.id
      where t.id = template_id
        and public.teacher_in_class(a.class_id)
    )
  )
  with check (
    public.is_teacher()
    and exists (
      select 1
      from public.assignment_templates t
      join public.assignments a on a.template_id = t.id
      where t.id = template_id
        and public.teacher_in_class(a.class_id)
    )
  );

grant select, insert, update, delete on public.comment_bank_groups to authenticated;
grant select, insert, update, delete on public.assignment_comment_bank_imports to authenticated;
grant select, insert, update, delete on public.assignment_comment_bank_item_overrides to authenticated;

notify pgrst, 'reload schema';
