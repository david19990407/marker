# Homework Passport

Assignment, submission, marking and feedback platform for schools.

**Stack:** Next.js · TypeScript · Tailwind CSS · Supabase (Auth, Database, Storage)

> Core platform plus Phases 1–5 are implemented: database schema, real authentication, admin portal, teacher classes/assignments/marking, student homework submission, school settings, multi-teacher classes, multi-class assignment templates with deployments, and structured homework builder with sections, blocks, and student responses.

## 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In **Authentication → Providers**, keep email enabled.
3. In **Authentication → Settings**, disable public sign-ups (“Allow new users to sign up” = off).
4. Users are invited by administrators only.

## 2. Run the database schema

### Existing live project (already has core tables)

If School Settings or multi-class assignment deploy fails with missing `school_settings` / `create_assignment_template_and_deploy`, run **only**:

1. `supabase/repair_phases_01_to_03.sql`

Do **not** re-run `schema.sql`. The repair file is idempotent, preserves data, recreates RPCs with the correct parameter names, and reloads the PostgREST schema cache.

Then, if the homework builder is in use and not yet migrated:

2. `supabase/phase_04_structured_homework_builder.sql`

### Fresh empty project

1. `supabase/schema.sql` — core tables and RLS.
2. `supabase/repair_phases_01_to_03.sql` — school settings, year groups, subjects, `class_teachers`, assignment templates + deploy RPCs.
3. `supabase/phase_04_structured_homework_builder.sql` — structured homework builder tables/RPC.

> Individual `phase_01` / `phase_02` / `phase_03` files remain in the repo but are superseded for production repair by `repair_phases_01_to_03.sql`.

## 3. Create storage buckets (if needed)

If bucket insert was skipped, create private buckets manually:

- `assignment-resources`
- `student-submissions`

Then re-run the storage policy section of `supabase/schema.sql`.

## 4. Local environment variables

```bash
cp .env.example .env.local
```

Fill in:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` key (**server only**) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally |

Never expose `SUPABASE_SERVICE_ROLE_KEY` in client code or `NEXT_PUBLIC_*` variables.

## 5. Vercel environment variables

In the Vercel project settings, add the same four variables. Set `NEXT_PUBLIC_APP_URL` to your production URL (e.g. `https://your-app.vercel.app`).

Also add the production URL to Supabase **Authentication → URL configuration** (Site URL + Redirect URLs), including:

- `https://your-app.vercel.app/auth/callback`

## 6. Create the first admin account

1. In Supabase **Authentication → Users**, add a user with email/password (or send an invite).
2. Confirm a `profiles` row exists (created by the `on_auth_user_created` trigger).
3. In the SQL Editor, promote that user:

```sql
select public.promote_user_to_admin('your.email@school.edu');
```

See also `supabase/bootstrap_admin.sql`.

## 7. Import users by CSV

As an admin, open **Users → CSV Import**, or go to `/admin/users/import`.

Exact columns:

```csv
first_name,last_name,email,role,year_group,class_name
Alex,Morgan,alex.morgan@school.edu,student,Year 11,11A English
Ms,Harper,ms.harper@school.edu,teacher,,
```

- `role` must be `admin`, `teacher`, or `student`
- `year_group` optional except recommended for students (`Year 7`–`Year 13`)
- `class_name` optional; missing classes are created when a teacher already exists
- Preview validates emails, roles and duplicates before any accounts are created
- Invites are sent with the service role on the server only

## 8. Start locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in.

## 9. Deploy to Vercel

1. Push the repository and import it into Vercel.
2. Set environment variables (step 5).
3. Deploy.
4. Confirm Auth redirect URLs in Supabase.

## Roles after login

| Role | Dashboard |
|---|---|
| Admin | `/admin/dashboard` |
| Teacher | `/teacher/dashboard` |
| Student | `/student/dashboard` |

## Scripts

```bash
npm run lint
npm run build
npm run start
```
