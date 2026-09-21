# Manual verification checklist

Work through these in order. Each item says what to do and what a pass looks like. Items 1–4 unblock
everything after them.

## A. Environment (30 min)

1. **Fill `.env.local`** — `SUPABASE_SERVICE_ROLE_KEY`, all `MS_*`, `GRAPH_MODE=real`, `SPIKE_TEACHER_UPN` (a test mailbox), `NEXT_PUBLIC_SITE_URL`.
   *Pass:* `npm run typecheck && npm test` still green (tests do not use these values).
2. **Apply the schema to the cloud project** — `supabase login`, `supabase link --project-ref acflzvfiochinjuprrew`, `supabase db push`.
   *Pass:* no errors; in the SQL editor `select count(*) from pg_policies where schemaname='public';` returns 40+ rows and `select * from cron.job;` lists five `ssu-*` jobs.
3. **Vault + hook + provider settings** — follow `docs/RUNBOOK.md` §1 steps 2–3.
   *Pass:* `select name from vault.decrypted_secrets;` shows `project_url`, `service_role_key`; Authentication → Hooks shows `before_user_created_hook` enabled; Google provider enabled; sign-ups disabled.
4. **Deploy Edge Functions + secrets** — `supabase functions deploy …`, `supabase secrets set …` (RUNBOOK §1 step 1).
   *Pass:* `curl -X POST https://<ref>.supabase.co/functions/v1/cron-generate-sessions -H "Authorization: Bearer <service role key>"` returns `{"ok":true,…}`; without the header it returns 401.

## B. Microsoft Graph (the load-bearing check, 20 min)

5. **Run the spike** — `npm run graph:spike` with `GRAPH_MODE=real`.
   *Pass:* `docs/GRAPH_SPIKE_LOG.md` ends with **VERDICT: GREEN** and "Step 3 meeting options: OK with recordAutomatically=true", the `[TEST]` event disappears from the service account calendar (cleanup). If step 3 says "REJECTED" → set `GRAPH_RECORDING_MODE=manual` in function secrets and note it in `docs/BLOCKERS.md`. If step 1 is 403 → IT must grant the application access policy (`docs/M365_SETUP.md`); re-run after 30 min.
6. **Co-organiser with a real second user** — re-run the spike with `SPIKE_TEACHER_UPN` set to a test teacher account (not real faculty). Open the created meeting in the test teacher's Teams calendar before cleanup (add `--keep`? no: set a breakpoint by commenting the delete, or simply check the Teams invite email that arrives).
   *Pass:* the test teacher receives the invite and shows as co-organizer in meeting options.

## C. Admin flows (45 min) — sign in at `/login` as an admin

7. **Create catalogue** — one programme, one batch (`TEST-2026`), one subject; on the batch page add the subject for semester 1.
   *Pass:* rows appear; the audit log (`/admin/audit-log`) shows `program.created`, `batch.created`, `subject.created`, `batch_subject.created`.
8. **Create a teacher** using the test M365 UPN.
   *Pass:* invite email arrives; clicking it lands on "Set a new password"; a password shorter than 12 characters is refused; after setting one, `/teacher` loads. Google sign-in with that teacher's address is refused with "Google sign-in is only available to students".
9. **Create a student** with a real `@srisriuniversity.edu.in` test address; also try a `@gmail.com` address.
   *Pass:* the gmail address is rejected in the form; the university address is created and shows on `/admin/students`.
10. **CSV import** — Admin → Import: download the Programmes template, upload it unchanged, then upload it again.
    *Pass:* first run "2 created", second run "2 updated"; a timetable file with a clashing slot reports "Teacher clash …" for that line and still creates the other rows.
11. **Timetable** — add a slot for tomorrow's weekday; then add an overlapping slot for the same teacher in another batch.
    *Pass:* second slot is rejected with "Teacher clash: …"; first appears in the week grid.
12. **Holidays** — add a holiday on the slot's next date, then `/admin/sessions` → "Generate sessions now".
    *Pass:* the message shows inserted count; no session on the holiday date; other dates present with "pending". Remove the holiday, generate again → the missing date appears.
13. **Provisioning** — wait ≤10 min or `/admin/sync-health` → "Run provisioner now".
    *Pass:* sessions show "Teams ready" with a `teams.microsoft.com` link; `/admin/sync-health` "Recent Graph calls" lists 2xx rows; the service account calendar has the events with the teacher as attendee.
14. **Reschedule** a provisioned session by +1 hour.
    *Pass:* after the next provisioner run the calendar event moved and the join link is unchanged.
15. **Cancel** a session.
    *Pass:* status "cancelled"; after the next run the calendar event is gone and the meeting badge shows "cancelled".
16. **Add an extra class** for today, starting in 15 minutes.
    *Pass:* appears with the "extra" badge and gets a Teams link within 10 minutes.

## D. Student flows (30 min) — use the test student's Google account in a private window

17. **Google sign-in** at `/login/student`.
    *Pass:* lands on `/student` with the batch name; a personal Gmail account is bounced to the error page with "Please sign in with your @srisriuniversity.edu.in account".
18. **Join window** — with the extra class from step 16: before T−10 the button reads "Opens in …"; at T−10 it becomes "Join Now".
    *Pass:* clicking opens Teams in a new tab; you are **not** held in the lobby (this validates §3.4 — do it from a device outside the tenant); `/admin/attendance` for the batch shows a tick; second click does not create a second row (report still shows one tick).
19. **Recording** — record the meeting (auto-recording should start; otherwise the teacher starts it), end the meeting, wait for the hourly harvest (or curl `cron-harvest-recordings`).
    *Pass:* `/student/recordings` lists the class with "30 days left"; "Watch" plays inline and seeking works; `audit_log` has `recording.played`. In the SQL editor set `expires_at = now()` on that row → the recording disappears from the student's list and `/student/recordings/<id>` is 404.

## E. Teacher flows (20 min) — sign in as the test teacher

20. **Override** — on the extra class, set `https://meet.google.com/abc-defg-hij`.
    *Pass:* the recording warning is shown before saving; after saving the page shows "Link updated"; the student's dashboard shows the badge and Join opens the Meet URL; the calendar event is deleted after the next provisioner run; `audit_log` has `session.override_set` with the teacher as actor.
21. **Revert** — "Revert to auto-generated Teams link".
    *Pass:* student sees "Link not ready yet" until the next run, then a fresh Teams link.
22. **Boundaries** — try to open a colleague's session URL; try to edit a session that has ended.
    *Pass:* 404 for the colleague's session; "can no longer be changed" for the ended one.

## F. Operations (15 min)

23. **Attendance CSV** — download for the test batch.
    *Pass:* opens in Excel with a row per student per class and `joined_from_portal` Y/N; `audit_log` has `attendance.exported`.
24. **Rate limit** — fail the teacher login 9 times in a row.
    *Pass:* the 9th attempt says "Too many sign-in attempts".
25. **Cron health** — next morning check `select * from cron.job_run_details order by start_time desc limit 10;`.
    *Pass:* `ssu-generate-sessions` and `ssu-provision-meetings` ran with status `succeeded`; `/admin/sessions` shows 21 days of sessions.
26. **Rotate** the Entra client secret and the Supabase service-role key (RUNBOOK §5) before go-live.
    *Pass:* provisioner still green after rotation.
