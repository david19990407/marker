-- =============================================================================
-- Phase 8 follow-up: admin-managed comment banks and teacher assignment selections.
-- Safe / additive. Does NOT start Phase 9.
-- =============================================================================

alter table public.comment_banks
  add column if not exists year_group text,
  add column if not exists teacher_restriction_ids uuid[] not null default '{}';

create index if not exists comment_banks_year_group_idx
  on public.comment_banks (year_group)
  where year_group is not null;

create index if not exists comment_banks_teacher_restriction_ids_gin
  on public.comment_banks using gin (teacher_restriction_ids);

create table if not exists public.assignment_comment_selections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.assignment_templates (id) on delete cascade,
  bank_id uuid not null references public.comment_banks (id) on delete cascade,
  group_id uuid references public.comment_bank_groups (id) on delete set null,
  comment_item_id uuid not null references public.comment_bank_items (id) on delete cascade,
  selected boolean not null default true,
  sort_order integer not null default 0,
  selected_by uuid references public.profiles (id) on delete set null,
  selected_at timestamptz not null default now(),
  unique (template_id, comment_item_id)
);

create index if not exists assignment_comment_selections_template_idx
  on public.assignment_comment_selections (template_id, selected, sort_order);

create index if not exists assignment_comment_selections_bank_idx
  on public.assignment_comment_selections (bank_id);

create index if not exists assignment_comment_selections_group_idx
  on public.assignment_comment_selections (group_id)
  where group_id is not null;

create index if not exists assignment_comment_selections_item_idx
  on public.assignment_comment_selections (comment_item_id);

create index if not exists assignment_comment_selections_selected_by_idx
  on public.assignment_comment_selections (selected_by)
  where selected_by is not null;

alter table public.comment_banks enable row level security;
alter table public.comment_bank_items enable row level security;
alter table public.comment_bank_groups enable row level security;
alter table public.assignment_comment_selections enable row level security;

-- Source banks are managed by administrators. Teachers can read visible banks
-- and then manage their own assignment-level selections separately.
drop policy if exists comment_banks_admin on public.comment_banks;
create policy comment_banks_admin on public.comment_banks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists comment_banks_select on public.comment_banks;
create policy comment_banks_select on public.comment_banks
  for select to authenticated
  using (
    public.is_admin()
    or (
      public.is_teacher()
      and (
        cardinality(coalesce(teacher_restriction_ids, '{}'::uuid[])) = 0
        or auth.uid() = any (teacher_restriction_ids)
      )
      and (
        scope in ('school', 'department')
        or (scope = 'personal' and owner_id = auth.uid())
        or (scope = 'class' and class_id is not null and public.teacher_in_class(class_id))
        or (
          scope = 'assignment'
          and template_id is not null
          and exists (
            select 1
            from public.assignment_templates t
            where t.id = template_id
              and (
                t.created_by = auth.uid()
                or exists (
                  select 1
                  from public.assignments a
                  where a.template_id = t.id
                    and public.teacher_in_class(a.class_id)
                )
              )
          )
        )
      )
    )
  );

drop policy if exists comment_banks_teacher_write on public.comment_banks;
drop policy if exists comment_banks_teacher_department_insert on public.comment_banks;
drop policy if exists comment_banks_teacher_department_update on public.comment_banks;
drop policy if exists comment_banks_teacher_school_readwrite_admin_only on public.comment_banks;

drop policy if exists comment_bank_groups_admin on public.comment_bank_groups;
create policy comment_bank_groups_admin on public.comment_bank_groups
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists comment_bank_groups_select on public.comment_bank_groups;
create policy comment_bank_groups_select on public.comment_bank_groups
  for select to authenticated
  using (
    exists (
      select 1
      from public.comment_banks b
      where b.id = bank_id
    )
  );

drop policy if exists comment_bank_groups_teacher_write on public.comment_bank_groups;

drop policy if exists comment_bank_items_admin on public.comment_bank_items;
create policy comment_bank_items_admin on public.comment_bank_items
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists comment_bank_items_select on public.comment_bank_items;
create policy comment_bank_items_select on public.comment_bank_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.comment_banks b
      where b.id = bank_id
    )
  );

drop policy if exists comment_bank_items_write on public.comment_bank_items;

drop policy if exists assignment_comment_selections_admin
  on public.assignment_comment_selections;
create policy assignment_comment_selections_admin
  on public.assignment_comment_selections
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists assignment_comment_selections_teacher
  on public.assignment_comment_selections;
create policy assignment_comment_selections_teacher
  on public.assignment_comment_selections
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
    and exists (
      select 1
      from public.comment_bank_items i
      where i.id = comment_item_id
        and i.bank_id = assignment_comment_selections.bank_id
        and (
          assignment_comment_selections.group_id is null
          or i.group_id = assignment_comment_selections.group_id
        )
    )
  );

grant select, insert, update, delete on public.comment_banks to authenticated;
grant select, insert, update, delete on public.comment_bank_groups to authenticated;
grant select, insert, update, delete on public.comment_bank_items to authenticated;
grant select, insert, update, delete on public.assignment_comment_selections to authenticated;

notify pgrst, 'reload schema';
