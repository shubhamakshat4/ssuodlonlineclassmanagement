# SSU ODL — Online Class Management Portal
## Technical Specification & Build Plan

Version 1.0 — treat this file as the source of truth. If an instruction in chat
conflicts with this file, ask before deviating, then update this file.

---

## 1. What we are building

A web portal for Sri Sri University's ODL (Open & Distance Learning) programme that:

- Lets students sign in with their `@srisriuniversity.edu.in` Google account and see
  their scheduled classes with a **Join Now** button.
- Lets teachers sign in with email + password, see their timetable, join their classes,
  and **override the auto-generated meeting link** with any other URL (Zoom, Google Meet,
  a rescheduled Teams link).
- Lets an admin configure everything: programmes, batches, subjects, student and teacher
  records, batch enrolment, teacher-to-subject assignment, and the weekly timetable.
- **Automatically creates a Microsoft Teams meeting for every class** using a single
  service account as organiser, with the teacher added as co-organiser.
- Records attendance from the portal when a student clicks Join Now.
- Surfaces the Teams cloud recording to enrolled students for **30 days** after the class,
  streamed from the service account's OneDrive (no re-hosting, no duplicate storage).

### Non-goals for v1
- No reconciliation of portal attendance against the Teams attendance report.
- No assignments, grading, LMS content, fee management, or messaging.
- No mobile apps. Responsive web only.
- No recording capture for classes where the teacher overrode the link to a non-Teams URL.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Data / Auth | Supabase (Postgres, Auth, Row Level Security) |
| Background jobs | Supabase Edge Functions (Deno) triggered by `pg_cron` + `pg_net` |
| Microsoft integration | Microsoft Graph, app-only (client credentials) |
| Hosting | Vercel (frontend), Supabase cloud (everything else) |
| Timezone | `Asia/Kolkata` everywhere. Store `timestamptz`. Render in IST. |

**Hard rule:** the browser never holds a Microsoft credential and never calls Graph.
All Graph calls happen in Edge Functions or Next.js route handlers running server-side
with the service-role key.

---

## 3. Microsoft 365 prerequisites

These are configured by SSU IT, not by code. The app cannot work without them.
Build against mocks until they are confirmed, and keep a `docs/M365_SETUP.md` checklist.

1. **Entra app registration** with application (not delegated) permissions, admin-consented:
   - `Calendars.ReadWrite` — create the class events on the service account
   - `OnlineMeetings.ReadWrite.All` — patch meeting options, set co-organiser
   - `OnlineMeetingRecording.Read.All` — list recordings
   - `Files.Read.All` — resolve the recording's OneDrive item and get a download URL
   - `User.Read.All` — resolve teacher UPN → Entra object id
2. **Application access policy.** A tenant admin must run
   `New-CsApplicationAccessPolicy` with the app id and grant it to the service account.
   Without this, app-only meeting creation returns 403. This is the single most common
   reason the integration stalls — confirm it early.
3. **Service account** (`classes@…`), licensed for Teams with OneDrive, whose meeting
   policy allows cloud recording.
4. **Teams meeting policy** on the service account:
   - Anonymous users can join a meeting: **On**
   - Anonymous users and dial-in callers can start a meeting: **On**
     (without this, students queue in the lobby with nobody to admit them)
5. **Recording expiry** set to **35 days** (`NewMeetingRecordingExpirationDays`). The portal
   enforces the 30-day student window; the 5-day buffer stops Teams deleting a file the
   portal still believes is live.
6. **Teachers are licensed Entra ID users** in the same tenant. Required — Graph rejects
   assigning the co-organiser role to non-Entra attendees.

---

## 4. Data model

All tables in the `public` schema, all with RLS enabled, all with
`created_at timestamptz default now()` and `updated_at` maintained by trigger.

