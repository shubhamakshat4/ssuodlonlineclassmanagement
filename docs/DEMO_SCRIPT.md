# Testing the portal, and demonstrating it

Companion to `docs/SSU_ODL_Portal_Demo.pptx`. Portal: **https://ssuodlonlineclassmanagement.vercel.app**

---

## 0. One command first — nothing works without it

637 students and 15 faculty have an account but **no password**, because the portal used to sign
students in with Google. From the project folder:

    npm run auth:first-passwords              # dry run: counts who would get one
    npm run auth:first-passwords -- --apply    # sets srisri@26 on all 652

Everyone it touches is asked to choose their own password at first sign-in. Anyone who has already
chosen one is skipped.

## Credentials

| Who | Signs in with | Password |
|---|---|---|
| Student | **either** their college email **or** their personal email | `srisri@26` at first sign-in, then their own |
| Faculty | their login email on **Admin → Teachers** | `srisri@26` at first sign-in, then their own |
| Admin | `odl.admin@srisriuniversity.edu.in` | the value of `E2E_ADMIN_PASSWORD` in your `.env.local` |

To pick a student to demo with, open **Admin → Students** — the list shows the address each account is
held under and whether a college email has been issued. 350 students have both addresses; 286 have only
a personal one.

If anyone is locked out: **Admin → Students → [student] → Password**, or
`npm run auth:set-password -- <email> '<password>'`.

---

## Quick test — about 15 minutes

### As a student
1. Sign in with the **college** email. Sign out, sign in again with the **personal** email. Both should work with the same password.
2. First sign-in asks for a new password, then two security questions.
3. **My classes** — today, and the next 14 days.
4. **Timetable** — every class for the term. A student repeating a semester sees both.
5. Press **Join Now** on a future class: it should say when the window opens, not grey out.
6. **Recordings**, **Profile** — profile shows both addresses; one may read "Not issued yet".
7. Sign out, then **Forgotten password** → answer the security questions → set a new one. No email involved.

### As a faculty member
1. Sign in. Only their own classes should be listed.
2. **Upcoming → Edit link / roster**: paste a Google Meet or Zoom link, save. The student's card shows "Link updated".
3. **Revert to auto-generated Teams link** — a fresh Teams meeting is queued.
4. Try opening a colleague's class by changing the URL: it must return "not found".

### As the ODL office
1. **Students** — filter by class group, search, open one, edit, set a password.
2. **Import** — download a template, upload a small CSV, read the per-line report.
3. **Sessions** — add an extra class, reschedule one, cancel one.
4. **Attendance** — pick a class group and a date range, download the CSV.
5. **Sync health** — every upcoming class should say provisioned.
6. **Audit log** — your own changes should be listed.

### Worth checking
- On a phone as well as a laptop.
- A student must never see another class group's classes or recordings.

---

## The demo — about 10 minutes

Rehearse once. Create the extra class about ten minutes before you begin.

**Before the room fills:** in **Admin → Sessions → Add an extra class**, create a class for a group you
have a student login for, starting a few minutes from now. Check **Sync health** shows it provisioned.

1. **Landing page** (30s) — the building, the name, one button. Nothing to explain.
2. **Student** (3m) — sign in, today's classes, the full timetable, then **Join Now** on the live class.
   Teams opens and the join is recorded.
3. **Faculty** (2m) — their own classes; replace the link with a Google Meet one and show the student's
   card updating; revert.
4. **Admin** (3m) — students and class groups, the timetable, then **Attendance** showing the student who
   just joined, and the CSV download.
5. **Close** (1m) — what is left: faculty Microsoft addresses from IT, and the ODL team's testing.

**If Teams is slow:** the meeting is created by a job that runs every few minutes. If it has not
appeared, open the class in **Admin → Sessions** and paste any meeting link as an override. The demo
continues identically.

---

## Say this about what is not ready

> Classes are created in Microsoft Teams automatically and students can join them today. The one thing
> outstanding is that the teacher is not yet named as co-organiser on the meeting, because IT has not
> sent us the faculty Microsoft 365 addresses. Until then a teacher joins like anyone else, or uses their
> own meeting link, which the portal supports.

Also outstanding: B.Com semesters 2 and 4 have one student each but no classes in the source timetable,
and 286 students have no roll number yet.
