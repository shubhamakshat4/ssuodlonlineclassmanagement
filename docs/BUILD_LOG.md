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

## Phase 6 — Graph spike — partial (mock only, blocked by B1)
- Built: Graph client interface + real implementation (token cache, throttle, backoff, logging) + mock with
  failure modes (403 access policy, recordAutomatically rejected, 429, network); `runProvisionSequence`
  (§7.2 steps 1→3 with automatic degrade when `recordAutomatically` is rejected); `scripts/graph-spike.ts`
  (safe: `[TEST]` subject, service account as stand-in teacher unless `SPIKE_TEACHER_UPN`, cleanup in
  `finally`, report appended to `docs/GRAPH_SPIKE_LOG.md`).
- Tested: `tests/unit/graph.test.ts` — token caching, request body per spec, Retry-After/429 handling,
  give-up after max attempts, no retry on 403, throttling, 404-on-delete tolerance, download URL, mock
  sequence incl. idempotent transactionId and the recordAutomatically fallback. Spike executed against
  the mock: all steps green, verdict "MOCK ONLY".
- Skipped: the real-tenant run (no credentials). Proceeding to Phase 7 per the operating rules with both
  the primary and fallback recording paths implemented.

## Phase 7 — cron-provision-meetings, retry/backoff, sync health — done
- Built: migration `…000800_provisioning.sql` (`claim_pending_sessions` with `FOR UPDATE SKIP LOCKED`,
  `recover_stuck_provisioning`, `v_sessions_needing_event_deletion`, cron every 10 min); job
  `_shared/jobs/provision-meetings.ts` (housekeeping → deletions for cancelled/custom → claim → per
  session create / patch (reschedule) / recreate (revert after override); attempts + `failed` after 5;
  teacher object-id caching; audit rows for every outcome); `graphAuditHook` logs every Graph call to
  `audit_log`; Edge Function `cron-provision-meetings` (honours `GRAPH_RECORDING_MODE`); admin
  `/admin/sync-health` (counts, "starts in 30 min with no meeting" warning, failed list with verbatim
  Graph error + Retry, Retry all, last runs, recent Graph calls, **Run provisioner now** in-process on
  the Next server with explicit `GRAPH_MODE` required).
- Tested: `tests/unit/provision.test.ts` — full job against the mock Graph + an in-memory fake of the
  supabase-js builder: happy path (IST times, options, ids stored, teacher id cached), failure counting to
  `failed`, patch on reschedule, delete for cancelled/custom, recreate after revert, recordAutomatically
  degrade + manual mode. `tests/db/provisioning.test.ts` — claim semantics, SKIP LOCKED with two
  connections, stuck recovery, privileges, deletion view.
- Skipped: nothing (cloud deployment pending B2).

## Phase 8 — student dashboard, Join Now, attendance — done
- Built: `/student` (today's classes with Join Now + countdown, next 7 days grouped by IST day,
  "Link updated" / "Cancelled" / "Not on Teams — no recording" badges, enrolment warning, explicit
  "joined from the portal ≠ presence" copy), `/student/profile` (read-only), `POST /api/sessions/{id}/join`
  (runs as the caller → RLS + attendance trigger; upsert with ignoreDuplicates; stores IP + UA; returns the
  effective URL; teachers/admins get the URL without an attendance row), `JoinButton` (opens the tab
  before the fetch to dodge popup blockers), shared rules in `_shared/sessions.ts` (join window, effective
  URL, countdown, recording expiry, override URL validation).
- Tested: `tests/unit/sessions.test.ts` (join window boundaries + lead config, precedence, expiry,
  validation). Attendance trigger/RLS behaviour was covered in Phase 1. Playwright `e2e/student-join.spec.ts`
  written (magic-link sign-in as the Google stand-in) — not executed (B2).
- Skipped: nothing.

## Phase 9 — teacher dashboard, timetable, join, link override — done
- Built: `/teacher` (today with Join + "Edit link / roster"), `/teacher/upcoming` (3 weeks grouped by day),
  `/teacher/timetable` (weekly grid of own slots), `/teacher/sessions/[id]` (effective link, override form
  with live https validation + host warning + the mandatory "Recording will not be available" warning,
  Revert to auto-generated Teams link, topic, roster with who clicked Join). Server actions
  `setOverride`/`clearOverride`/`updateTopic` run as the caller so the RLS policy + trigger enforce
  ownership, the time limit, the https rule, `provider='custom'`, `teams_join_url=null`, audit rows and
  the re-queue on revert. Admins get the same override/revert controls inline on `/admin/sessions`.
