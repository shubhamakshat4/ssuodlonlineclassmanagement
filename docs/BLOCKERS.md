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
- **Note:** those mailboxes do not exist, so an invite email never arrives. Set a password directly with
  `npm run auth:set-password -- <login email> '<password>'` if a faculty member has to sign in before IT
  supplies the real address.
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

## B6 - The admin portal password was published in a public repository - RESOLVED (25 Sep 2026)
- **What:** `github.com/shubhamakshat4/ssuodlonlineclassmanagement` is publicly readable, and the repo
  carried `AdminPass12345` for `odl.admin@srisriuniversity.edu.in` in `e2e/helpers.ts`,
  `scripts/smoke-cloud.ts`, `README.md`, `docs/DEMO.md` and `supabase/seed.sql`. It was written as a
  local/test password, but the live cloud project uses the same one, so it is a real credential.
- **Done:** the suites now read `E2E_ADMIN_PASSWORD`, `E2E_TEACHER_PASSWORD` and
  `E2E_SEED_TEACHER_PASSWORD` from `.env.local` (placeholders in `.env.local.example`); README and DEMO.md
  no longer print the password.
- **Needs (user):** give the account a new password, then update `E2E_ADMIN_PASSWORD` in `.env.local` and
  anywhere it was shared (the email to the ODL team). Removing it from the repository does not remove it
  from git history, so rotation is the fix. Two ways, neither needing an email:
  - **In the portal** - sign in as the admin and use **Change password** in the header (`/account/password`).
  - **From the command line**, for an account whose password is unknown or whose mailbox does not exist:

        npm run auth:set-password -- odl.admin@srisriuniversity.edu.in 'NewPassword2026'

  The Supabase dashboard only offers "send a recovery email", which cannot work while the ODL admin address
  is not a real mailbox. `supabase/seed.sql`
  still contains it as the password its own local fixture creates; that is fine once the live account no
  longer uses it.

## B7 - The September 2026 changes are written but not yet on the live project
Everything below is code and migrations that are committed and tested against a fresh database. None
of it has been applied to the cloud project, because that needs a write to shared infrastructure.
Run these in order, from the project folder:

    npm run db:migrate                     # adds college_email / personal_email, nullable roll_number,
                                           # the security-question tables, and the ODL-office-only sign-up rule
    npm run auth:config -- --apply         # password minimum 12 -> 8 (srisri@26 is 9), Google provider off
    npm run data:fix-emails                # dry run: shows every login it would correct
    npm run data:fix-emails -- --apply     # replaces the 286 invented logins with the real addresses

Then set the first-login password on the accounts that were created without one:

    npm run auth:set-password -- <login email> 'srisri@26'

Until `db:migrate` has run, the app will not show a student their classes: the code reads
`students.college_email`, which does not exist on the live database yet. Three Playwright journeys fail
for exactly this reason and pass again once the migration is applied.

## B8 - Invented student identifiers are still on the live database
- **What:** the first import generated an `@srisriuniversity.edu.in` login for the 286 August 2026
  admissions (for example `sayed.tafazul.tmp-bba-aug2026-0352@srisriuniversity.edu.in`) and `TMP-...`
  roll numbers for everyone without one. Those addresses do not exist and never did.
- **Fixed in code:** nothing is generated any more. `college_email` and `personal_email` are stored
  separately and left blank when the workbook is blank, `roll_number` is nullable, and the login is the
  college address when there is one and the personal address otherwise - see `docs/STUDENT_ACCOUNTS.md`.
- **Needs:** `npm run data:fix-emails -- --apply` (see B7), which reads the workbooks in `docs/` and
  replaces each invented login with the student's real address.

