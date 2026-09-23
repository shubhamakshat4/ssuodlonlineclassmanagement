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

## Phase 4 — timetable
- Clash = same weekday, overlapping `[start,end)` times, overlapping effective date ranges, and same teacher **or** same batch (via `batch_subjects.batch_id`). Back-to-back slots are fine. — Spec says "same teacher or same batch double-booked". — Low.
- Editing/deactivating a slot or adding a holiday does **not** retroactively cancel sessions already generated (admins do that under Sessions). — Avoids surprising deletions of provisioned meetings; the 21-day horizon keeps exposure small. — Medium; could add a "cancel future sessions of this slot" action.
- Deleting a slot sets `timetable_slot_id = null` on its sessions (FK `on delete set null`), which turns them into ad-hoc sessions. — Preserves history/attendance. — Low.

## Phase 5 — session generation
- Expansion is implemented once in TypeScript (`_shared/timetable.ts`) and used by both the Edge Function and the admin "Generate now" action, rather than as a SQL function. — One implementation, unit-testable, spec asks for unit tests on expansion. — Low.
- Generation starts from **today (IST)** and covers `horizon` days inclusive; sessions whose time has already passed today may be generated and are immediately marked `completed` by `completePastSessions`. — Simplicity; nightly run at 01:00 makes this moot. — Trivial.
- `status='completed'` is set automatically for scheduled sessions once `scheduled_end < now()` (run at the start of every cron job and "Generate now"). The spec never says who sets `completed`; the harvester needs it. — Required for §7.4. — Low.
- Cron → Edge Function calls read `project_url` and `service_role_key` from Supabase Vault; the migration is inert when pg_net/Vault/pg_cron are absent. — Portable migrations; no secrets in SQL. — Low; documented in the runbook.
- pg_cron runs in UTC on Supabase, so 01:00 IST is scheduled as `30 19 * * *`. — Fact of the platform. — Trivial.

## Phase 6 — Graph
- `GRAPH_MODE` (`real`|`mock`) selects the client; `real` without credentials throws instead of silently mocking. — Production must never run on the mock unnoticed. — Trivial.
- `GRAPH_RECORDING_MODE` (`auto` default | `manual`) tells the provisioner whether to request `recordAutomatically`; when the tenant rejects it at runtime the sequence retries once without it and stores the error in `sync_error` (session still `provisioned`). — Implements the §7.2 fallback without failing the class. — Low.
- Teacher `entra_user_id` is resolved from the UPN via Graph on first provisioning and cached on `teachers`. — Spec column exists for this. — Trivial.
- Step 2 (`onlineMeetings?$filter=JoinWebUrl`) is retried up to 4× with a short delay because the meeting object can lag the event by a few seconds. — Observed Graph behaviour. — Trivial.
- Windows time zone name mapping is a small table (`Asia/Kolkata` → `India Standard Time`). — Graph events want Windows zone names. — Trivial.

## Phase 7 — provisioning
- Batch size 20 per run (every 10 min → up to 120 sessions/hour, well under Graph limits at 4 req/s). — Throttle safety at term start (§15.4). — Trivial (`limit` in the request body).
- Rows stuck in `provisioning` for more than 15 minutes are re-queued (`recover_stuck_provisioning`). — Crash safety. — Trivial.
- Event deletion failures do not flip the session to `failed` (it is already cancelled/custom); they increment `sync_attempts` and keep the event id so the next run retries. — The class itself is unaffected. — Low.
- A session that was provisioned but ends up without `recordAutomatically` stays `provisioned` with an explanatory `sync_error`. — Students can still join; only recording is affected. — Low.
- "Run provisioner now" executes the job inside the Next.js server (server-side, service role) instead of calling the Edge Function over HTTP. — Works locally without deployed functions and keeps one code path. — Low; swap for `invoke_edge_function` if preferred.

## Phase 8 — student dashboard / attendance
- The join API runs with the **user's** session (anon key + JWT), never the service role, so the attendance trigger and RLS are the enforcement. — §5 "never rely on the client"; keeps the DB as the single gate. — Low.
- The attendance insert is an upsert with `ignoreDuplicates`, so a second click is a no-op (unique on session+student). — §10. — Trivial.
- The Join button opens a blank tab synchronously and navigates it after the API call. — Browsers block `window.open` after an `await`. — Trivial.
- E2E student sign-in uses an Admin-API magic link instead of Google (cannot be automated). — Same session shape for the app. — None.