- Tested: DB rules covered in Phase 1 (`rls.test.ts`: override side effects, spoofing, colleague, ended
  class, non-https, revert re-queue, admin actor). Unit: `validateOverrideUrl`. Playwright
  `e2e/teacher-override.spec.ts` written (teacher sets link → DB side effects + audit → student sees
  "Link updated" and joins via the new URL → revert re-queues) — not executed (B2).
- Skipped: nothing.

## Phase 10 — recordings: harvest, playback, student tab, expiry — done
- Built: migration `…000900_recordings_jobs.sql` (`v_sessions_awaiting_recording`, `expire_recordings()`,
  hourly + daily cron); job `_shared/jobs/harvest-recordings.ts` (primary: meeting recordings API +
  OneDrive folder match by window/subject; fallback: folder-only after 6 h, when no meeting id, or in
  `GRAPH_RECORDING_MODE=manual`; `expires_at = recorded_at + retention`), Edge Functions
  `cron-harvest-recordings`, `cron-expire-recordings`, `recording-play` (JWT → authorisation by reading
  `recordings` **as the caller** so RLS is the single rule set → Graph downloadUrl → 302, playback audited);
  Next proxy `/api/recordings/{id}/play` forwards the user's token and relays the 302; student
  `/student/recordings` (days remaining) and `/student/recordings/[id]` inline `<video>` player.
- Tested: `tests/unit/harvest.test.ts` (folder matching, primary path, 6 h fallback, manual mode, per-session
  errors), `tests/db/recordings.test.ts` (awaiting view semantics, visibility after harvest, expiry flip
  + privileges, cross-batch isolation). All 16 test files green; lint/typecheck/build green.
- Skipped: real OneDrive/Graph behaviour (B1); Edge Functions not deployed (B2).

## Phase 11 — attendance reports + CSV, audit log viewer — done
- Built: `/admin/attendance` (batch, optional subject, date range → student × class matrix with per-student
  and per-class totals; hover shows join time + IP; explicit "portal join ≠ presence" copy),
  `/admin/attendance/export` (long-format CSV with BOM for Excel, audited), `src/lib/queries/attendance.ts`
  shared by both; `/admin/audit-log` (filters by action prefix / entity / entity id / actor, expandable
  JSON payloads, keyset "older entries" paging, actor names resolved).
- Tested: CSV serialisation unit-tested in Phase 3; report queries run under admin RLS (covered by the
  RLS suite); lint/typecheck/build green.
- Skipped: nothing.

## Phase 12 — hardening — done
- Built: DB-backed fixed-window rate limiter (`rate_limit_hit`, service-only, daily cleanup) with an
  in-process fallback (`src/lib/rate-limit.ts`) applied to join (30/min/user), password login
  (20/15 min/IP, 8/15 min/email) and playback (60/min/user); security headers + CSP in `next.config.ts`;
  error monitoring (`src/lib/monitoring.ts` structured logs + optional webhook, `instrumentation.ts`
  `onRequestError`, `app/error.tsx`); privilege tightening on job-only views/tables; extra RLS suite
  (`tests/db/hardening.test.ts`: limiter, job-only functions/views, no self-escalation, deactivation,
  audit actor forgery); `docs/RUNBOOK.md`, `docs/TEST_REPORT.md`, `docs/MANUAL_VERIFICATION.md`, README.
- Tested: 142 tests / 17 files green; lint, typecheck, build green.
- Skipped: nothing in scope. Cloud deployment + real-tenant checks remain for a human (B1, B2).

## Post-build — cloud deployment of the schema + demo data (20 Sep 2026)
- Applied all migrations to the live project with a new runner (`scripts/db-migrate.ts`, `npm run db:migrate`;
  the direct DB host is IPv6-only from this machine, so it uses the IPv4 session pooler). Cron + pg_net live.
- Demo data: `supabase/demo/demo.sql` + `scripts/demo-seed.ts` (`npm run demo:seed`): base seed, demo owner
  as a Google-sign-in student, 8 more students, 4 more slots, 21 days of generated sessions with editable
  placeholder Teams links; `npm run demo:reset-links` for go-live. One failed-sync example kept.
- Verified against the real stack: `npm run smoke:cloud` 15/15; Playwright `e2e/demo-walkthrough.spec.ts`
  3/3 (admin screens, teacher override/revert, role bouncing) on `next start` against the cloud DB.
