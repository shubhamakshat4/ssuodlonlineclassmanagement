# Build log

One entry per phase. Newest at the bottom.

## Pre-phase — credentials
- `SPEC.md` arrived with credentials already redacted; verified `.env.local` is gitignored (`git check-ignore -v .env.local`), `.env.local.example` is committed with placeholders.
- Missing at build time: `SUPABASE_SERVICE_ROLE_KEY`, all `MS_*` values. See `docs/BLOCKERS.md`.

## Phase 0 — scaffold, env, CI — done
- Built: Next.js 15 App Router scaffold, `src/lib/env.ts` typed env access, `supabase/config.toml`
  (Google provider, `before_user_created` hook, 12-char password minimum, edge function entries),
  Vitest + Playwright configs, GitHub Actions CI (lint, typecheck, test, build).
- Tested: `npm run lint`, `npm run typecheck`, `npm test` (1 smoke test), `npm run build` — all green.
  Verified embedded Postgres 17.2 boots on this machine with `citext` + `pgcrypto` (basis for the RLS suite).
- Skipped: nothing.

## Phase 1 — schema, RLS, seed — done
- Built: 5 migrations (`supabase/migrations/20260920000100…000500`): enums + `app_settings` (config the DB
  triggers need), all 14 tables from SPEC §4 with `updated_at` triggers and indexes, security-definer role
  helpers, `v_class_sessions` (security_invoker; carries `effective_join_url`, `has_override`, join-window
  fields, subject/batch/teacher names), RLS policies for every table, integrity triggers (teacher column
  restriction + override side effects + reschedule/cancel bookkeeping + audit; attendance window + enrolment),
  auth guards (`before_user_created_hook`, `auth.users` and `auth.identities` insert triggers).
- Seed: 1 admin, 3 teachers, 8 students across 3 batches, 6 subjects, 7 weekly slots, 3 holidays,
  12 sessions relative to `now()` (incl. one live per batch, one failed, one cancelled), attendance,
  3 recordings (available / expired / other batch), audit rows.
- Tested: `tests/db/schema.test.ts` (migrations + seed apply on a fresh DB, view semantics) and
  `tests/db/rls.test.ts` — 48 assertions as anon / student A / student B / on-hold student / two teachers /
  admin / service role, plus auth-guard tests. All green on embedded Postgres 17.
- Skipped: nothing. Not run against Supabase cloud (B2).