```
profiles
  id                uuid PK → auth.users.id
  role              enum('student','teacher','admin') NOT NULL
  full_name         text NOT NULL
  email             citext NOT NULL UNIQUE
  phone             text
  is_active         bool NOT NULL default true

programs
  id, name, code UNIQUE, is_active

batches
  id, program_id FK, name, code UNIQUE, intake_year int,
  current_semester int, start_date, end_date, is_active

subjects
  id, program_id FK, code, name, credits int
  UNIQUE(program_id, code)

batch_subjects                       -- a subject offered to a batch in a semester
  id, batch_id FK, subject_id FK, semester int, is_active
  UNIQUE(batch_id, subject_id, semester)

students
  id                uuid PK → profiles.id
  roll_number       text UNIQUE
  batch_id          FK
  status            enum('active','on_hold','withdrawn','graduated')

teachers
  id                uuid PK → profiles.id
  employee_code     text UNIQUE
  entra_upn         citext NOT NULL          -- teacher's M365 sign-in
  entra_user_id     uuid                     -- resolved & cached from Graph
  department        text

subject_teachers                     -- who teaches what, for which batch
  id, batch_subject_id FK, teacher_id FK, is_primary bool
  UNIQUE(batch_subject_id, teacher_id)

timetable_slots                      -- the recurring rule
  id, batch_subject_id FK, teacher_id FK,
  day_of_week smallint (0=Sun..6=Sat),
  start_time time NOT NULL, end_time time NOT NULL,
  effective_from date NOT NULL, effective_to date,
  is_active bool
  CHECK (end_time > start_time)

holidays
  id, date, name, batch_id FK NULL      -- NULL = applies to all batches

class_sessions                       -- one generated instance of a class
  id
  batch_subject_id  FK
  teacher_id        FK
  timetable_slot_id FK NULL            -- NULL for ad-hoc / extra classes
  scheduled_start   timestamptz NOT NULL
  scheduled_end     timestamptz NOT NULL
  status            enum('scheduled','cancelled','completed')
  topic             text NULL

  provider          enum('teams','custom') default 'teams'
  graph_event_id            text NULL
  graph_online_meeting_id   text NULL
  teams_join_url            text NULL     -- generated, never edited by a teacher
  join_url_override         text NULL     -- teacher-supplied URL, wins when present
  override_set_by           uuid NULL FK profiles
  override_set_at           timestamptz NULL

  sync_status       enum('pending','provisioning','provisioned','failed','cancelled')
  sync_attempts     int default 0
  sync_error        text NULL
  UNIQUE(timetable_slot_id, scheduled_start)   -- idempotent generation

attendance
  id, class_session_id FK, student_id FK,
  clicked_at timestamptz NOT NULL default now(),
  ip inet, user_agent text
  UNIQUE(class_session_id, student_id)

recordings
  id, class_session_id FK,
  graph_recording_id text, drive_id text, drive_item_id text,
  recorded_at timestamptz, duration_seconds int, size_bytes bigint,
  expires_at timestamptz NOT NULL,       -- recorded_at + 30 days
  status enum('available','expired','failed')
  UNIQUE(class_session_id, graph_recording_id)

audit_log
  id, actor_id FK NULL, action text, entity text, entity_id uuid,
  payload jsonb, created_at
```

### Effective join URL
Always derived, never stored twice:
```sql
coalesce(join_url_override, teams_join_url)
```
Expose this as a generated column or a view (`v_class_sessions`) so the UI never
re-implements the precedence rule.

---

## 5. Row Level Security

Write RLS policies as migrations and cover them with tests. Sketch:

- `profiles`: a user reads their own row. Admins read and write all.
- `students`: student reads own row. Teacher reads students in batches they teach.
  Admin full.
- `class_sessions`: student reads sessions where
  `batch_subject_id` belongs to their batch and their enrolment is active.
  Teacher reads sessions where `teacher_id = auth.uid()`.
  Teacher may UPDATE only `join_url_override`, `override_set_by`, `override_set_at`,
  `topic`, and only when `scheduled_end > now()`. Enforce the column restriction with a
  `BEFORE UPDATE` trigger, not just a policy.
  Admin full.
- `attendance`: student INSERTs only their own row and only inside the join window.
  Enforce the window in a trigger, not in the client.
  Teacher and admin read.
- `recordings`: student reads only where enrolled AND `now() < expires_at`.
  The row being readable does not grant the file — playback goes through the Edge Function
  in §8.

Never rely on the client for any of this. Assume the anon key is public, because it is.

---

## 6. Authentication

One Supabase Auth project, three roles.

### Students — Google SSO only
- Supabase Google provider. Pass `hd=srisriuniversity.edu.in` as a hint, but **do not trust it**.
- Enforce server-side in a `before user created` auth hook (or a trigger on `auth.users`):
  reject unless the email domain matches `ALLOWED_STUDENT_DOMAIN` **and** the email already
  exists in a pre-provisioned `students` row created by the admin. Unknown addresses at the
  right domain must be rejected — admin provisions, Google only authenticates.