- Fixed while verifying: the post-revert confirmation vanished with the form (now a persistent state-derived
  note on the teacher session page); scripts now load `.env.local`.
- Wrote `docs/IT_REQUEST_EMAIL.md` (step-by-step request for Microsoft 365 + Google) and `docs/DEMO.md`.

## Post-build 2 — Edge Functions, cron, auth config live (20 Sep 2026)
- CLI linked; migration state matches; 5 Edge Functions deployed; `CRON_SECRET` + Vault (`project_url`, `cron_secret`);
  new migration `…001100_cron_secret.sql` (`invoke_edge_function` prefers `cron_secret`); runtime bearer check
  accepts CRON_SECRET / injected service key / project secret keys (the runtime injects new-style `sb_secret_` keys,
  not the legacy JWT). Verified: each function 200 with the secret, 401 without; pg_cron → pg_net → function 200.
- Auth config via Management API: sign-ups off, hook on, password ≥12 with letters+digits, redirect allow-list.
- Live E2E: student-join 3/3 (magic-link sign-in, Join → attendance row, duplicate click, window closed,
  other-batch isolation), teacher-override 2/2, demo walkthrough 3/3. Fixture fixes only (IST-midnight edge, popup waits).

## Change — open student sign-in with admin mapping (21 Sep 2026)
- Migration `…001200_open_student_signin.sql`: hook + `auth.users` guard now reject only wrong-domain Google
  users; new AFTER INSERT trigger creates the student profile; identity guard keeps Google off teacher/admin
  accounts; `v_unmapped_students` view. App: "No class mapped — contact admin" on `/student`, admin
  "Signed in but not mapped" box with *Map to batch*, copy updates. Tests updated (143 green). Applied to the
  cloud project and verified through the live app (unmapped → mapped). `docs/GOOGLE_SSO_SETUP.md` written.
- Fix (21 Sep): first-time Google students were refused with "Signups not allowed for this instance" because
  the global sign-up switch runs before the hook. Sign-ups are now ON; migrations 001300/001400 move the rule into
  `before_user_created_hook` (Google@domain yes, other domains no, email/password only via Admin API stamp).
  Verified live: public `signUp` refused with the ODL-office message, admin `createUser` OK, unmapped Google
  student sees "No classes are assigned to you yet — contact the ODL department".

## UI pass (21 Sep 2026)
- One design system for all roles: warm cream canvas, ink text, saffron primary, teal "live" accent
  (`globals.css` tokens); refined primitives (inputs, selects, cards, badges, alerts with icons, tables,
  page headers with eyebrows, empty states, stat tiles); app shell with brand mark, role-aware subtitle,
  active navigation, avatar chip; shared `AuthFrame` for landing/login/error/password; `SessionCard` with
  time column and live-now treatment; `DayGroup` timeline for upcoming lists; admin overview with stat
  tiles, today's classes and quick actions; recordings as cards. No functional changes.
- Verified: screenshots of landing, logins, student home (live class), recordings, teacher today/upcoming,
  admin overview/students/sync; all 8 Playwright journeys pass against the restyled app; lint/typecheck OK.

## CSV import for every admin entity (21 Sep 2026)
- `src/lib/admin/csv-specs.ts` (pure specs: columns, zod validation, sample rows, templates) +
  `csv-import.ts` (row-by-row writers: programmes, batches, subjects, batch subjects, teachers, teacher
  assignments, timetable slots, holidays, students; update/skip semantics; per-line error report).
  One server action (`importCsv`) with file upload or paste; template download route
  `/admin/import/template/{entity}`; `CsvImportCard` on every admin page (collapsed) and `/admin/import`
  (all steps in order). Old students-only import replaced. `docs/CSV_IMPORT.md` generated from the specs.
- Tested: `tests/unit/csv-specs.test.ts` (templates round-trip and validate; missing columns; line
  numbers; normalisation; cross-field rules; booleans) — 150 tests green. Live browser run on the cloud
  project: chained import of all entities with a bad code, unknown teacher, duplicate offering and a
  timetable clash — each reported by line; test rows removed afterwards.

## Phase 6 revisited — real tenant, GREEN (23 Sep 2026)
- IT delivered the Microsoft credentials. First real spike: token, user lookup and event creation all 2xx, but
  the event had no `onlineMeeting.joinUrl`. Diagnosed with a new `scripts/graph-doctor.ts`: the service-account
  mailbox reports `calendar.allowedOnlineMeetingProviders: []`, while `POST /onlineMeetings` works perfectly.
