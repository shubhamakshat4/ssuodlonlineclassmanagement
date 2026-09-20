# Assumptions

Every decision the spec did not make. Format: what — why — cost to change later.

## Credentials / environment
- The `SPEC.md` handed to the build already had the Microsoft credentials and the Supabase service-role key redacted; only the Supabase URL and publishable key were present. `.env.local` therefore carries `REPLACE_ME` placeholders for those. — Nothing to move; nothing secret entered git. — Fill in `.env.local` and `supabase secrets set` when available.
- All credentials that were ever pasted into `SPEC.md` must be **rotated before go-live** (they were handled outside a secret manager). — Hygiene. — Trivial.
- The Supabase publishable key (`sb_publishable_…`) is used as `NEXT_PUBLIC_SUPABASE_ANON_KEY`. — It is the current name for the anon key. — None.

## Phase 0
- Next.js 15.5 + React 19, Tailwind v4, ESLint 9 flat config, npm. — Latest 15.x at build time; spec says 15. — Low.
- shadcn/ui components are vendored by hand in `src/components/ui` in shadcn style, without Radix dependencies. — Keeps the install deterministic and offline-friendly; shadcn is copy-in by design. — Low; `npx shadcn add` can replace any file.
- System font stack instead of `next/font/google` (Geist). — Google Fonts needs network at build time. — Trivial.
- Tests: Vitest for unit + RLS; the RLS suite runs on **embedded Postgres 17** (`embedded-postgres` npm package) with a small shim for Supabase's `auth` schema/roles (`tests/db/supabase-shim.sql`). — The build machine has no Docker, so `supabase start`/`db reset` is impossible; real Postgres with real roles is the closest faithful alternative and it also runs in CI without services. — Medium: if Docker becomes available, `supabase db reset` + the same tests can run against the real stack.
- `pg_cron`/`pg_net` scheduling migrations are guarded with `IF EXISTS (extension)` so the same migrations apply on embedded Postgres and Supabase cloud. — Portability. — None.
- CI = GitHub Actions: lint, typecheck, unit + RLS, build. Graph always mocked (`GRAPH_MODE=mock`). — Spec §14. — Low.
- Edge Functions use `verify_jwt = false` and verify callers themselves (cron functions check the service-role bearer; `recording-play` validates the user JWT with `auth.getUser`). — pg_net cron calls carry the service key, not a user JWT. — Low.
- Password policy: min 12 chars, letters + digits (`config.toml`, also enforced in the app). — Spec says a sane minimum of 12. — Trivial.

## Phase 1 — schema and RLS
- Pre-provisioning creates the **auth user first** (Admin API, `email_confirm: true`), then `profiles` and `students`. Google sign-in then *links* to that user by verified email; it never creates one (`enable_signup=false` + hook + `auth.users` trigger). — `profiles.id` is an FK to `auth.users.id` per spec, so a profile cannot exist before its auth user. — Low; the guard triggers stay valid.
- Teachers/admins are blocked from Google by a `BEFORE INSERT` trigger on `auth.identities` (Google identity may only attach to a `student` profile at the allowed domain). — Server-side, survives any client. — Low.
- "Force password change on first login" is tracked in `auth.users.app_metadata.must_change_password` (server-controlled). — Users cannot edit app_metadata; no extra table. — Low.
- `app_settings` single-row table mirrors the App env vars so triggers can read the join-window lead time and allowed domain. Env vars remain the source for Next/Edge code. — Postgres cannot read env. — Low; keep both in sync via the admin UI/migration.
- `class_sessions.sync_claimed_at` added (not in spec) so a provisioner crash mid-claim can be recovered (rows stuck in `provisioning` for > 15 min are re-queued). — Operational safety. — Trivial.
- Override side effects (`provider='custom'`, `teams_join_url=null`, `override_set_by/at`, audit row) are applied by the `BEFORE UPDATE` trigger for every caller, so the app and any admin SQL behave identically; the Graph event deletion is picked up by the provisioner from `(status='cancelled' or provider='custom') and graph_event_id is not null`. — Keeps Graph out of the request path (§7.3). — Low.
- Reschedule keeps `graph_event_id` and re-queues with `sync_status='pending'`; the provisioner PATCHes when `teams_join_url` is present, otherwise deletes and recreates. — Same join URL after reschedule, per §7.5. — Low.
- Students may read `programs`, `subjects`, `holidays` freely (catalogue data); `batches`/`batch_subjects` are scoped to their own batch. Students cannot read `teachers` (UPNs); teacher names come via `profiles`. — Least privilege without breaking the dashboard. — Low.
- Attendance trigger skips the window check when there is no JWT (`auth.uid() is null`, i.e. service role or seed). Every client path carries a JWT. — Lets the seed backfill history. — Low.
- Seeded teacher/admin passwords (`TeacherPass12345`, `AdminPass12345`) are for local/test only and documented in `seed.sql`. — E2E needs deterministic logins. — Never seed production.

## Phase 2 — auth
- Middleware loads the role from `profiles` on every request (one indexed PK lookup) rather than caching it in the JWT. — Spec wording; keeps deactivation immediate. — Low: a custom access-token hook could add a claim later.
- After a successful sign-in the callback route signs the user straight back out when there is no active profile or when a Google session lands on a non-student profile. — Friendly error instead of an opaque database error (the DB triggers already block the link). — Trivial.
- `next` redirect targets are restricted to same-origin relative paths (`safeNextPath`). — Open-redirect hygiene. — Trivial.
- Invited teachers/admins get `must_change_password=true`; clearing it needs the service-role key on the Next.js server. — app_metadata is admin-only by design. — Low.

## Phase 3 — admin CRUD
- Students are created with `auth.admin.createUser({ email_confirm: true })` and **no password**; teachers/admins with `auth.admin.inviteUserByEmail` (magic-link invite) + `must_change_password`. — Matches §6 "invite email, force password change". — Low.
- Bulk CSV import is per-row (errors reported, valid rows created, existing emails skipped) rather than all-or-nothing. — Practical for 200-row files with one typo. — Low.
- Deleting a teacher is refused while they have sessions; deactivating is the normal path. Deleting a student cascades (auth user → profile → student → attendance). — Referential safety. — Low.
- Subject codes/batch codes are upper-cased and restricted to `[A-Z0-9_-]`. — Clean joins with CSV `batch_code`. — Trivial.
- `NEXT_PUBLIC_SITE_URL` env added (invite/callback links). — Needed to build redirect URLs server-side. — Trivial.
