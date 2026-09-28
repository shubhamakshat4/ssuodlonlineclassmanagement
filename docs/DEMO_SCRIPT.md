# Testing the portal, and demonstrating it

Companion to `docs/SSU_ODL_Portal_Demo.pptx`. Portal: **https://ssuodlonlineclassmanagement.vercel.app**

> **The deck is not in this repository, on purpose.** It lists live sign-in details and names real
> students, and this repository is public. `docs/*.pptx` is gitignored; the file is in your local
> `docs/` folder. Keep it inside the university.

## Accounts

All 661 accounts have a password. Students and faculty share the same first-login password, and the
portal makes each of them change it the first time they sign in. The specific accounts used in the demo
are on slide 3 of the deck — they are deliberately not repeated here.

| Who | Signs in with |
|---|---|
| Student | **either** their college email **or** their personal email — same password |
| Faculty | their login email, as shown on **Admin → Teachers** |
| Admin | `odl.admin@srisriuniversity.edu.in`, password in `E2E_ADMIN_PASSWORD` in your `.env.local` |

To find an account to test with, open **Admin → Students** or **Admin → Teachers**: the list shows the
address each account is held under. 350 students have both addresses; 286 have only a personal one.

If someone is locked out: **Admin → Students → [student] → Password**, or
`npm run auth:set-password -- <email> '<password>'`.

---

## Student

### Use case 1 — find today's class and join it
1. Open the portal, press **Sign in**, enter a student email and the first-login password.
2. First time only: set a new password, then choose two security questions.
3. Read the **Today** panel — subject, faculty and time in IST, with a live class marked.
4. Press **Join Now**. Teams opens in a new tab and the join is recorded.
5. Press it on a class later in the week: it does not grey out, it says when the window opens
   (15 minutes before the class).

*Expect:* only their own class group, and "Coming up" for the next 14 days.

### Use case 2 — timetable, recordings, forgotten password
1. **Timetable** — every class for the term, grouped by day, with the weekly pattern.
2. A student repeating a semester sees both groups, tagged Primary and Additional.
3. **Recordings** — the last 30 days, their own group only.
4. **Profile** — roll number, programme, and both addresses. One may read "Not issued yet".
5. Sign out → **Forgotten password** → answer the two questions → set a new one. No email is sent.

### Use case 3 — sign in with the other address
Sign out and sign in again with the student's *other* email address and the **same** password. It is one
account either way.

---

## Faculty

### Use case 1 — see my classes and open one
1. Sign in; set a password and security questions when asked.
2. **Today** and **Upcoming** list only their own classes, across every group they teach.
3. **Timetable** — their week for the whole term.
4. **Edit link / roster** on a class — topic, meeting link, student roster.
5. Change the class id in the address bar to a colleague's: the portal returns **not found**.

### Use case 2 — use my own meeting link
1. Open an upcoming class → **Edit link / roster**.
2. Paste a Google Meet or Zoom link. A warning appears that no recording will be available.
3. Press **Use this link instead of Teams**.
4. On the student's screen the class shows a **Link updated** badge, and Join Now opens the new link.
5. Press **Revert to auto-generated Teams link** — a fresh Teams meeting is queued.

---

## ODL office (admin)

### Use case 1 — manage a student
1. **Students** — filter by class group, or search by name or email. Fifty to a page.
2. Press **Edit** on a row: name, both emails, phone, roll number, class group, status.
3. Add a **second class group** for a student repeating a semester.
4. **Set a password** on the same page for someone locked out.
5. Create a new student with the form on the right — a college email, a personal email, or both.

### Use case 2 — load data in bulk
1. **Import from CSV**, on Students and on every other catalogue page.
2. Download the **sample template** — every column named, with notes on what may be left blank.
3. Upload the filled file. Rows match on email, so re-uploading updates rather than duplicates.
4. Read the report: created, updated, skipped, and a message per rejected line.

### Use case 3 — change the timetable
1. **Sessions** — every class with its Teams status and link.
2. **Add an extra class** — the Teams meeting is created automatically.
3. **Reschedule** — the meeting moves, so the link stays the same.
4. **Cancel** — students see it as cancelled and the meeting is released.
5. **Holidays** — no classes are generated on that date.

### Use case 4 — check that it happened
1. **Attendance** — class group and date range, joined out of total, CSV download.
2. **Sync health** — every upcoming class and its Teams status, with a retry.
3. **Audit log** — who changed what, and when.

---

## Staging a live class for the demo

Classes run on Sundays, so on a weekday nothing is live. Ten minutes before you start:

1. **Admin → Sessions → Add an extra class** — a group you have a student login for, starting a few
   minutes from now.
2. Wait until **Sync health** shows it provisioned.
3. Sign in as a student of that group: it appears under Today, marked live.
4. Press **Join Now**; Teams opens and the join is recorded.
5. **Admin → Attendance** now lists that student as joined.

**If Teams is slow:** the meeting is created by a job that runs every few minutes. If it has not
appeared, open the class in **Admin → Sessions** and paste any meeting link as an override. The demo
continues identically.

---

## What to say about what is not ready

> Classes are created in Microsoft Teams automatically and students can join them today. The one thing
> outstanding is that the teacher is not yet named as co-organiser on the meeting, because IT has not
> sent us the faculty Microsoft 365 addresses. Until then a teacher joins like anyone else, or uses their
> own meeting link, which the portal supports.

Also outstanding: B.Com semesters 2 and 4 have one student each but no classes in the source timetable,
and 286 students have no roll number yet.