- Built the **meeting-first** fallback into `runProvisionSequence` (plus `createOnlineMeeting` on the Graph
  client, a `no-calendar-join-url` mock failure mode, and link-carrying calendar events), and made the
  sequence clean up a half-created event on failure. Two new unit tests; 152 tests green.
- Second spike: **GREEN** — recordAutomatically accepted, co-organiser = real test teacher, lobby bypass,
  presenters locked, recordings endpoint 200.
- Live: `MS_*` + `GRAPH_MODE=real` set as Supabase secrets, functions redeployed, `demo:reset-links` run, and
  the provisioner executed through the deployed Edge Function — all 33 upcoming sessions now carry real Teams
  meeting links (`path=meeting-first` in the audit log).

## Real data + class groups (24 Sep 2026)
- **Model**: migration `…20260924000100_program_semester_groups.sql` — `batches` becomes a class group
  (programme + semester); `students.secondary_batch_id` adds an optional second group, with
  `current_student_batch_ids()` and every dependent policy/helper updated; `students.enrollment_no`,
  `intake_session`, `personal_email`; `v_class_groups` for admin counts; a check stops a group being its
  own secondary.
- **Import**: `scripts/import-real-data.ts` (`npm run data:import`, `-- --apply`) reads the 10 workbooks in
  `docs/`, derives programmes/groups/subjects/faculty/classes and students, and loads them. Dry run prints a
  full reconciliation; 38 skipped rows were verified to be section headers and gender tallies, not students.
- **Loaded**: 6 programmes, 20 class groups, 98 subjects, 98 offerings, 21 faculty (placeholder logins),
  331 dated classes (16 Sundays, 13 Sep – 27 Dec 2026), 637 students. All 294 upcoming classes carry real
  Teams links created by the deployed provisioner.
- **UI**: student Timetable page (both semesters, weekly pattern, full term) + nav entry; dashboard shows
  both groups and 14 days ahead; Join Now is never greyed out and explains the 15-minute rule when pressed
  early; admin student page and CSV import gained the second class group; "batch" wording became
  "class group"; admin Students list paged (50/page, was 7.6 s for 637 rows).
- **Tested**: 159 unit + RLS tests (7 new in `tests/db/secondary-group.test.ts`); Playwright rewritten to be
  data-agnostic (fixtures resolved from the database) — 9/9 green against the live data; a 23-check
  real-data sweep of all three roles passed, including a real Teams join that wrote an attendance row.
- **Not done**: faculty real emails / M365 UPNs (awaiting the list); B.Com semesters 2 and 4 have students
  but no classes in the source timetable, so those two students see an empty schedule.

## Admin editing of students, and an E2E fixture that no longer moves real classes (24 Sep 2026)
- **Editing was reachable but invisible.** The student edit form (including the second class group) already
  existed at `/admin/students/[id]`, but the only way in was clicking the student's name. Added an explicit
  **Edit** button on every row of Students and Teachers, matching the "Manage" column Class groups already
  had.
- **The second group is now visible where it matters**: a `Second group` column on the Students list, the
  class-group filter matches either group, the New student form and the "map a signed-in student" form both
  take an optional second group (`createStudent` now accepts it), and Class groups shows `+n second` for
  students following it as their additional semester.
- **E2E fixture rewritten.** It used to move a real class to "now" for the join journeys and restore it
  afterwards; a failed run left the class displaced and the next run then treated the displaced time as the
  original. `loadFixture()` now inserts a throwaway ad-hoc session (topic `E2E test class (safe to delete)`),
  runs the live-join journeys on that and deletes it in `afterAll`; `makeLive()` will not update a row whose
  topic is not that marker, so a real class cannot be moved by the suite. The "join opens later" assertion
  uses a real future class, read-only, chosen at least 30 minutes out.
- **New check**: `npm run data:verify` (`-- --apply` to repair) compares every session against
  `docs/ODL Sunday Online Timetable.xlsx`, reports off-Sunday classes and per-date count differences, and
  restores a displaced class to its slot. Two sessions currently need it — see BLOCKERS B5.
- **Tested**: lint, typecheck, 159/159 unit + RLS, `next build`, Playwright 9/9 against the live data with
  the new fixture; verified afterwards that the database still holds exactly 331 sessions and no leftover
  E2E rows.

## Changing a portal password without an email (24 Sep 2026)
- **The page existed but was unreachable.** `/account/password` was only entered by a forced redirect on
  first sign-in; nothing linked to it afterwards. Added **Change password** to the header for admin and
  faculty. Students are not offered it - they sign in with Google and have no portal password.
