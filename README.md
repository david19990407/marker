# LitCoach AI

AI-powered GCSE English learning platform for students and teachers.

## Stack

- **Next.js** (App Router) + **TypeScript**
- **Tailwind CSS**
- **Supabase** (schema + client ready; MVP uses rich dummy data)
- **OpenAI API** (RAG-ready coach & essay marking with offline demo fallback)
- **Vercel**-friendly deployment

## Features

### Student
- Dashboard with progress, activity, tasks and AO tracking
- Lesson library with search, filters and progress
- Revision Hub (boards, topics, flashcards, past papers, AI weak-area tips)
- Essay marking with AO breakdown and coaching feedback (no full rewrite)
- AI Coach chat grounded in uploaded lesson content
- Catch Up packs for missed lessons
- Progress dashboard (radar, graph, achievements)
- Searchable resources library with preview

### Teacher
- Create / edit / delete lessons
- Upload materials UI (PDF, PPT, Word, video)
- Quiz builder
- Essay review with mark override
- Student analytics
- AI settings configuration

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in as **Student** or **Teacher**.

### Optional integrations

Copy `.env.example` to `.env.local` and add:

- `OPENAI_API_KEY` — live coach / essay marking
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — persist users & content

Apply the database schema from `supabase/schema.sql` in the Supabase SQL editor.

## Project structure

```
src/
  app/                 # Routes (auth, platform pages, API)
  components/          # UI, layout, charts
  lib/
    ai/                # OpenAI + RAG retrieval
    auth/              # Demo auth context (swap for Supabase Auth)
    data/              # Dummy data for a fully functional MVP
    supabase/          # Client factory
supabase/schema.sql    # Production-ready Postgres schema
```

## Design

White interface, purple accents, large rounded cards, soft shadows and responsive layouts inspired by Notion / Linear / Duolingo / Canva.

## Deploy

Deploy on Vercel. Set the environment variables above in the project settings.
