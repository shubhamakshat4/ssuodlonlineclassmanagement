# Demo guide

The Supabase project `acflzvfiochinjuprrew` now holds the full schema plus demo data. The app runs locally
against it; nothing is deployed to Vercel yet.

## Start the app
```bash
npm ci            # once
npm run dev       # http://localhost:3000   (or: npm run build && npx next start -p 3100 if 3000 is busy)
```

## Demo accounts (all invented, password sign-in at `/login`)

| Role | Email | Password | Shows |
|---|---|---|---|
| Admin | `odl.admin@srisriuniversity.edu.in` | `AdminPass12345` | everything |
| Admin | `demo.admin@srisriuniversity.edu.in` | `DemoAdmin12345` | second admin for the demo team |
| Teacher | `anand.mishra@srisriuniversity.edu.in` | `TeacherPass12345` | Financial Management (BBA-2025) + Strategic Management (MBA-2025) |
| Teacher | `kavita.sen@srisriuniversity.edu.in` | `TeacherPass12345` | Marketing Management + Operations Research |
| Teacher | `rohit.verma@srisriuniversity.edu.in` | `TeacherPass12345` | forced password change on first login (demo of the invite flow) |
| Student | `akshat.s@srisriuniversity.edu.in` | Google sign-in only | BBA-ODL-2025 dashboard — **needs the Google provider configured** (see below) |

Students never have passwords. The 16 other seeded students are fictional addresses and cannot sign in.

## What is in the data
- 2 programmes, 3 batches, 6 subjects, 3 teachers, 17 students, 11 weekly timetable slots, 3 holidays.
- Sessions for the next 21 days, generated from the timetable exactly as the nightly job will do it.
- Every upcoming session has an **editable placeholder link** `https://teams.microsoft.com/l/meetup-join/demo/…` and shows as "Teams ready".
  These are not real meetings. To demo a real join, create any Teams/Meet/Zoom meeting yourself and paste it as an override
  (teacher: *Edit link / roster*; admin: *Override link* on `/admin/sessions`).
- One session is deliberately in the **failed** state so `/admin/sync-health` has something to show.
- Two past classes have recordings rows (one available, one expired) so the student Recordings tab and the RLS expiry rule can be shown; playback needs Graph credentials.

## Suggested 15-minute script
1. Admin → Overview tiles → Programmes/Batches → open BBA-ODL-2025 (subjects, teachers, roster).
2. Admin → Timetable: add a clashing slot for Dr. Anand on Monday 10:30 → rejected with the clash message.
3. Admin → Sessions: "Generate sessions now" (idempotent — 0 new), add an extra class starting in 15 minutes.
4. Teacher (Anand) → Today: the new class; *Edit link / roster*; paste a real Meet/Zoom link → warning about recording → save → "Link updated".
5. Admin → Attendance report for BBA-ODL-2025 → Download CSV. Audit log shows every step above.
6. Sync health: the failed example + Retry; explain that "Run provisioner now" goes live with the Microsoft credentials.

## Not live until IT delivers the Microsoft items (`docs/IT_REQUEST_EMAIL.md`)
- automatic Teams meeting creation (placeholders are used instead)
- recording harvest and playback
- Google sign-in for students also needs the Google OAuth client (Part 4 of the IT email) entered in
  Supabase → Authentication → Providers → Google, plus **Sign-ups disabled** and the **before_user_created hook** enabled.

## Going live later
```bash
npm run demo:reset-links   # removes placeholder links and re-queues those sessions for real provisioning
```
Then deploy the Edge Functions and secrets (docs/RUNBOOK.md §1). Real meetings replace the placeholders on the next provisioner run.

## Refreshing the demo data
`npm run demo:seed` is safe to re-run: it skips the base seed when data exists, adds any missing demo rows,
extends sessions to 21 days ahead, and gives new sessions placeholder links. To start over completely, reset the
database from the Supabase dashboard and run `npm run db:migrate && npm run demo:seed`.
