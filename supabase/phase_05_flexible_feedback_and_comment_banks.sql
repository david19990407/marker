-- =============================================================================
-- Phase 5 / Phase 7 plan: flexible assignment feedback fields + comment banks
-- Safe for live databases. Does NOT rerun full schema.sql.
--
-- Preserves existing feedback.strengths / improvements / next_steps / private_notes
-- by seeding default fields and migrating values into feedback_field_values while
-- keeping legacy columns for compatibility.
-- =============================================================================

-- ── Enums ────────────────────────────────────────────────────────────────────

do $$ begin
  create type public.feedback_field_type as enum (
    'rich_text',
    'plain_text',
    'numeric_score',
    'grade',
    'tick_box',
    'dropdown',
    'rubric',
    'comment_bank_selector',
    'teacher_only_note'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.comment_bank_scope as enum (
    'school',
    'department',
    'personal',
    'class',
    'assignment'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.comment_tone as enum (
    'positive',
    'corrective',
    'neutral'
  );
exception when duplicate_object then null;
end $$;

-- ── Assignment feedback field definitions ────────────────────────────────────

create table if not exists public.assignment_feedback_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.assignment_templates (id) on delete cascade,
  field_key text not null,
  label text not null,
  description text,
  field_type public.feedback_field_type not null default 'plain_text',
  sort_order integer not null default 0,
  is_required boolean not null default false,
  student_visible boolean not null default true,
  teacher_only boolean not null default false,
  max_length integer,
  tracks_completion boolean not null default true,
  allow_comment_bank boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_feedback_fields_key_unique unique (template_id, field_key),
  constraint assignment_feedback_fields_max_length_chk
    check (max_length is null or max_length > 0),
  constraint assignment_feedback_fields_visibility_chk
    check (not (teacher_only and student_visible))
);

create index if not exists assignment_feedback_fields_template_sort_idx
  on public.assignment_feedback_fields (template_id, sort_order);

drop trigger if exists assignment_feedback_fields_set_updated_at
  on public.assignment_feedback_fields;
create trigger assignment_feedback_fields_set_updated_at
  before update on public.assignment_feedback_fields
  for each row execute function public.set_updated_at();

-- ── Feedback field values (authoritative flexible answers) ───────────────────

create table if not exists public.feedback_field_values (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback (id) on delete cascade,
  field_id uuid not null references public.assignment_feedback_fields (id) on delete cascade,
  field_key text not null,
  text_value text,
  numeric_value numeric(10,2),
  boolean_value boolean,
  json_value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_field_values_feedback_field_unique unique (feedback_id, field_id),
  constraint feedback_field_values_feedback_key_unique unique (feedback_id, field_key)
);

create index if not exists feedback_field_values_feedback_idx
  on public.feedback_field_values (feedback_id);

create index if not exists feedback_field_values_field_idx
  on public.feedback_field_values (field_id);

drop trigger if exists feedback_field_values_set_updated_at on public.feedback_field_values;
create trigger feedback_field_values_set_updated_at
  before update on public.feedback_field_values
  for each row execute function public.set_updated_at();

-- Optional denormalised blob for quick client loads (kept in sync by app/RPC).
alter table public.feedback
  add column if not exists field_values_json jsonb not null default '{}'::jsonb;

comment on column public.feedback.field_values_json is
  'Map of field_key → value for flexible feedback; legacy columns remain authoritative for strengths/improvements/next_steps/private_notes.';

-- ── Multi-scope comment banks ────────────────────────────────────────────────

create table if not exists public.comment_banks (
  id uuid primary key default gen_random_uuid(),
  scope public.comment_bank_scope not null,
  name text not null,
  description text,
  owner_id uuid references public.profiles (id) on delete cascade,
  department_name text,
  subject text,
  class_id uuid references public.classes (id) on delete cascade,
  template_id uuid references public.assignment_templates (id) on delete cascade,
  legacy_school_bank_id uuid,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comment_banks_scope_owner_chk check (
    (scope = 'personal' and owner_id is not null)
    or (scope = 'class' and class_id is not null)
    or (scope = 'assignment' and template_id is not null)
    or (scope = 'department' and coalesce(nullif(btrim(department_name), ''), nullif(btrim(subject), '')) is not null)
    or (scope = 'school')
  )
);

create unique index if not exists comment_banks_school_name_uidx
  on public.comment_banks (lower(name))
  where scope = 'school' and is_active;

create unique index if not exists comment_banks_personal_owner_name_uidx
  on public.comment_banks (owner_id, lower(name))
  where scope = 'personal' and is_active;

create unique index if not exists comment_banks_assignment_template_uidx
  on public.comment_banks (template_id)
  where scope = 'assignment';

create index if not exists comment_banks_scope_idx on public.comment_banks (scope, is_active);
create index if not exists comment_banks_owner_idx on public.comment_banks (owner_id) where owner_id is not null;
create index if not exists comment_banks_class_idx on public.comment_banks (class_id) where class_id is not null;
create index if not exists comment_banks_template_idx on public.comment_banks (template_id) where template_id is not null;
create index if not exists comment_banks_subject_idx on public.comment_banks (subject) where subject is not null;

drop trigger if exists comment_banks_set_updated_at on public.comment_banks;
create trigger comment_banks_set_updated_at
  before update on public.comment_banks
  for each row execute function public.set_updated_at();

create table if not exists public.comment_bank_items (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.comment_banks (id) on delete cascade,
  title text not null,
  short_label text not null,
  full_text text not null,
  category text not null default '',
  tags text[] not null default '{}',
  year_group text,
  subject text,
  tone public.comment_tone not null default 'neutral',
  mark_range_min numeric(6,2),
  mark_range_max numeric(6,2),
  linked_question_id uuid,
  legacy_assignment_comment_id uuid,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comment_bank_items_bank_sort_idx
  on public.comment_bank_items (bank_id, sort_order);

create index if not exists comment_bank_items_active_idx
  on public.comment_bank_items (bank_id, is_active);

create index if not exists comment_bank_items_tags_gin
  on public.comment_bank_items using gin (tags);

create index if not exists comment_bank_items_category_idx
  on public.comment_bank_items (category);

create index if not exists comment_bank_items_tone_idx
  on public.comment_bank_items (tone);

create index if not exists comment_bank_items_legacy_assignment_uidx
  on public.comment_bank_items (legacy_assignment_comment_id)
  where legacy_assignment_comment_id is not null;

drop trigger if exists comment_bank_items_set_updated_at on public.comment_bank_items;
create trigger comment_bank_items_set_updated_at
  before update on public.comment_bank_items
  for each row execute function public.set_updated_at();

create table if not exists public.teacher_comment_favourites (
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  comment_item_id uuid not null references public.comment_bank_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (teacher_id, comment_item_id)
);

create index if not exists teacher_comment_favourites_item_idx
  on public.teacher_comment_favourites (comment_item_id);

create table if not exists public.teacher_comment_recent (
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  comment_item_id uuid not null references public.comment_bank_items (id) on delete cascade,
  used_at timestamptz not null default now(),
  use_count integer not null default 1,
  primary key (teacher_id, comment_item_id)
);

create index if not exists teacher_comment_recent_teacher_used_idx
  on public.teacher_comment_recent (teacher_id, used_at desc);

-- ── Seed default feedback fields for every template ──────────────────────────

insert into public.assignment_feedback_fields (
  template_id, field_key, label, description, field_type, sort_order,
  is_required, student_visible, teacher_only, max_length, tracks_completion,
  allow_comment_bank, config
)
select
  t.id,
  v.field_key,
  v.label,
  v.description,
  v.field_type::public.feedback_field_type,
  v.sort_order,
  v.is_required,
  v.student_visible,
  v.teacher_only,
  v.max_length,
  v.tracks_completion,
  v.allow_comment_bank,
  v.config::jsonb
from public.assignment_templates t
cross join (
  values
    ('strengths', 'Strengths', 'What the student did well.', 'rich_text', 10, false, true, false, 5000, true, true, '{}'),
    ('improvements', 'Improvements', 'Areas to develop.', 'rich_text', 20, false, true, false, 5000, true, true, '{}'),
    ('next_steps', 'Next steps', 'Actions for the student.', 'rich_text', 30, false, true, false, 5000, true, true, '{}'),
    ('private_notes', 'Teacher notes', 'Private notes not shown to the student.', 'teacher_only_note', 40, false, false, true, 5000, false, false, '{}')
) as v(
  field_key, label, description, field_type, sort_order, is_required,
  student_visible, teacher_only, max_length, tracks_completion, allow_comment_bank, config
)
on conflict (template_id, field_key) do nothing;

-- Migrate existing Strengths / Improvements / Next Steps / private notes values.
insert into public.feedback_field_values (
  feedback_id, field_id, field_key, text_value
)
select
  f.id,
  aff.id,
  aff.field_key,
  case aff.field_key
    when 'strengths' then f.strengths
    when 'improvements' then f.improvements
    when 'next_steps' then f.next_steps
    when 'private_notes' then f.private_notes
  end
from public.feedback f
join public.submissions s on s.id = f.submission_id
join public.assignments a on a.id = s.assignment_id
join public.assignment_feedback_fields aff on aff.template_id = a.template_id
where a.template_id is not null
  and aff.field_key in ('strengths', 'improvements', 'next_steps', 'private_notes')
  and case aff.field_key
    when 'strengths' then f.strengths
    when 'improvements' then f.improvements
    when 'next_steps' then f.next_steps
    when 'private_notes' then f.private_notes
  end is not null
on conflict (feedback_id, field_id) do update
set text_value = excluded.text_value,
    updated_at = now();

update public.feedback f
set field_values_json = coalesce(
  (
    select jsonb_object_agg(v.field_key, to_jsonb(v.text_value))
    from public.feedback_field_values v
    where v.feedback_id = f.id
  ),
  '{}'::jsonb
);

-- ── Migrate school_default_comment_banks → comment_banks ─────────────────────

insert into public.comment_banks (
  scope, name, description, legacy_school_bank_id, is_active, sort_order
)
select
  'school'::public.comment_bank_scope,
  b.name,
  b.description,
  b.id,
  coalesce(b.is_active, true),
  coalesce(b.sort_order, 0)
from public.school_default_comment_banks b
where not exists (
  select 1
  from public.comment_banks cb
  where cb.legacy_school_bank_id = b.id
     or (cb.scope = 'school' and lower(cb.name) = lower(b.name))
);

-- Seed starter comments for the three classic school banks if empty.
insert into public.comment_bank_items (
  bank_id, title, short_label, full_text, category, tags, tone, sort_order, is_active
)
select
  cb.id,
  seed.title,
  seed.short_label,
  seed.full_text,
  seed.category,
  seed.tags,
  seed.tone::public.comment_tone,
  seed.sort_order,
  true
from public.comment_banks cb
join lateral (
  select *
  from (
    values
      ('Clear explanation', 'Clear', 'You explained your ideas clearly and used relevant evidence.', 'What went well', array['www','clarity']::text[], 'positive', 10),
      ('Strong structure', 'Structure', 'Your response was well organised with a clear beginning, middle and end.', 'What went well', array['www','structure']::text[], 'positive', 20),
      ('Develop analysis', 'Analysis', 'Develop your analysis by explaining how your evidence supports your point.', 'Even better if', array['ebi','analysis']::text[], 'corrective', 10),
      ('Use terminology', 'Terms', 'Use subject terminology more precisely to strengthen your answer.', 'Even better if', array['ebi','terminology']::text[], 'corrective', 20),
      ('Practise exam timing', 'Timing', 'Practise completing a similar question in timed conditions.', 'Next steps', array['next','practice']::text[], 'neutral', 10),
      ('Revise key quotes', 'Quotes', 'Revise two key quotations and rehearse short explanations for each.', 'Next steps', array['next','revision']::text[], 'neutral', 20)
  ) as s(title, short_label, full_text, category, tags, tone, sort_order)
) seed on true
where cb.scope = 'school'
  and (
    (lower(cb.name) like '%went well%' and seed.category = 'What went well')
    or (lower(cb.name) like '%even better%' and seed.category = 'Even better if')
    or (lower(cb.name) like '%next step%' and seed.category = 'Next steps')
  )
  and not exists (
    select 1 from public.comment_bank_items i where i.bank_id = cb.id
  );

-- Assignment-scoped banks from existing assignment_comments
insert into public.comment_banks (
  scope, name, description, template_id, is_active, sort_order
)
select distinct
  'assignment'::public.comment_bank_scope,
  'Assignment comments',
  'Comments specific to this assignment template',
  c.template_id,
  true,
  0
from public.assignment_comments c
where not exists (
  select 1
  from public.comment_banks cb
  where cb.scope = 'assignment'
    and cb.template_id = c.template_id
);

insert into public.comment_bank_items (
  bank_id, title, short_label, full_text, category, tags, tone,
  mark_range_min, mark_range_max, linked_question_id,
  legacy_assignment_comment_id, is_active, sort_order
)
select
  cb.id,
  coalesce(nullif(btrim(ac.short_label), ''), left(ac.full_comment, 40)),
  coalesce(nullif(btrim(ac.short_label), ''), 'Comment'),
  ac.full_comment,
  coalesce(ac.category, ''),
  case
    when ac.assessment_objective is not null and btrim(ac.assessment_objective) <> ''
      then array[ac.assessment_objective]
    else '{}'::text[]
  end,
  'neutral'::public.comment_tone,
  ac.mark_range_min,
  ac.mark_range_max,
  ac.linked_question_id,
  ac.id,
  coalesce(ac.is_active, true),
  coalesce(ac.sort_order, 0)
from public.assignment_comments ac
join public.comment_banks cb
  on cb.scope = 'assignment'
 and cb.template_id = ac.template_id
where not exists (
  select 1
  from public.comment_bank_items i
  where i.legacy_assignment_comment_id = ac.id
);

-- Keep school bank links usable: map old bank ids onto new comment_banks when present.
-- assignment_comment_bank_links remains pointing at school_default_comment_banks.

-- ── Helper: ensure default feedback fields ───────────────────────────────────

create or replace function public.ensure_default_feedback_fields(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.assignment_feedback_fields (
    template_id, field_key, label, description, field_type, sort_order,
    is_required, student_visible, teacher_only, max_length, tracks_completion,
    allow_comment_bank, config
  )
  values
    (p_template_id, 'strengths', 'Strengths', 'What the student did well.', 'rich_text', 10, false, true, false, 5000, true, true, '{}'),
    (p_template_id, 'improvements', 'Improvements', 'Areas to develop.', 'rich_text', 20, false, true, false, 5000, true, true, '{}'),
    (p_template_id, 'next_steps', 'Next steps', 'Actions for the student.', 'rich_text', 30, false, true, false, 5000, true, true, '{}'),
    (p_template_id, 'private_notes', 'Teacher notes', 'Private notes not shown to the student.', 'teacher_only_note', 40, false, false, true, 5000, false, false, '{}')
  on conflict (template_id, field_key) do nothing;
end;
$$;

revoke all on function public.ensure_default_feedback_fields(uuid) from public, anon;
grant execute on function public.ensure_default_feedback_fields(uuid) to authenticated;

-- Auto-seed fields when a new template is created (if trigger-friendly).
create or replace function public.trg_assignment_templates_seed_feedback_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_default_feedback_fields(new.id);
  insert into public.comment_banks (scope, name, description, template_id, is_active, sort_order)
  values (
    'assignment',
    'Assignment comments',
    'Comments specific to this assignment template',
    new.id,
    true,
    0
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists assignment_templates_seed_feedback_fields on public.assignment_templates;
create trigger assignment_templates_seed_feedback_fields
  after insert on public.assignment_templates
  for each row execute function public.trg_assignment_templates_seed_feedback_fields();

-- Ensure assignment banks for all existing templates
insert into public.comment_banks (scope, name, description, template_id, is_active, sort_order)
select
  'assignment',
  'Assignment comments',
  'Comments specific to this assignment template',
  t.id,
  true,
  0
from public.assignment_templates t
where not exists (
  select 1 from public.comment_banks cb
  where cb.scope = 'assignment' and cb.template_id = t.id
);

-- ── Save flexible feedback field values (status handled by app) ──────────────

create or replace function public.save_feedback_field_values(
  p_feedback_id uuid,
  p_values jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_field public.assignment_feedback_fields%rowtype;
  v_blob jsonb := '{}'::jsonb;
begin
  if p_feedback_id is null then
    raise exception 'feedback id required';
  end if;

  if p_values is null or jsonb_typeof(p_values) <> 'array' then
    raise exception 'values must be a JSON array';
  end if;

  for v_item in select * from jsonb_array_elements(p_values)
  loop
    select * into v_field
    from public.assignment_feedback_fields
    where id = (v_item->>'field_id')::uuid;

    if v_field.id is null then
      continue;
    end if;

    insert into public.feedback_field_values (
      feedback_id, field_id, field_key, text_value, numeric_value, boolean_value, json_value
    ) values (
      p_feedback_id,
      v_field.id,
      v_field.field_key,
      v_item->>'text_value',
      nullif(v_item->>'numeric_value', '')::numeric,
      case
        when v_item ? 'boolean_value' and jsonb_typeof(v_item->'boolean_value') = 'boolean'
          then (v_item->>'boolean_value')::boolean
        else null
      end,
      case when v_item ? 'json_value' then v_item->'json_value' else null end
    )
    on conflict (feedback_id, field_id) do update
    set
      text_value = excluded.text_value,
      numeric_value = excluded.numeric_value,
      boolean_value = excluded.boolean_value,
      json_value = excluded.json_value,
      updated_at = now();

    v_blob := v_blob || jsonb_build_object(
      v_field.field_key,
      coalesce(v_item->'json_value', to_jsonb(v_item->>'text_value'))
    );

    -- Keep legacy columns in sync for classic keys.
    if v_field.field_key = 'strengths' then
      update public.feedback set strengths = v_item->>'text_value' where id = p_feedback_id;
    elsif v_field.field_key = 'improvements' then
      update public.feedback set improvements = v_item->>'text_value' where id = p_feedback_id;
    elsif v_field.field_key = 'next_steps' then
      update public.feedback set next_steps = v_item->>'text_value' where id = p_feedback_id;
    elsif v_field.field_key = 'private_notes' then
      update public.feedback set private_notes = v_item->>'text_value' where id = p_feedback_id;
    end if;
  end loop;

  update public.feedback
  set field_values_json = coalesce(field_values_json, '{}'::jsonb) || v_blob,
      updated_at = now()
  where id = p_feedback_id;
end;
$$;

revoke all on function public.save_feedback_field_values(uuid, jsonb) from public, anon;
grant execute on function public.save_feedback_field_values(uuid, jsonb) to authenticated;

-- Record recent comment use
create or replace function public.record_comment_bank_use(
  p_comment_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.teacher_comment_recent (teacher_id, comment_item_id, used_at, use_count)
  values (v_uid, p_comment_item_id, now(), 1)
  on conflict (teacher_id, comment_item_id) do update
  set used_at = now(),
      use_count = public.teacher_comment_recent.use_count + 1;
end;
$$;

revoke all on function public.record_comment_bank_use(uuid) from public, anon;
grant execute on function public.record_comment_bank_use(uuid) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.assignment_feedback_fields enable row level security;
alter table public.feedback_field_values enable row level security;
alter table public.comment_banks enable row level security;
alter table public.comment_bank_items enable row level security;
alter table public.teacher_comment_favourites enable row level security;
alter table public.teacher_comment_recent enable row level security;

-- Feedback fields: teachers who own/edit template; students read student_visible via released feedback path is values-only
drop policy if exists assignment_feedback_fields_admin on public.assignment_feedback_fields;
create policy assignment_feedback_fields_admin on public.assignment_feedback_fields
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists assignment_feedback_fields_teacher on public.assignment_feedback_fields;
create policy assignment_feedback_fields_teacher on public.assignment_feedback_fields
  for all to authenticated
  using (
    public.is_teacher()
    and exists (
      select 1
      from public.assignment_templates t
      where t.id = template_id
        and (
          t.created_by = auth.uid()
          or exists (
            select 1 from public.assignments a
            where a.template_id = t.id
              and public.teacher_in_class(a.class_id)
          )
        )
    )
  )
  with check (
    public.is_teacher()
    and exists (
      select 1
      from public.assignment_templates t
      where t.id = template_id
        and (
          t.created_by = auth.uid()
          or exists (
            select 1 from public.assignments a
            where a.template_id = t.id
              and public.teacher_in_class(a.class_id)
          )
        )
    )
  );

drop policy if exists assignment_feedback_fields_student_read on public.assignment_feedback_fields;
create policy assignment_feedback_fields_student_read on public.assignment_feedback_fields
  for select to authenticated
  using (
    public.is_student()
    and student_visible = true
    and exists (
      select 1
      from public.assignments a
      join public.class_members cm on cm.class_id = a.class_id
      where a.template_id = assignment_feedback_fields.template_id
        and cm.student_id = auth.uid()
    )
  );

-- Field values follow parent feedback RLS semantics
drop policy if exists feedback_field_values_admin on public.feedback_field_values;
create policy feedback_field_values_admin on public.feedback_field_values
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists feedback_field_values_teacher on public.feedback_field_values;
create policy feedback_field_values_teacher on public.feedback_field_values
  for all to authenticated
  using (
    public.is_teacher()
    and exists (
      select 1
      from public.feedback f
      join public.submissions s on s.id = f.submission_id
      join public.assignments a on a.id = s.assignment_id
      where f.id = feedback_id
        and public.teacher_can_mark_submissions(a.class_id)
    )
  )
  with check (
    public.is_teacher()
    and exists (
      select 1
      from public.feedback f
      join public.submissions s on s.id = f.submission_id
      join public.assignments a on a.id = s.assignment_id
      where f.id = feedback_id
        and public.teacher_can_mark_submissions(a.class_id)
    )
  );

drop policy if exists feedback_field_values_student_read on public.feedback_field_values;
create policy feedback_field_values_student_read on public.feedback_field_values
  for select to authenticated
  using (
    public.is_student()
    and exists (
      select 1
      from public.feedback f
      join public.submissions s on s.id = f.submission_id
      join public.assignment_feedback_fields aff on aff.id = feedback_field_values.field_id
      where f.id = feedback_id
        and s.student_id = auth.uid()
        and f.status = 'released'
        and aff.student_visible = true
        and aff.teacher_only = false
    )
  );

-- Comment banks
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
        scope = 'school'
        or (scope = 'personal' and owner_id = auth.uid())
        or (scope = 'department')
        or (scope = 'class' and class_id is not null and public.teacher_in_class(class_id))
        or (
          scope = 'assignment'
          and template_id is not null
          and exists (
            select 1 from public.assignment_templates t
            where t.id = template_id
              and (
                t.created_by = auth.uid()
                or exists (
                  select 1 from public.assignments a
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
create policy comment_banks_teacher_write on public.comment_banks
  for all to authenticated
  using (
    public.is_teacher()
    and (
      (scope = 'personal' and owner_id = auth.uid())
      or (scope = 'class' and class_id is not null and public.teacher_in_class(class_id))
      or (
        scope = 'assignment'
        and template_id is not null
        and exists (
          select 1 from public.assignment_templates t
          where t.id = template_id and t.created_by = auth.uid()
        )
      )
      or (scope in ('school', 'department') and public.is_admin())
    )
  )
  with check (
    public.is_teacher()
    and (
      (scope = 'personal' and owner_id = auth.uid())
      or (scope = 'class' and class_id is not null and public.teacher_in_class(class_id))
      or (
        scope = 'assignment'
        and template_id is not null
        and exists (
          select 1 from public.assignment_templates t
          where t.id = template_id and t.created_by = auth.uid()
        )
      )
      or (scope in ('school', 'department') and public.is_admin())
    )
  );

-- Teachers may create department banks for subjects they teach
drop policy if exists comment_banks_teacher_department_insert on public.comment_banks;
create policy comment_banks_teacher_department_insert on public.comment_banks
  for insert to authenticated
  with check (
    public.is_teacher()
    and scope = 'department'
    and owner_id = auth.uid()
  );

drop policy if exists comment_banks_teacher_department_update on public.comment_banks;
create policy comment_banks_teacher_department_update on public.comment_banks
  for update to authenticated
  using (
    public.is_teacher()
    and scope = 'department'
    and owner_id = auth.uid()
  )
  with check (
    public.is_teacher()
    and scope = 'department'
    and owner_id = auth.uid()
  );

drop policy if exists comment_banks_teacher_school_readwrite_admin_only on public.comment_banks;
-- school banks: teachers read via select policy; write via admin policy

-- Comment items inherit bank visibility
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
      select 1 from public.comment_banks b
      where b.id = bank_id
    )
  );

drop policy if exists comment_bank_items_write on public.comment_bank_items;
create policy comment_bank_items_write on public.comment_bank_items
  for all to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.comment_banks b
      where b.id = bank_id
        and (
          (b.scope = 'personal' and b.owner_id = auth.uid())
          or (b.scope = 'class' and b.class_id is not null and public.teacher_in_class(b.class_id))
          or (b.scope = 'department' and b.owner_id = auth.uid())
          or (
            b.scope = 'assignment'
            and b.template_id is not null
            and exists (
              select 1 from public.assignment_templates t
              where t.id = b.template_id and t.created_by = auth.uid()
            )
          )
          or (b.scope = 'school' and public.is_admin())
        )
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.comment_banks b
      where b.id = bank_id
        and (
          (b.scope = 'personal' and b.owner_id = auth.uid())
          or (b.scope = 'class' and b.class_id is not null and public.teacher_in_class(b.class_id))
          or (b.scope = 'department' and b.owner_id = auth.uid())
          or (
            b.scope = 'assignment'
            and b.template_id is not null
            and exists (
              select 1 from public.assignment_templates t
              where t.id = b.template_id and t.created_by = auth.uid()
            )
          )
          or (b.scope = 'school' and public.is_admin())
        )
    )
  );

drop policy if exists teacher_comment_favourites_own on public.teacher_comment_favourites;
create policy teacher_comment_favourites_own on public.teacher_comment_favourites
  for all to authenticated
  using (teacher_id = auth.uid() or public.is_admin())
  with check (teacher_id = auth.uid() or public.is_admin());

drop policy if exists teacher_comment_recent_own on public.teacher_comment_recent;
create policy teacher_comment_recent_own on public.teacher_comment_recent
  for all to authenticated
  using (teacher_id = auth.uid() or public.is_admin())
  with check (teacher_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.assignment_feedback_fields to authenticated;
grant select, insert, update, delete on public.feedback_field_values to authenticated;
grant select, insert, update, delete on public.comment_banks to authenticated;
grant select, insert, update, delete on public.comment_bank_items to authenticated;
grant select, insert, update, delete on public.teacher_comment_favourites to authenticated;
grant select, insert, update, delete on public.teacher_comment_recent to authenticated;

notify pgrst, 'reload schema';
