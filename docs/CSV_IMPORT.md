# CSV import guide

Admins can load every part of the setup from spreadsheets: **Admin → Import** (all entities, in order) or the "Import … from CSV" panel at the bottom of each admin page. Every panel has a **Download sample template** button that gives you a file with the exact header row and two example rows.

## General rules

- Save as **CSV (UTF-8)** from Excel or Google Sheets. The first line must be the header row; columns may be in any order; extra columns are ignored.
- Codes are upper-cased automatically; emails are lower-cased. Dates are `YYYY-MM-DD`; times are `HH:MM` 24-hour IST.
- Re-importing the same file is safe — rows are matched on the key shown under each section and are **updated or skipped, never duplicated**.
- Rows with problems are listed by line number after the import; the other rows are still processed.
- Files up to 2 MB; larger files should be split.
- Every import is recorded in the audit log (`<entity>.csv_import`).

## Recommended order

1. Programmes
2. Batches
3. Subjects
4. Batch subjects (offerings)
5. Teachers
6. Teacher assignments
7. Timetable slots
8. Holidays
9. Students

## Programmes

Degree programmes (e.g. BBA-ODL). Import these first.

Matched on: `code`

| Column | Required | Meaning |
|---|---|---|
| `code` | yes | Short unique code, letters/digits/-/_ (e.g. BBA-ODL) |
| `name` | yes | Full programme name |
| `is_active` | no | yes / no (default yes) |

- A row whose code already exists updates the name and active flag.

Template (`/admin/import/template/programs`):

```csv
code,name,is_active
BBA-ODL,Bachelor of Business Administration (ODL),yes
MBA-ODL,Master of Business Administration (ODL),yes
```

## Batches

Intake cohorts of a programme. Needs programmes to exist.

Matched on: `code`

| Column | Required | Meaning |
|---|---|---|
| `code` | yes | Unique batch code (e.g. BBA-ODL-2026) |
| `name` | yes | Display name |
| `program_code` | yes | Programme code |
| `intake_year` | yes | e.g. 2026 |
| `current_semester` | no | 1–12 (default 1) |
| `start_date` | no | YYYY-MM-DD |
| `end_date` | no | YYYY-MM-DD |
| `is_active` | no | yes / no (default yes) |

- A row whose code already exists is updated.
- program_code must match an imported programme.

Template (`/admin/import/template/batches`):

```csv
code,name,program_code,intake_year,current_semester,start_date,end_date,is_active
BBA-ODL-2026,BBA ODL 2026 intake,BBA-ODL,2026,1,2026-07-01,2029-06-30,yes
MBA-ODL-2026,MBA ODL 2026 intake,MBA-ODL,2026,1,2026-07-01,2028-06-30,yes
```

## Subjects

Subjects belong to a programme. Needs programmes to exist.

Matched on: `program_code + code`

| Column | Required | Meaning |
|---|---|---|
| `program_code` | yes | Programme code |
| `code` | yes | Subject code, unique within the programme (e.g. BBA101) |
| `name` | yes | Subject name |
| `credits` | no | 0–20 |

- A row whose programme + code already exists is updated.

Template (`/admin/import/template/subjects`):

```csv
program_code,code,name,credits
BBA-ODL,BBA101,Principles of Management,4
BBA-ODL,BBA102,Business Communication,3
```

## Batch subjects (offerings)

Which subject a batch studies in which semester. Needs batches and subjects.

Matched on: `batch_code + subject_code + semester`

| Column | Required | Meaning |
|---|---|---|
| `batch_code` | yes | Batch code |
| `subject_code` | yes | Subject code (from the batch’s programme) |
| `semester` | yes | 1–12 |
| `is_active` | no | yes / no (default yes) |

- The subject must belong to the batch’s programme.
- Existing batch + subject + semester rows are skipped.

Template (`/admin/import/template/batch_subjects`):

```csv
batch_code,subject_code,semester,is_active
BBA-ODL-2026,BBA101,1,yes
BBA-ODL-2026,BBA102,1,yes
```

## Teachers

Creates the faculty login (invite email) and profile.

Matched on: `email`

| Column | Required | Meaning |
|---|---|---|
| `employee_code` | yes | Unique staff code (e.g. T010) |
| `full_name` | yes | Name as shown to students |
| `email` | yes | Login email (receives the invite) |
| `entra_upn` | yes | Microsoft 365 UPN (e.g. name@srisriuniversity.onmicrosoft.com) |
| `department` | no | Free text |
| `phone` | no | Free text |

- Each new row creates an account and sends a "set your password" email; the teacher must set a 12-character password on first sign-in.
- Rows whose email already exists are skipped (edit them on the Teachers page).
- entra_upn is the teacher’s Microsoft 365 sign-in, used to add them as Teams co-organiser.

