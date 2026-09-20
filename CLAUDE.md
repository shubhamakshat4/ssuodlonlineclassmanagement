# SSU ODL portal — repo conventions

## Stack
- Next.js 15 App Router + TypeScript + Tailwind v4, shadcn-style components vendored in `src/components/ui`.
- Supabase: Postgres + Auth + RLS. Edge Functions (Deno) in `supabase/functions/*`.
- Microsoft Graph, app-only. **Never from the browser and never from a user request path.**
  All Graph calls live in Edge Functions behind `supabase/functions/_shared/graph/` (interface + real + mock).

## Layout
- `src/app` routes: `/student/*`, `/teacher/*`, `/admin/*`, `/login`, `/auth/callback`, `/api/*`.
- `src/lib/supabase/{client,server,admin,middleware}.ts` — the only places that build Supabase clients.
- `src/lib/domain/*` — pure, unit-tested logic (join window, clash detection, CSV, URL validation).
- `supabase/functions/_shared/*` — code shared by Edge Functions and Next (import via `@shared/*`).
  Must stay runtime-neutral: relative imports with `.ts` extensions, no Node/Deno-only APIs.
- `supabase/migrations/*.sql` — schema, RLS, triggers, cron. `supabase/seed.sql` — fake data only.

## Rules
- Timezone is `Asia/Kolkata`. Store `timestamptz`; build instants from date + local time via `@shared/time.ts`.
- Effective join URL = `coalesce(join_url_override, teams_join_url)` — read it from `v_class_sessions`, never recompute.
- Security lives in the database: RLS + triggers. The client is untrusted; the anon key is public.
- Service-role key only in server code (`src/lib/supabase/admin.ts`, Edge Functions). Never `NEXT_PUBLIC_`.
- Do not add features outside SPEC.md. No notifications, chat, assignments, analytics, theming.

## Env
- Real values in `.env.local` (gitignored). Placeholders in `.env.local.example` (committed).
- Edge Function secrets are set with `supabase secrets set` — see `docs/M365_SETUP.md`.

## Running
- `npm run dev` — app. `npm run lint`, `npm run typecheck`, `npm test` (unit + RLS), `npm run test:e2e`.
- RLS tests boot an embedded Postgres 17 (`tests/db/harness.ts`), apply every migration + seed; no Docker needed.
- `supabase db reset` requires Docker; `supabase db push` applies migrations to the linked cloud project.
- `npm run graph:spike` — Phase 6 real-tenant spike. Only with test accounts. See `scripts/graph-spike.ts`.

## Process
- Phases 0→12 in order (SPEC.md §12). Progress in `docs/BUILD_LOG.md`; decisions in `docs/ASSUMPTIONS.md`;
  open items in `docs/BLOCKERS.md`. Conventional commits referencing the phase, e.g. `feat(phase-3): …`.