- On first successful sign-in, link `auth.users.id` into the existing `profiles`/`students`
  row rather than creating a new one.

### Teachers and admins — email + password
- Created by the admin through `supabase.auth.admin.createUser` with an invite email.
- Force password change on first login. Enforce a sane minimum (12 chars).
- Block the Google provider for these accounts.

### Route protection
Next.js middleware reads the session, loads `profiles.role`, and gates
`/student/*`, `/teacher/*`, `/admin/*`. Server components re-check. Never gate on the client alone.

---

## 7. Microsoft Graph integration

All of this runs in Edge Functions. Token via client credentials against
`https://login.microsoftonline.com/{MS_TENANT_ID}/oauth2/v2.0/token`,
scope `https://graph.microsoft.com/.default`. Cache the token in memory until ~5 min before expiry.

### 7.1 Session generation — `cron-generate-sessions`, nightly 01:00 IST
Horizon: 21 days ahead.
For each active `timetable_slot`, for each matching date in the horizon that is inside
`effective_from`/`effective_to` and not a holiday for that batch, `INSERT ... ON CONFLICT DO NOTHING`
into `class_sessions` with `sync_status = 'pending'`.

Watch DST-free IST but still build timestamps from the date + local time in `Asia/Kolkata`,
not by adding hours to UTC.

### 7.2 Meeting provisioning — `cron-provision-meetings`, every 10 minutes
Claim up to N `pending` sessions with `FOR UPDATE SKIP LOCKED`, set `provisioning`, then per session:

**Step 1 — create a calendar-backed event on the service account.**
This must be a calendar event, not a bare `onlineMeetings` object. The Graph recordings API
does not support meetings created via `POST /onlineMeetings` that are not associated with a
calendar event, so a bare online meeting would record fine and then be unretrievable.

```http
POST /v1.0/users/{MS_SERVICE_ACCOUNT_USER_ID}/events
{
  "transactionId": "{class_session.id}",        // idempotency — safe to retry
  "subject": "{Subject name} — {Batch code}",
  "start": { "dateTime": "2026-01-12T10:00:00", "timeZone": "India Standard Time" },
  "end":   { "dateTime": "2026-01-12T11:00:00", "timeZone": "India Standard Time" },
  "isOnlineMeeting": true,
  "onlineMeetingProvider": "teamsForBusiness",
  "attendees": [
    { "emailAddress": { "address": "{teacher.entra_upn}" }, "type": "required" }
  ]
}
```
Store `id` → `graph_event_id`, `onlineMeeting.joinUrl` → `teams_join_url`.

**Step 2 — resolve the online meeting object.**
```http
GET /v1.0/users/{SA}/onlineMeetings?$filter=JoinWebUrl eq '{urlencoded joinUrl}'
```
Store `id` → `graph_online_meeting_id`.

**Step 3 — apply meeting options.**
```http
PATCH /v1.0/users/{SA}/onlineMeetings/{graph_online_meeting_id}
{
  "recordAutomatically": true,
  "allowedPresenters": "roleIsPresenter",
  "lobbyBypassSettings": { "scope": "everyone", "isDialInBypassEnabled": true },
  "allowAttendeeToEnableMic": false,
  "allowAttendeeToEnableCamera": false,
  "participants": {
    "attendees": [{
      "upn": "{teacher.entra_upn}",
      "role": "coorganizer",
      "identity": { "user": { "id": "{teacher.entra_user_id}" } }
    }]
  }
}
```
`allowedPresenters: roleIsPresenter` matters: students join anonymously, and the default
lets anyone present, mute others, or stop the recording.

Set `sync_status = 'provisioned'` on success. On failure increment `sync_attempts`, record
`sync_error`, and set `failed` after 5 attempts so it surfaces on the admin error dashboard.

**Spike this whole sequence before building anything on top of it.** Steps 1→3 combining a
calendar-backed event with `recordAutomatically` is the load-bearing assumption of the design.
If step 3 rejects `recordAutomatically` on a calendar-backed meeting, fall back to leaving
recording to the teacher's manual click and harvesting from OneDrive (§7.4 fallback).

### 7.3 Throttling and safety
- Cap concurrency at 4 requests/second against Graph. Honour `Retry-After` on 429 and 503,
  exponential backoff with jitter, max 5 attempts.
