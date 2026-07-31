-- Phase 5: structured homework builder (sections, blocks, questions, responses).
-- Safe for existing databases. Does not recreate core tables/enums.
-- Structure is stored per assignment_template so all class deployments share content.

do $$ begin
  create type public.assignment_block_type as enum (
    'heading',
    'subheading',
    'instruction',
    'rich_text',
    'numbered_question',
    'short_text',
    'extended_writing',
    'numeric',
    'multiple_choice',
    'tick_box',
    'teacher_review',
    'file_upload',
    'image',
    'downloadable_resource',
    'table',
    'vocabulary_table',
    'mark_scheme',
    'page_break'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.assignment_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.assignment_templates (id) on delete cascade,
  parent_section_id uuid references public.assignment_sections (id) on delete cascade,
  title text not null default 'Section',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assignment_sections_template_idx
  on public.assignment_sections (template_id, sort_order);

create table if not exists public.assignment_blocks (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.assignment_sections (id) on delete cascade,
  block_type public.assignment_block_type not null,
  sort_order int not null default 0,
  content text not null default '',
  config jsonb not null default '{}'::jsonb,
  teacher_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assignment_blocks_section_idx
  on public.assignment_blocks (section_id, sort_order);

-- Assessed / answerable items linked 1:1 to a block where applicable.
create table if not exists public.assignment_questions (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null unique references public.assignment_blocks (id) on delete cascade,
  prompt text not null default '',
  max_marks numeric(6,2) check (max_marks is null or max_marks >= 0),
  required boolean not null default false,
  response_type text not null default 'short_text',
  choices jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assignment_questions_block_idx
  on public.assignment_questions (block_id);

-- Optional normalised table cell definitions (also mirrored in block.config).
create table if not exists public.assignment_table_cells (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.assignment_blocks (id) on delete cascade,
  row_index int not null check (row_index >= 0),
  col_index int not null check (col_index >= 0),
  cell_type text not null default 'student_text',
  label text,
  marks numeric(6,2),
  read_only boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  unique (block_id, row_index, col_index)
);

create index if not exists assignment_table_cells_block_idx
  on public.assignment_table_cells (block_id);

-- Queryable student answers for assessed blocks/questions.
create table if not exists public.student_responses (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  question_id uuid not null references public.assignment_questions (id) on delete cascade,
  text_value text,
  numeric_value numeric(12,4),
  boolean_value boolean,
  json_value jsonb,
  file_name text,
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, question_id)
);

create index if not exists student_responses_submission_idx
  on public.student_responses (submission_id);
create index if not exists student_responses_question_idx
  on public.student_responses (question_id);

create table if not exists public.response_cells (
  id uuid primary key default gen_random_uuid(),
  student_response_id uuid not null references public.student_responses (id) on delete cascade,
  row_index int not null check (row_index >= 0),
  col_index int not null check (col_index >= 0),
  text_value text,
  numeric_value numeric(12,4),
  boolean_value boolean,
  unique (student_response_id, row_index, col_index)
);

create index if not exists response_cells_response_idx
  on public.response_cells (student_response_id);

drop trigger if exists assignment_sections_set_updated_at on public.assignment_sections;
create trigger assignment_sections_set_updated_at
  before update on public.assignment_sections
  for each row execute function public.set_updated_at();

drop trigger if exists assignment_blocks_set_updated_at on public.assignment_blocks;
create trigger assignment_blocks_set_updated_at
  before update on public.assignment_blocks
  for each row execute function public.set_updated_at();

drop trigger if exists assignment_questions_set_updated_at on public.assignment_questions;
create trigger assignment_questions_set_updated_at
  before update on public.assignment_questions
  for each row execute function public.set_updated_at();

drop trigger if exists student_responses_set_updated_at on public.student_responses;
create trigger student_responses_set_updated_at
  before update on public.student_responses
  for each row execute function public.set_updated_at();

-- Seed a default section+instruction block for templates that have none yet.
insert into public.assignment_sections (template_id, title, sort_order)
select t.id, 'Main section', 0
from public.assignment_templates t
where not exists (
  select 1 from public.assignment_sections s where s.template_id = t.id
);

insert into public.assignment_blocks (section_id, block_type, sort_order, content, teacher_only)
select s.id, 'instruction'::public.assignment_block_type, 0, coalesce(t.instructions, ''), false
from public.assignment_sections s
join public.assignment_templates t on t.id = s.template_id
where s.title = 'Main section'
  and s.sort_order = 0
  and not exists (
    select 1 from public.assignment_blocks b where b.section_id = s.id
  );

-- ---------------------------------------------------------------------------
-- Helpers / RLS
-- ---------------------------------------------------------------------------
create or replace function public.teacher_can_edit_template(p_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from public.assignment_templates t
      where t.id = p_template_id and t.created_by = auth.uid()
    )
    or exists (
      select 1
      from public.assignments a
      where a.template_id = p_template_id
        and public.teacher_can_create_assignments(a.class_id)
    );
$$;

create or replace function public.teacher_can_view_template(p_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from public.assignment_templates t
      where t.id = p_template_id and t.created_by = auth.uid()
    )
    or exists (
      select 1 from public.assignments a
      where a.template_id = p_template_id
        and public.teacher_in_class(a.class_id)
    );
$$;

create or replace function public.student_can_view_template(p_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assignments a
    where a.template_id = p_template_id
      and a.status = 'published'
      and public.student_in_class(a.class_id)
  );
$$;

alter table public.assignment_sections enable row level security;
alter table public.assignment_blocks enable row level security;
alter table public.assignment_questions enable row level security;
alter table public.assignment_table_cells enable row level security;
alter table public.student_responses enable row level security;
alter table public.response_cells enable row level security;

-- Sections
drop policy if exists assignment_sections_select on public.assignment_sections;
create policy assignment_sections_select on public.assignment_sections
  for select to authenticated
  using (
    public.teacher_can_view_template(template_id)
    or public.student_can_view_template(template_id)
  );

drop policy if exists assignment_sections_write on public.assignment_sections;
create policy assignment_sections_write on public.assignment_sections
  for all to authenticated
  using (public.teacher_can_edit_template(template_id))
  with check (public.teacher_can_edit_template(template_id));

-- Blocks
drop policy if exists assignment_blocks_select on public.assignment_blocks;
create policy assignment_blocks_select on public.assignment_blocks
  for select to authenticated
  using (
    exists (
      select 1 from public.assignment_sections s
      where s.id = section_id
        and (
          public.teacher_can_view_template(s.template_id)
          or (
            public.student_can_view_template(s.template_id)
            and teacher_only = false
          )
        )
    )
  );

drop policy if exists assignment_blocks_write on public.assignment_blocks;
create policy assignment_blocks_write on public.assignment_blocks
  for all to authenticated
  using (
    exists (
      select 1 from public.assignment_sections s
      where s.id = section_id
        and public.teacher_can_edit_template(s.template_id)
    )
  )
  with check (
    exists (
      select 1 from public.assignment_sections s
      where s.id = section_id
        and public.teacher_can_edit_template(s.template_id)
    )
  );

-- Questions
drop policy if exists assignment_questions_select on public.assignment_questions;
create policy assignment_questions_select on public.assignment_questions
  for select to authenticated
  using (
    exists (
      select 1
      from public.assignment_blocks b
      join public.assignment_sections s on s.id = b.section_id
      where b.id = block_id
        and (
          public.teacher_can_view_template(s.template_id)
          or public.student_can_view_template(s.template_id)
        )
    )
  );

drop policy if exists assignment_questions_write on public.assignment_questions;
create policy assignment_questions_write on public.assignment_questions
  for all to authenticated
  using (
    exists (
      select 1
      from public.assignment_blocks b
      join public.assignment_sections s on s.id = b.section_id
      where b.id = block_id
        and public.teacher_can_edit_template(s.template_id)
    )
  )
  with check (
    exists (
      select 1
      from public.assignment_blocks b
      join public.assignment_sections s on s.id = b.section_id
      where b.id = block_id
        and public.teacher_can_edit_template(s.template_id)
    )
  );

-- Table cells
drop policy if exists assignment_table_cells_select on public.assignment_table_cells;
create policy assignment_table_cells_select on public.assignment_table_cells
  for select to authenticated
  using (
    exists (
      select 1
      from public.assignment_blocks b
      join public.assignment_sections s on s.id = b.section_id
      where b.id = block_id
        and (
          public.teacher_can_view_template(s.template_id)
          or public.student_can_view_template(s.template_id)
        )
    )
  );

drop policy if exists assignment_table_cells_write on public.assignment_table_cells;
create policy assignment_table_cells_write on public.assignment_table_cells
  for all to authenticated
  using (
    exists (
      select 1
      from public.assignment_blocks b
      join public.assignment_sections s on s.id = b.section_id
      where b.id = block_id
        and public.teacher_can_edit_template(s.template_id)
    )
  )
  with check (
    exists (
      select 1
      from public.assignment_blocks b
      join public.assignment_sections s on s.id = b.section_id
      where b.id = block_id
        and public.teacher_can_edit_template(s.template_id)
    )
  );

-- Student responses
drop policy if exists student_responses_select on public.student_responses;
create policy student_responses_select on public.student_responses
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.submissions s
      where s.id = submission_id and s.student_id = auth.uid()
    )
    or exists (
      select 1
      from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      where s.id = submission_id
        and public.teacher_can_mark_submissions(a.class_id)
    )
  );

