# Blockers

Things that could not be finished in this build, what was tried, and exactly what is needed.

## B1 — Microsoft Graph — RESOLVED (23 Sep 2026)
- IT delivered the tenant id, client id, client secret, the service account (`classes@srisriuniversity.edu.in` + object id) and a test teacher mailbox. Admin consent is granted on all five application permissions, and the application access policy was created and granted to the service account.
- **Spike result: GREEN** (`docs/GRAPH_SPIKE_LOG.md`) — `recordAutomatically=true` accepted, co-organiser assigned to the real test teacher, lobby bypass `everyone`, presenters `roleIsPresenter`, recordings endpoint reachable. The throwaway event was deleted.
- **Tenant quirk found and handled:** the service-account mailbox reports `calendar.allowedOnlineMeetingProviders: []`, so Exchange ignores `isOnlineMeeting` and returns events without a Teams link. The provisioner detects this and switches to the **meeting-first** path: create the meeting with `POST /onlineMeetings`, then create the calendar invite carrying that link. The end state is identical (event id + meeting id + join URL), so meeting options and recording harvest are unaffected. If Exchange later enables `teamsForBusiness` on that mailbox, the calendar-first path resumes automatically — no code change.
- **Live:** `MS_*` and `GRAPH_MODE=real` set as Supabase Edge Function secrets, functions redeployed, and all 33 upcoming demo sessions provisioned with real Teams links through the deployed cron function.
- **Still outstanding:** the faculty Microsoft 365 sign-in list (IT replied "awaiting the list of users"). The three demo teachers carry placeholder UPNs, so their co-organiser assignment is nominal until real UPNs are entered on the Teachers page.

## B2 — Supabase — RESOLVED except the Google provider
- **Done (20 Sep 2026):** schema (11 migrations) applied and tracked; five Edge Functions deployed; secrets set (`GRAPH_MODE=mock` for the demo, `GRAPH_RECORDING_MODE=auto`, `CRON_SECRET`); Vault holds `project_url` + `cron_secret`; pg_cron jobs verified firing and reaching the functions (HTTP 200); auth config applied via the Management API (sign-ups off, `before_user_created` hook on, 12-char passwords, redirect allow-list). Demo data loaded. Verified live: `npm run smoke:cloud` 15/15, Playwright `e2e/demo-walkthrough.spec.ts` 3/3, `e2e/student-join.spec.ts` 3/3, `e2e/teacher-override.spec.ts` 2/2.
- **Google provider configured (21 Sep 2026)** — student Google sign-in works; unmapped university accounts see "No classes are assigned to you yet — contact the ODL department"; sign-ups switch is ON with the hook enforcing who may create an account.
- **Demo caveat:** functions run with `GRAPH_MODE=mock`, so the provisioner assigns fake `teams.microsoft.com/…/mock/…` links to new sessions. Go-live: `supabase secrets set GRAPH_MODE=real MS_…`, `npm run demo:reset-links`.
- **Rotate:** the database password, service-role key and CLI access token were all shared in chat. Rotate in the dashboard; update `.env.local` (`SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`).

## B3 — Faculty Microsoft 365 addresses not yet supplied
- **What:** the 21 faculty from the timetable were created with placeholder logins (`first.last@srisriuniversity.edu.in`) and placeholder UPNs (`…@srisriuniversity.onmicrosoft.com`).
- **Impact:** faculty cannot sign in until their real address is set, and Teams co-organiser assignment is nominal (the meeting is still created and students can join).
- **Needs:** the list of faculty M365 sign-in addresses from IT. Then update each on **Admin → Teachers**, or re-import via **Admin → Import → Teachers** (matched on email), and run the provisioner again so the co-organiser is applied.

## B4 — Two B.Com class groups have students but no classes
- **What:** `BCOM-S2` (1 student) and `BCOM-S4` (1 student) exist in the enrolment data, but the source timetable only schedules B.Com Semester 1.
- **Impact:** those two students see "no classes scheduled".
- **Needs:** either add their classes to the timetable (Admin → Import → Timetable slots, or the Sessions screen), or confirm those students are not taking online classes this term.

## B5 - Two class sessions are displaced and need a database write to repair
- **What:** the old E2E fixture moved a real class to "now" so the join journey had a live lesson, then
  restored it. A run that failed before the restore left the class displaced, and the next run captured
  the displaced time as the "original" - so it could never find its way back. Two sessions are affected:
  `MHS-S2 English Communication` and `MOD-S4 Dissertation`, both belonging to **Sunday 27 Sep 2026,
  09:00-10:00 IST**. They currently sit on Thu 24 Sep 2026 and show as "live now" to those students.
  One attendance row was written from a headless test browser.
- **Fixed at the source:** the suite no longer touches a real class. `loadFixture()` inserts a throwaway
  ad-hoc session (topic `E2E test class (safe to delete)`), uses that for the live-join journeys and
  deletes it afterwards; `makeLive()` refuses to update any row without that topic.
- **Needs:** one command, which writes to the live database:

      npm run data:verify              # dry run - shows what it would change
      npm run data:verify -- --apply   # restores both sessions, clears the test attendance row

  The dry run compares every session against `docs/ODL Sunday Online Timetable.xlsx` and reports
  anything off-Sunday or any date whose class count differs from the workbook. Worth running after any
  bulk edit.