- Never call Graph from a user request path. Everything goes through the job table.
- Log every Graph call (endpoint, status, duration, correlation id) to `audit_log`.

### 7.4 Recording harvest — `cron-harvest-recordings`, hourly
For sessions where `provider = 'teams'`, `status = 'completed'`, ended within the last 48 h,
and no `recordings` row:

Primary path:
```http
GET /v1.0/users/{SA}/onlineMeetings/{graph_online_meeting_id}/recordings
```
Resolve each recording's content URL to a `driveId` + `driveItemId`.

Fallback path (use if the primary returns empty after 6 h, or if the spike in §7.2 failed):
list the service account's OneDrive `Recordings` folder and match by
`createdDateTime` inside the session window plus subject in the filename.
```http
GET /v1.0/users/{SA}/drive/root:/Recordings:/children
```

Insert a `recordings` row with `expires_at = recorded_at + interval '30 days'`.

A daily `cron-expire-recordings` flips rows past `expires_at` to `expired`. We never delete
the file — Teams' own 35-day expiry policy handles that.

### 7.5 Cancellation and edits
- Admin cancels a session → `DELETE /users/{SA}/events/{graph_event_id}`, set
  `status='cancelled'`, `sync_status='cancelled'`.
- Admin reschedules → `PATCH` the event's start/end, keep the same join URL.
- Teacher sets an override (§9) → delete the Teams event so nobody joins an empty room,
  null out `teams_join_url`, set `provider='custom'`.

---

## 8. Recording playback (no re-hosting)

Recordings stay in the service account's OneDrive. The portal never copies the MP4.

Edge Function `GET /functions/v1/recording-play?session_id=…`:
1. Verify the caller's Supabase JWT.
2. Verify the caller is an active student enrolled in that `batch_subject`
   (or the teacher of the session, or an admin).
3. Verify `now() < recordings.expires_at`.
4. `GET /v1.0/drives/{drive_id}/items/{drive_item_id}` with the app token.
5. Read the `@microsoft.graph.downloadUrl` property from the response. It is a short-lived,
   pre-authenticated URL that supports HTTP range requests, so seeking works.
6. Return `302` to that URL.

This keeps access control in the portal, keeps bandwidth on Microsoft's side, and avoids
creating anonymous OneDrive sharing links. Do **not** store or cache the download URL — it
expires in roughly an hour. Log every playback to `audit_log`.

---

## 9. Meeting link override

Teachers can replace the auto-generated link for a single class, so a session can run on
Zoom, Google Meet, or a manually created Teams meeting.

Rules:
- Editable only by the assigned teacher (or an admin), only while `scheduled_end > now()`.
- Validate: must be `https://`, must parse as a URL. Warn (do not block) if the host is not
  one of `teams.microsoft.com`, `meet.google.com`, `zoom.us`, `*.zoom.us`.
- On save: set `join_url_override`, `override_set_by`, `override_set_at`, `provider='custom'`,
  delete the Teams calendar event, write an `audit_log` row.
- The teacher sees a clear warning: **"Recording will not be available to students for this
  class."** The portal can only harvest Teams recordings organised by the service account.
- A "Revert to auto-generated Teams link" action clears the override and re-queues the
  session as `sync_status='pending'`, which regenerates a fresh Teams meeting.
- Attendance still works normally — it is a portal click, independent of the platform.
- Overriding does not notify students automatically in v1; show the change on their dashboard
  and mark the session with a "Link updated" badge.

---

## 10. Attendance

- Join Now is enabled from **10 minutes before** `scheduled_start` until `scheduled_end`
  (make the lead time a config value).
- Clicking calls `POST /api/sessions/{id}/join`, which inserts the attendance row
  (upsert, so a second click does not duplicate), then returns the effective join URL.
  The client opens it in a new tab.
- Store IP and user agent for dispute handling.
- Be explicit in the UI copy that this records *joining from the portal*, not presence
  for the full session. That is the accepted v1 behaviour.
- Admin gets a per-batch, per-subject, per-date-range attendance report with CSV export.

---

## 11. Screens

**Student** — `/student`
- Today's classes at the top, each with subject, teacher, time, and Join Now
  (disabled with a countdown outside the window).
- Upcoming (next 7 days), grouped by day.
- Recordings tab: past classes with an available recording, showing days remaining.
- Read-only profile.