drop policy if exists student_responses_student_write on public.student_responses;
create policy student_responses_student_write on public.student_responses
  for all to authenticated
  using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and s.student_id = auth.uid()
        and s.status in ('draft', 'returned')
    )
  )
  with check (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and s.student_id = auth.uid()
        and s.status in ('draft', 'returned')
    )
  );

-- Response cells follow parent response access
drop policy if exists response_cells_select on public.response_cells;
create policy response_cells_select on public.response_cells
  for select to authenticated
  using (
    exists (
      select 1 from public.student_responses r
      where r.id = student_response_id
        and (
          public.is_admin()
          or exists (
            select 1 from public.submissions s
            where s.id = r.submission_id and s.student_id = auth.uid()
          )
          or exists (
            select 1
            from public.submissions s
            join public.assignments a on a.id = s.assignment_id
            where s.id = r.submission_id
              and public.teacher_can_mark_submissions(a.class_id)
          )
        )
    )
  );

drop policy if exists response_cells_student_write on public.response_cells;
create policy response_cells_student_write on public.response_cells
  for all to authenticated
  using (
    exists (
      select 1
      from public.student_responses r
      join public.submissions s on s.id = r.submission_id
      where r.id = student_response_id
        and s.student_id = auth.uid()
        and s.status in ('draft', 'returned')
    )
  )
  with check (
    exists (
      select 1
      from public.student_responses r
      join public.submissions s on s.id = r.submission_id
      where r.id = student_response_id
        and s.student_id = auth.uid()
        and s.status in ('draft', 'returned')
    )
  );