- **New script** `npm run auth:set-password -- <email> '<password>'`, or `--from-env <VAR>` to take it from
  `.env.local` so it stays out of shell history. It uses the Admin API, which sets the hash immediately.
  The Supabase dashboard only offers "send a recovery email", which cannot work for the ODL admin address
  or the 21 placeholder faculty logins, because those mailboxes do not exist.
- **Where passwords live:** Supabase Auth (GoTrue) owns them, bcrypt-hashed in `auth.users`. This
  application never stores or compares a password; `src/lib/auth/password.ts` only enforces a policy
  (12 characters, a letter and a digit) on the forms that submit a new one.
- **Test diagnostics:** a rejected sign-in used to surface as a 120 s navigation timeout. `signInWithPassword`
  now waits for the login error (`data-testid="login-error"`) as well and fails in seconds, naming the env
  var to check and the script to run.

## Real student emails, password sign-in, and the university's own identity (26 Sep 2026)
- **No invented identifiers.** An audit of the ten workbooks showed the first import had generated an
  `@srisriuniversity.edu.in` login for the 286 August 2026 admissions (the workbooks have no SSU Email Id
  column at all for them) and `TMP-...` roll numbers. Migration `...20260926000100` splits the two real
  columns apart - `students.college_email` and `students.personal_email`, either of them blank - and makes
  `roll_number` nullable. The login is the college address when there is one, the personal address
  otherwise, so all 637 students can sign in without anything being made up. `npm run data:fix-emails`
  repairs the rows already loaded.
- **Password sign-in for students.** Google sign-in is gone; `/login` serves every role. New students get
  `STUDENT_DEFAULT_PASSWORD` (`srisri@26`) with `must_change_password`, and are then asked to choose two
  security questions. The account-creation rule simplified accordingly: every account must carry the
  `provisioned_by` stamp only the Admin API can set, so nobody can sign themselves up at any domain.
- **Resets without email.** `/login/reset` verifies the security questions and sets a new password;
  answers are bcrypt-hashed and compared inside the database, rate limited per IP and per address.
  Supabase's built-in mailer cannot serve a 600-student cohort, so nothing depends on it.
- **Admin control of passwords.** Admin -> Students -> Password sets one, as does
  `npm run auth:set-password`. Passwords are deliberately *not* stored in readable form anywhere: Supabase
  Auth keeps a one-way bcrypt hash, so a leaked database cannot hand anyone 637 working logins. Setting a
  password gives the ODL office the same ability and leaves an audit row; storing plaintext would not.
- **Policy** dropped to 8 characters (`srisri@26` is 9) in `password.ts`, `config.toml` and the project's
  auth settings, which `npm run auth:config` now applies rather than leaving to the dashboard.
- **Identity.** The real Sri Sri University logo, seal and a campus photograph now ship in `public/brand/`,
  taken from the university's own site. The palette moved from saffron to the maroon and gold of the seal,
  across all three portals. The landing page is the campus behind the name and two buttons - no feature
  copy - and the sign-in, reset and password pages share the same frame.
- **Tested**: lint, typecheck, 167 unit + RLS tests (7 new for security questions, 3 rewritten for the new
  sign-up rule, 1 new for a student with no roll number and only a personal email), `next build`.
  The Playwright journeys need the migration on the live project first - see BLOCKERS B7.

## Either address signs a student in (26 Sep 2026)
- **The gap:** the login was the college address when a student had one, so the 350 students who have
  both could not use their personal address at all.
- **Fix:** `src/lib/auth/resolve-login.ts` translates whichever address was typed into the one the
  account is held under, before GoTrue is called. One auth user, one password, two accepted addresses -
  no second account to keep in step, and a password change covers both. Used by sign-in and by the
  security-question reset. A personal address shared by two students is refused rather than guessed
  (none is shared today). Rate limiting keys on the resolved address, so aliases cannot multiply the
  attempt budget.
- **Test:** `e2e/student-login.spec.ts` sets a password on a student who has both addresses, signs in
  with each, checks it is one profile and not two, and restores the account.
- **Also:** the E2E suite now clears the sign-in throttle for the accounts it drives. A full run signs
  the same teacher in four times, so two runs inside the limiter's 15-minute window exhausted the
  8-attempt budget and later specs failed with "Too many sign-in attempts" - the limiter working
  correctly, but something CI would hit on any retry. Production behaviour is unchanged.
- **Verified:** lint, typecheck, 167 unit + RLS, and 12/12 Playwright journeys against the live data.

