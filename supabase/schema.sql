-- LitCoach AI — Supabase schema (PostgreSQL)
-- Apply in the Supabase SQL editor. Designed for ~500 students initially, scalable with indexes.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

create type public.user_role as enum ('student', 'teacher');
create type public.resource_category as enum (
  'Revision Guides',
  'Knowledge Organisers',
  'Model Answers',
  'Worksheets',
  'Videos',
  'Past Papers',
  'Mark Schemes',
  'Flashcards'
);
create type public.essay_status as enum ('pending', 'ai_marked', 'teacher_reviewed');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.user_role not null default 'student',
  year_group text,
  exam_board text,
  avatar_initials text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  topic text not null,
  exam_board text not null,
  year_group text not null,
  paper text not null,
  objectives text[] not null default '{}',
  slides_url text,
  worksheets text[] not null default '{}',
  videos text[] not null default '{}',
  homework text,
  ai_summary text,
  estimated_minutes int not null default 45,
  text_name text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lesson_embeddings (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category public.resource_category not null,
  topic text not null,
  exam_board text not null,
  file_type text not null,
  file_url text,
  preview_text text,
  downloads int not null default 0,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  topic text not null,
  lesson_id uuid references public.lessons (id) on delete set null,
  questions jsonb not null default '[]',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.essay_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  question text not null,
  essay_text text not null,
  status public.essay_status not null default 'pending',
  version int not null default 1,
  parent_submission_id uuid references public.essay_submissions (id),
  submitted_at timestamptz not null default now()
);

create table public.essay_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.essay_submissions (id) on delete cascade,
  estimated_mark numeric(5,2) not null,
  out_of numeric(5,2) not null default 30,
  estimated_level text not null,
  ao1 numeric(5,2) not null,
  ao2 numeric(5,2) not null,
  ao3 numeric(5,2) not null,
  ao4 numeric(5,2) not null,
  strengths text[] not null default '{}',
  weaknesses text[] not null default '{}',
  improvements text[] not null default '{}',
  next_steps text[] not null default '{}',
  teacher_override_mark numeric(5,2),
  teacher_notes text,
  created_at timestamptz not null default now()
);

create table public.progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete cascade,
  progress_percent int not null default 0 check (progress_percent between 0 and 100),
  completed boolean not null default false,
  quizzes_completed int not null default 0,
  essays_submitted int not null default 0,
  average_mark numeric(5,2),
  ao1 numeric(5,2) default 0,
  ao2 numeric(5,2) default 0,
  ao3 numeric(5,2) default 0,
  ao4 numeric(5,2) default 0,
  updated_at timestamptz not null default now(),
  unique (student_id, lesson_id)
);

create table public.student_activity (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  activity_type text not null,
  title text not null,
  description text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  sources jsonb default '[]',
  created_at timestamptz not null default now()
);

create table public.ai_settings (
  id uuid primary key default gen_random_uuid(),
  school_id text not null default 'default',
  model text not null default 'gpt-4o-mini',
  temperature numeric(3,2) not null default 0.40,
  system_prompt text not null,
  max_context_chunks int not null default 6,
  coaching_style text not null default 'socratic',
  allow_homework_completion boolean not null default false,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create index lessons_topic_idx on public.lessons (topic);
create index lessons_exam_board_idx on public.lessons (exam_board);
create index resources_category_idx on public.resources (category);
create index essay_submissions_student_idx on public.essay_submissions (student_id);
create index student_activity_student_created_idx on public.student_activity (student_id, created_at desc);
create index lesson_embeddings_lesson_idx on public.lesson_embeddings (lesson_id);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- Optional: ivfflat index once you have enough embedding rows
-- create index lesson_embeddings_embedding_idx on public.lesson_embeddings
--   using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.profiles enable row level security;
alter table public.lessons enable row level security;
alter table public.resources enable row level security;
alter table public.quizzes enable row level security;
alter table public.essay_submissions enable row level security;
alter table public.essay_feedback enable row level security;
alter table public.progress enable row level security;
alter table public.student_activity enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_settings enable row level security;

-- Example policies (tighten for production)
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select to authenticated using (true);

create policy "Users can update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

create policy "Lessons readable by authenticated users"
  on public.lessons for select to authenticated using (true);

create policy "Teachers manage lessons"
  on public.lessons for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'));

create policy "Students read own essays"
  on public.essay_submissions for select to authenticated
  using (
    student_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
  );

create policy "Students insert own essays"
  on public.essay_submissions for insert to authenticated
  with check (student_id = auth.uid());