-- Insert one block (+ question/cells) into a section.
create or replace function public._insert_structure_block(
  p_section_id uuid,
  p_block jsonb,
  p_sort_order int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block_id uuid;
  v_is_response boolean;
  v_cell jsonb;
begin
  insert into public.assignment_blocks (
    section_id, block_type, sort_order, content, config, teacher_only
  ) values (
    p_section_id,
    (p_block ->> 'block_type')::public.assignment_block_type,
    p_sort_order,
    coalesce(p_block ->> 'content', ''),
    coalesce(p_block -> 'config', '{}'::jsonb),
    coalesce((p_block ->> 'teacher_only')::boolean, false)
      or (p_block ->> 'block_type') = 'mark_scheme'
  )
  returning id into v_block_id;

  v_is_response := (p_block ->> 'block_type') in (
    'numbered_question', 'short_text', 'extended_writing', 'numeric',
    'multiple_choice', 'tick_box', 'teacher_review', 'file_upload',
    'table', 'vocabulary_table'
  );

  if v_is_response then
    insert into public.assignment_questions (
      block_id, prompt, max_marks, required, response_type, choices, sort_order
    ) values (
      v_block_id,
      coalesce(nullif(p_block ->> 'prompt', ''), p_block ->> 'content', ''),
      nullif(p_block ->> 'max_marks', '')::numeric,
      coalesce((p_block ->> 'required')::boolean, false),
      coalesce(nullif(p_block ->> 'response_type', ''), p_block ->> 'block_type'),
      coalesce(p_block -> 'choices', '[]'::jsonb),
      p_sort_order
    );

    if (p_block ->> 'block_type') in ('table', 'vocabulary_table')
       and jsonb_typeof(p_block -> 'cells') = 'array' then
      for v_cell in select value from jsonb_array_elements(p_block -> 'cells')
      loop
        insert into public.assignment_table_cells (
          block_id, row_index, col_index, cell_type, label, marks, read_only, config
        ) values (
          v_block_id,
          coalesce((v_cell ->> 'row_index')::int, 0),
          coalesce((v_cell ->> 'col_index')::int, 0),
          coalesce(v_cell ->> 'cell_type', 'student_text'),
          v_cell ->> 'label',
          nullif(v_cell ->> 'marks', '')::numeric,
          coalesce((v_cell ->> 'read_only')::boolean, false),
          coalesce(v_cell -> 'config', '{}'::jsonb)
        );
      end loop;
    end if;
  end if;
end;
$$;

-- Atomic structure save for the builder (preserves auth.uid())
create or replace function public.save_assignment_structure(
  p_template_id uuid,
  p_structure jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section jsonb;
  v_subsection jsonb;
  v_block jsonb;
  v_section_id uuid;
  v_sub_id uuid;
  v_section_ord int := 0;
  v_sub_ord int;
  v_block_ord int;
  v_subsections jsonb;
begin
  if auth.uid() is null or not public.teacher_can_edit_template(p_template_id) then
    raise exception 'Not authorized';
  end if;

  if p_structure is null or jsonb_typeof(p_structure) <> 'array' then
    raise exception 'Structure must be a JSON array of sections';
  end if;

  delete from public.assignment_sections where template_id = p_template_id;

  for v_section in
    select value
    from jsonb_array_elements(p_structure) with ordinality as t(value, ord)
    order by ord
  loop
    insert into public.assignment_sections (template_id, title, sort_order, parent_section_id)
    values (
      p_template_id,
      coalesce(nullif(v_section ->> 'title', ''), 'Section'),
      v_section_ord,
      null
    )
    returning id into v_section_id;

    v_block_ord := 0;
    for v_block in
      select value
      from jsonb_array_elements(coalesce(v_section -> 'blocks', '[]'::jsonb))
           with ordinality as t(value, ord)
      order by ord
    loop
      perform public._insert_structure_block(v_section_id, v_block, v_block_ord);
      v_block_ord := v_block_ord + 1;
    end loop;

    v_subsections := coalesce(v_section -> 'subsections', '[]'::jsonb);
    v_sub_ord := 0;
    for v_subsection in
      select value
      from jsonb_array_elements(v_subsections) with ordinality as t(value, ord)
      order by ord
    loop
      insert into public.assignment_sections (
        template_id, parent_section_id, title, sort_order
      ) values (
        p_template_id,
        v_section_id,
        coalesce(nullif(v_subsection ->> 'title', ''), 'Subsection'),
        v_sub_ord
      )
      returning id into v_sub_id;

      v_block_ord := 0;
      for v_block in
        select value
        from jsonb_array_elements(coalesce(v_subsection -> 'blocks', '[]'::jsonb))
             with ordinality as t(value, ord)
        order by ord
      loop
        perform public._insert_structure_block(v_sub_id, v_block, v_block_ord);
        v_block_ord := v_block_ord + 1;
      end loop;

      v_sub_ord := v_sub_ord + 1;
    end loop;

    v_section_ord := v_section_ord + 1;
  end loop;
end;
$$;

revoke all on function public._insert_structure_block(uuid, jsonb, int) from public, anon;
revoke all on function public.save_assignment_structure(uuid, jsonb) from public, anon;
grant execute on function public.save_assignment_structure(uuid, jsonb) to authenticated;
