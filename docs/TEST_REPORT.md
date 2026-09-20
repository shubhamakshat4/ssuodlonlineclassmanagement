# Test report

Final state at the end of the autonomous build (20 Sep 2026). `npm test` = **142 tests, 142 passing, 0 failing**
across 17 files; `npm run lint`, `npm run typecheck`, `npm run build` clean.

## How the suites run

| Suite | Runner | Environment | Command |
|---|---|---|---|
| Unit (54 tests, 10 files) | Vitest | Node, no services | `npm run test:unit` |
| Database / RLS (88 tests, 7 files) | Vitest | **Embedded Postgres 17** booted per run; every migration + `seed.sql` applied to a template DB; each file clones it and runs statements as `anon` / `authenticated` (with JWT claims) / `service_role`, exactly like PostgREST | `npm run test:db` |
| E2E (3 files, 8 tests) | Playwright | Executed against the **live project** (`next start` on :3100, real GoTrue/PostgREST): student join journey 3/3, teacher override journey 2/2, demo walkthrough 3/3 | `E2E_BASE_URL=http://localhost:3100 E2E_NO_SERVER=1 npm run test:e2e` |
| Graph spike | tsx script | Real tenant when `GRAPH_MODE=real` + `MS_*` | `npm run graph:spike` — **executed against the mock only** (B1) |

Everything in CI (`.github/workflows/ci.yml`) runs without external services and with Graph mocked.

## What is covered

### Unit
- `time.test.ts` — IST wall-time → UTC, DST zone proof (New York), calendar-date-in-zone, ranges, Graph formatting.
- `timetable.test.ts` — slot expansion: weekday matching, zone vs UTC day boundary, global/batch holidays, effective ranges, inactive, determinism.
- `clash.test.ts` — pure clash detection (teacher / batch / both, touching ranges, date ranges, inactive, self).
- `sessions.test.ts` — join window boundaries + configurable lead, effective-URL precedence, countdown text, recording expiry/days remaining, override URL validation and host warning.
- `graph.test.ts` — real client with a fake `fetch`: token caching, request bodies per §7.2, Retry-After/429, max attempts, no retry on 403, 4 rps throttle, 404-on-delete tolerance, downloadUrl; mock sequence: options applied, transactionId idempotency, recordAutomatically fallback, 403 propagation.
- `provision.test.ts` — whole provisioner against mock Graph + in-memory fake of the supabase-js builder: create (IST event, co-organiser, ids stored, teacher id cached), failure counting to `failed` at 5, patch on reschedule, delete for cancelled/custom, recreate after revert, manual recording mode.
- `harvest.test.ts` — OneDrive matching, primary path, 6-hour fallback, manual mode, per-session error isolation.
- `csv.test.ts`, `auth.test.ts` (route gating, open-redirect protection, password policy), `env.test.ts`.

### Database / RLS (the highest-value file is `tests/db/rls.test.ts`, 48 tests)
- **anon** sees nothing anywhere and cannot write.
- **student A** reads only own profile/student row/batch; sees own batch's sessions and never MBA/2026 sessions; cannot read `teachers`; reads own attendance but not student B's on the same session; can insert attendance only inside the window (boundary tested at ±1 minute and with the lead time changed in `app_settings`), only for own id, only when enrolled, not for later-today/past/cancelled classes; cannot update/delete attendance; sees the available recording, not the expired one, not another batch's; loses a recording the second it expires; cannot touch sessions/profiles/recordings/audit log; helper functions do not leak.
- **student in another batch** and **on-hold student** isolation.
- **teacher** sees only own sessions and rosters of batches taught; sets an override (side effects: `provider='custom'`, `teams_join_url` null, actor, timestamp, audit row); clearing re-queues; non-https rejected; cannot edit a colleague's class, an ended class, any other column, or spoof `override_set_by`; cannot insert sessions/programmes or change students; `log_audit` records the JWT actor.
- **admin** reads everything, writes catalogue, cancel → `sync_status='cancelled'` + audit, reschedule → `pending` while keeping the event id, override on behalf of a teacher.
- **auth guards**: new user via Google rejected; email users allowed; Google identity blocked for teachers/admins and for wrong-domain emails; allowed for a pre-provisioned student; hook returns 403 payloads and is uncallable by app roles.
- `timetable.test.ts` — clash trigger (teacher/batch), back-to-back OK, disjoint dates OK, inactive ignored, re-check on update, holiday uniqueness.
- `generation.test.ts` — idempotent inserts, seeded holidays skipped, visibility of generated rows, cron helper inert without pg_net.
- `provisioning.test.ts` — claim semantics, `FOR UPDATE SKIP LOCKED` with two connections, stuck recovery, privileges, deletion view.
- `recordings.test.ts` — awaiting view, post-harvest visibility, expiry flip + privileges, cross-batch isolation.
- `hardening.test.ts` — rate limiter windows and privileges, job-only functions/views denied to app roles, no self-escalation, deactivation removes access, audit actor cannot be forged.
- `schema.test.ts` — all 15 tables with RLS enabled, view semantics, `updated_at` triggers.

## What is mocked
- **Microsoft Graph** everywhere except `npm run graph:spike` with `GRAPH_MODE=real`. The mock reproduces the failure modes we design against (403 access policy, `recordAutomatically` rejected, 429, network).
- **supabase-js query builder** in `provision.test.ts` / `harvest.test.ts` (a small in-memory fake covering the calls the jobs make). The SQL those jobs depend on (`claim_pending_sessions`, views, functions) is tested for real in the db suite.
- **Supabase Auth / PostgREST** are not present in the db suite; the suite reproduces their security model (roles + `request.jwt.claims`) with `tests/db/supabase-shim.sql`.

## What genuinely needs a human
1. The **real-tenant Graph spike** (§7.2 steps 1→3 with `recordAutomatically`, co-organiser assignment to a second real user, lobby bypass for anonymous students). No credentials were available.
2. **Google SSO** end to end with a real `@srisriuniversity.edu.in` account and a personal Gmail rejection.
3. **Teams meeting policy** effects (anonymous join without lobby) — only observable by joining from outside the tenant.
4. **Recording harvest** against real OneDrive naming (`matchDriveItem` assumes the Teams default file name contains the subject).
5. **Playback** through the real `@microsoft.graph.downloadUrl` (range requests / seeking in the browser).
6. **Email delivery** of teacher invites and password resets (SMTP configured in Supabase).
7. ~~Running the migrations on the cloud project and the Playwright journeys against it~~ — done 20 Sep 2026.