Template (`/admin/import/template/teachers`):

```csv
employee_code,full_name,email,entra_upn,department,phone
T010,Dr. Meera Krishnan,meera.krishnan@srisriuniversity.edu.in,meera.krishnan@srisriuniversity.onmicrosoft.com,Management,+91 90000 00010
T011,Prof. Arjun Sethi,arjun.sethi@srisriuniversity.edu.in,arjun.sethi@srisriuniversity.onmicrosoft.com,Finance,
```

## Teacher assignments

Who teaches which subject for which batch. Needs batch subjects and teachers.

Matched on: `batch_code + subject_code + teacher_email`

| Column | Required | Meaning |
|---|---|---|
| `batch_code` | yes | Batch code |
| `subject_code` | yes | Subject code |
| `teacher_email` | yes | Teacher login email |
| `is_primary` | no | yes / no (default yes) |

- Existing assignments are skipped.
- teacher_email is the teacher’s login email.

Template (`/admin/import/template/subject_teachers`):

```csv
batch_code,subject_code,teacher_email,is_primary
BBA-ODL-2026,BBA101,meera.krishnan@srisriuniversity.edu.in,yes
BBA-ODL-2026,BBA102,arjun.sethi@srisriuniversity.edu.in,yes
```

## Timetable slots

Weekly recurring classes. Needs batch subjects and teachers.

Matched on: `batch_code + subject_code + teacher_email + day + start_time + effective_from`

| Column | Required | Meaning |
|---|---|---|
| `batch_code` | yes | Batch code |
| `subject_code` | yes | Subject code (must be offered to the batch) |
| `teacher_email` | yes | Teacher login email |
| `day` | yes | Mon, Tue, Wed, Thu, Fri, Sat, Sun (or 1..6, 0) |
| `start_time` | yes | HH:MM IST |
| `end_time` | yes | HH:MM IST, after start |
| `effective_from` | yes | YYYY-MM-DD first date the slot applies |
| `effective_to` | no | YYYY-MM-DD last date (blank = open-ended) |

- Times are IST, 24-hour (e.g. 18:00). Day accepts Mon/Tue/... or 0–6 (0 = Sunday).
- A slot that clashes with an existing one (same teacher or same batch at an overlapping time) is rejected and reported.
- An identical slot (same batch subject, teacher, day, start time and start date) is skipped.
- Sessions are generated nightly from these slots for the next 21 days (or use "Generate sessions now").

Template (`/admin/import/template/timetable`):

```csv
batch_code,subject_code,teacher_email,day,start_time,end_time,effective_from,effective_to
BBA-ODL-2026,BBA101,meera.krishnan@srisriuniversity.edu.in,Mon,18:00,19:00,2026-07-01,
BBA-ODL-2026,BBA102,arjun.sethi@srisriuniversity.edu.in,Wed,18:00,19:00,2026-07-01,2026-12-31
```

## Holidays

No sessions are generated on these dates.

Matched on: `date + batch_code`

| Column | Required | Meaning |
|---|---|---|
| `date` | yes | YYYY-MM-DD |
| `name` | yes | Holiday name |
| `batch_code` | no | Batch code, or empty for all batches |

- Leave batch_code empty for a holiday that applies to every batch.
- An existing date (for the same batch / all batches) is updated with the new name.

Template (`/admin/import/template/holidays`):

```csv
date,name,batch_code
2026-10-02,Gandhi Jayanti,
2026-11-08,Study break,MBA-ODL-2025
```

## Students

Creates student records mapped to a batch. Students then sign in with Google.

Matched on: `email`

| Column | Required | Meaning |
|---|---|---|
| `roll_number` | yes | Unique roll number |
| `full_name` | yes | Student name |
| `email` | yes | University Google account |
| `phone` | no | Free text |
| `batch_code` | yes | Batch code |
| `status` | no | active / on_hold / withdrawn / graduated |

- email must be @srisriuniversity.edu.in; students never get a password.
- A row whose email already exists but is not yet mapped to a batch is mapped (roll number + batch); a fully mapped student is skipped.
- status: active, on_hold, withdrawn, graduated (default active).

Template (`/admin/import/template/students`):

```csv
roll_number,full_name,email,phone,batch_code,status
ODL26BBA010,Nikhil Rao,nikhil.rao.odl26@srisriuniversity.edu.in,+91 98000 00010,BBA-ODL-2026,active
ODL26BBA011,Priya Menon,priya.menon.odl26@srisriuniversity.edu.in,,BBA-ODL-2026,active
```
