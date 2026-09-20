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

## Phase 2 — auth — done
- Built: Supabase client factories (`src/lib/supabase/{client,server,admin,middleware}.ts`), `src/middleware.ts`
  (JWT validated with `getUser()`, role loaded from `profiles`, gating rules in the pure module
  `src/lib/auth/routing.ts`), `requireUser()/requireRole()` server guards, `/login` (email+password, server
  action), `/login/student` (Google with `hd` hint), `/auth/callback` (code exchange + post-sign-in checks),
  `/auth/signout`, `/auth/error`, forced password change at `/account/password` (12-char policy, clears
  `app_metadata.must_change_password` via the Admin API), role layouts with a shared `AppShell`.
  `config.toml`: `enable_signup=false` (pre-provisioned users only).
- Tested: `tests/unit/auth.test.ts` (route decisions, open-redirect protection, password policy). Lint,
  typecheck, build green. DB-side guards were covered in Phase 1.
- Skipped: live Google sign-in (needs the cloud project configured — B2).

## Phase 3 — admin CRUD — done
- Built: `formAction()` helper (role check + zod + friendly DB errors + revalidate) and a reusable `ActionForm`;
  screens for programmes, batches (+ batch detail: subjects per semester, teacher assignment, roster),
  subjects, students (list/filter, create, edit, delete, **bulk CSV import** with per-row report), teachers
  (create + invite email, edit, resend invite/reset, delete guard, assignments), admin overview tiles.
  `src/lib/admin/provision.ts` creates auth user + profile atomically (rolls back on failure).
  Shared IST time helpers in `supabase/functions/_shared/time.ts` (Deno + Node), CSV parser.
- Tested: unit tests for CSV parsing and timezone maths (IST + a DST zone to prove it is not offset
  arithmetic). Lint/typecheck/build green. Admin RLS paths covered by the Phase 1 suite.
- Skipped: nothing. Live user creation needs the service-role key (B2).

## Phase 4 — timetable builder + holidays — done
- Built: `/admin/timetable` (per-batch week grid Mon–Sun, add slot, inline edit/deactivate/delete, effective
  date ranges), `/admin/holidays` (global or per-batch, unique per date). Clash detection twice: a pure
  `findClashes()` for a descriptive pre-check in the action and a `BEFORE INSERT OR UPDATE` trigger
  (`20260920000600_timetable_clash_check.sql`) that is the guarantee — same teacher or same batch, same
  weekday, overlapping times and overlapping effective ranges.
- Tested: `tests/unit/clash.test.ts` (pure logic), `tests/db/timetable.test.ts` (trigger: teacher clash,
  batch clash, back-to-back OK, disjoint date ranges OK, inactive ignored, re-check on update, holiday
  uniqueness). All suites green; lint/typecheck/build green.
- Skipped: nothing.

## Phase 5 — cron-generate-sessions — done
- Built: `supabase/functions/_shared/timetable.ts` (`expandSlots`, pure, timezone-correct), the job
  `_shared/jobs/generate-sessions.ts` (loads slots/holidays/settings, upserts with `ignoreDuplicates`,
  audits; also `completePastSessions`), Edge Function `cron-generate-sessions` (service-role bearer check),
  Deno runtime helpers, cron infrastructure migration (`invoke_edge_function` via pg_net + Vault, pg_cron
  schedule 19:30 UTC = 01:00 IST, all guarded), admin `/admin/sessions` (browse/filter, cancel, reschedule,
  add extra class, retry, **Generate sessions now** using the same job with the service-role client).
- Tested: `tests/unit/timetable.test.ts` (IST instants, zone-vs-UTC calendar day, holidays global/batch,
  effective ranges, inactive, determinism), `tests/db/generation.test.ts` (idempotent insert, seeded
  holidays skipped, generated rows visible only to the right people, cron helper inert without pg_net).
- Skipped: Edge Function not deployed/executed (no Deno locally, B2) — its logic is the shared job, which
  the admin "Generate now" action runs through the same code path.