## Phase 9 — teacher override
- The "Link updated" badge is derived from `join_url_override is not null` (`has_override` in the view) and therefore disappears when the teacher reverts. — Simplest truthful signal; no extra column. — Low.
- While a reverted session waits for its fresh Teams meeting (≤10 min), students see "Link not ready yet" and Join is disabled. — Honest state; alternative would be to keep the old link, but that meeting is being deleted. — Low.
- The topic is editable by the teacher (spec lists `topic` among the teacher-editable columns). — Convenience. — Trivial.

## Phase 10 — recordings
- Graph's `onlineMeetings/{id}/recordings` gives metadata but not a drive item id; the file is located by scanning the service account's `/Recordings` folder for a file created between (start − 15 min) and (end + 6 h) whose name contains the subject name. Names like "Subject — Batch-YYYYMMDD_HHMM-Meeting Recording.mp4" are the Teams default. — Practical way to get `driveId/driveItemId` for the download URL. — Medium: adjust `matchDriveItem` if the tenant names files differently (verify in the spike).
- Playback authorisation reuses the `recordings` RLS policy by querying as the caller inside the Edge Function. — One rule set (§5) for reading and playing. — Low.
- The browser reaches `recording-play` through the Next.js proxy `/api/recordings/{id}/play` because a navigation cannot carry the JWT header; the proxy relays the 302 and caches nothing. — Keeps §8 intact (no re-hosting, no stored URLs). — Low.
- Sessions still without a recording 48 h after ending simply drop out of the harvest view (no `failed` row is written). — Keeps the table honest; admins can see gaps in reports. — Low.
- Retention days come from `app_settings.recording_retention_days` (30). — Single config. — Trivial.

## Phase 11 — reports
- The report screen is a matrix (students × classes); the CSV is long format (one row per student per class) because it pivots cleanly in Excel. — Two views of the same query. — Trivial.
- Cancelled sessions are excluded from attendance reports. — No one could join them. — Trivial.
- CSV exports are written to the audit log (`attendance.exported`) with the filter used. — Personal data leaving the system should be traceable. — Trivial.

## Phase 12 — hardening
- Rate limiting is a fixed window stored in Postgres (shared across serverless instances) with an in-memory fallback when the service key is absent or the call fails; it fails open after logging. — No Redis in the stack; a limiter outage must not block classes. — Low.
- Error monitoring is vendor-free (structured logs + optional webhook) rather than a Sentry SDK. — Spec does not name a vendor; keeps dependencies small. — Trivial to add Sentry inside `reportError()`.
- CSP allows `'unsafe-inline'` scripts/styles (Next.js inline runtime + Tailwind) and media from Microsoft/SharePoint hosts for recording playback. — Practical baseline; tighten with nonces later. — Low.

## Change 21 Sep 2026 — student sign-in rule (owner decision, supersedes SPEC §6 "pre-provisioned only")
- Any Google account at `@srisriuniversity.edu.in` may sign in; a `student` profile is created automatically with **no batch**. RLS shows such a student nothing, and the dashboard says "No class mapped — contact admin". Admins map them (roll number + batch) from `/admin/students`. Other domains are still rejected by the auth hook and triggers; Google is still blocked for teachers/admins. — Requested by the owner; simpler onboarding, same security boundary (batch mapping is the gate, not account existence). — Low; reverting is one migration (re-tighten the two guard functions).
- Supabase "Allow new users to sign up" is **ON**; account-creation rules are enforced by `before_user_created_hook`: Google at the domain → allowed; Google elsewhere → refused; email/password → only when `app_metadata.provisioned_by` is present (Admin API; the public sign-up API cannot set app_metadata). The `auth.users` trigger keeps only the Google-domain rule because GoTrue inserts the row before applying admin-supplied app_metadata. Teacher invites now use `createUser` (random password, stamped app_metadata) + a "set your password" email instead of `inviteUserByEmail`. — The global switch blocked first-time Google students with "Signups not allowed". — Low.

## Change 23 Sep 2026 — meeting-first fallback (real tenant)
- When a calendar event comes back without a Teams join URL (the service mailbox has no `teamsForBusiness` provider), the sequence deletes that event, creates the meeting with `POST /onlineMeetings`, and recreates the invite carrying the link in its body. — This tenant's service mailbox behaves that way; the spec's calendar-first path alone would never produce a link there. — Low: calendar-first is still attempted on every session, so the spec path resumes by itself if Exchange is fixed.
- `runProvisionSequence` deletes a half-created event when any later step fails, so no orphan events accumulate on the service-account calendar. — Found on the first real spike run. — Trivial.