**Teacher** — `/teacher`
- Today's classes with Join, plus an Edit link action per class.
- Weekly timetable grid.
- Upcoming classes list with the same actions.
- Per-class roster and who clicked Join.

**Admin** — `/admin`
- Programmes, Batches, Subjects — CRUD.
- Students — CRUD, bulk CSV import, assign to batch.
- Teachers — CRUD, assign to `batch_subject`.
- Timetable builder — weekly grid per batch, with clash detection
  (same teacher or same batch double-booked).
- Sessions — browse generated sessions, cancel, reschedule, add an extra class.
- Holidays.
- Sync health — sessions in `failed`, with the Graph error and a Retry button.
- Attendance reports with CSV export.

---

## 12. Build phases

Build strictly in order. Each phase ends green: migrations applied, tests passing,
manually verified, committed.

| Phase | Deliverable |
|---|---|
| 0 | Repo scaffold, Supabase project, env plumbing, CI (lint + typecheck + test) |
| 1 | Schema migrations, RLS policies, seed script with realistic fake data |
| 2 | Auth: Google SSO with domain + pre-provisioning guard, teacher password login, roles, middleware |
| 3 | Admin CRUD for programmes, batches, subjects, students, teachers, assignments |
| 4 | Timetable builder with clash detection, holidays |
| 5 | `cron-generate-sessions`. Sessions appear with null join URLs. No Graph yet. |
| 6 | **Graph spike** — prove §7.2 steps 1–3 end to end against the real tenant with one throwaway class. Do not proceed until this is green. |
| 7 | `cron-provision-meetings`, retry/backoff, admin sync-health screen |
| 8 | Student dashboard, Join Now, attendance recording |
| 9 | Teacher dashboard, timetable view, join, link override |
| 10 | `cron-harvest-recordings`, `recording-play` Edge Function, student recordings tab, expiry |
| 11 | Attendance reports + CSV, audit log viewer |
| 12 | Hardening: rate limits on join/auth endpoints, RLS test suite, error monitoring, runbook |

---

## 13. Environment variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only, never NEXT_PUBLIC_

# Microsoft Graph
MS_TENANT_ID=
MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_SERVICE_ACCOUNT_USER_ID=         # Entra object id of classes@…
MS_SERVICE_ACCOUNT_UPN=

# App
ALLOWED_STUDENT_DOMAIN=srisriuniversity.edu.in
APP_TIMEZONE=Asia/Kolkata
JOIN_WINDOW_LEAD_MINUTES=10
RECORDING_RETENTION_DAYS=30
SESSION_GENERATION_HORIZON_DAYS=21
```

---

## 14. Testing

- **Unit**: timetable expansion (DST-free but still timezone-correct), join-window logic,
  effective-URL precedence, recording expiry.
- **RLS**: a test suite that logs in as student A and asserts they cannot read student B's
  attendance, another batch's sessions, or an expired recording. This is the highest-value
  test file in the project.
- **Graph**: a mock Graph server for CI. Real-tenant tests run manually against a dedicated
  test batch, never in CI.
- **E2E** (Playwright): student sign-in → see class → join → attendance row exists;
  teacher override → student sees the new link.

---

## 15. Known risks

1. **Application access policy not granted** → all meeting creation 403s. Confirm with IT first.
2. **`recordAutomatically` on a calendar-backed meeting** — the design's load-bearing
   assumption. Phase 6 exists to de-risk it. Fallback is manual recording plus OneDrive scan.
3. **Anonymous join policy off** → students stuck in the lobby. Test with a real Google
   account from outside the tenant before launch.
4. **Graph throttling at term start** when a full semester of sessions is generated at once.
   Provision on a rolling 21-day horizon, not the whole term.
5. **Teacher OneDrive scatter** — if a teacher manually starts the recording, the file lands
   in *their* OneDrive, not the service account's, and the harvest misses it. Auto-recording
   avoids this. If it fails, the fallback needs `Files.Read.All` across teacher drives.
6. **Attendance is a click, not presence.** Agreed for v1. Document it in the UI so nobody
   later treats it as verified attendance for academic purposes.

Credentials:
Supabase project url: [redacted]
Supabase publishable key: [redacted]

MS Teams account: [redacted]
Teacher Microsoft accounts for test provisioning: [redacted]
