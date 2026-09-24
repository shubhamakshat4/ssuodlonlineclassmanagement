# Demo guide

The Supabase project `acflzvfiochinjuprrew` now holds the full schema plus demo data. The app runs locally
against it; nothing is deployed to Vercel yet.

## Start the app
```bash
npm ci            # once
npm run dev       # http://localhost:3000   (or: npm run build && npx next start -p 3100 if 3000 is busy)
```

## Accounts

| Role | Email | Password |
|---|---|---|
| Admin | `odl.admin@srisriuniversity.edu.in` | `AdminPass12345` |
| Admin | `demo.admin@srisriuniversity.edu.in` | `DemoAdmin12345` |
| Faculty | the 21 real faculty, e.g. `jharana.rani@srisriuniversity.edu.in` | **placeholder logins** — no password set until IT supplies real addresses (see `docs/BLOCKERS.md` B3) |
| Student | their real `@srisriuniversity.edu.in` Google account | Google sign-in only, no password |

To let a specific teacher test now, set a password for them in Supabase → Authentication → Users, or run the
E2E helper which does it for one account.

## What is in the data
- **Real ODL data** (loaded 24 Sep 2026 from the workbooks in `docs/`): 6 programmes, 20 class groups
  (programme + semester), 98 subjects, 21 faculty, 637 students, and 331 dated classes across the 16 Sundays
  from 13 Sep to 27 Dec 2026.
- Every upcoming class has a **real Microsoft Teams link** created by the provisioner.
- Students follow one class group and can be given a second one (Admin → Students → "Second class group")
  when they are catching up on a semester; both timetables then appear.

## Suggested 15-minute script
1. Admin → Overview tiles → Programmes/Batches → open BBA-ODL-2025 (subjects, teachers, roster).
2. Admin → Timetable: add a clashing slot for Dr. Anand on Monday 10:30 → rejected with the clash message.
3. Admin → Sessions: "Generate sessions now" (idempotent — 0 new), add an extra class starting in 15 minutes.
4. Teacher (Anand) → Today: the new class; *Edit link / roster*; paste a real Meet/Zoom link → warning about recording → save → "Link updated".
5. Admin → Attendance report for BBA-ODL-2025 → Download CSV. Audit log shows every step above.
6. Sync health: the failed example + Retry; explain that "Run provisioner now" goes live with the Microsoft credentials.

## Not live until IT delivers the Microsoft items (`docs/IT_REQUEST_EMAIL.md`)
- **real** Teams meeting creation — the Edge Functions and cron are deployed and running, but in `GRAPH_MODE=mock`, so new sessions receive fake `…/meetup-join/mock/…` links automatically (same idea as the placeholders)
- recording harvest and playback
- (Google sign-in is configured and working.)

## Going live later
```bash
npm run demo:reset-links   # removes placeholder links and re-queues those sessions for real provisioning
```
Then deploy the Edge Functions and secrets (docs/RUNBOOK.md §1). Real meetings replace the placeholders on the next provisioner run.

## Refreshing the demo data
`npm run demo:seed` is safe to re-run: it skips the base seed when data exists, adds any missing demo rows,
extends sessions to 21 days ahead, and gives new sessions placeholder links. To start over completely, reset the
database from the Supabase dashboard and run `npm run db:migrate && npm run demo:seed`.
