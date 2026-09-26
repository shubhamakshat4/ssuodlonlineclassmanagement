# Student accounts, emails and passwords

## Two email fields, neither invented

A student record carries both addresses separately, and either may be blank:

| Field | Source column in the workbooks | Blank when |
|---|---|---|
| `college_email` | `SSU Email Id` | the university has not issued one |
| `personal_email` | `Email Id` | the workbook has none |

**Either address signs them in, with the same password.** Supabase Auth holds one email per account,
so the two cannot both be login identities; instead `resolveLoginEmail()` translates whichever address
was typed into the one the account is held under, before authentication happens. It stays one account
with one password - there is no second account to keep in step, and changing the password changes it
for both addresses. The account is held under the college address when there is one, otherwise the
personal one.

Nothing is ever generated. `roll_number` is blank the same way, for admissions the university has not
issued one for.

If a personal address were ever shared by two students, sign-in refuses rather than guessing which
account was meant, and asks them to use their college address. (No address is shared today.)

As the source workbooks stand today:

| Cohort | Students | Have an SSU address | Have a personal address |
|---|---|---|---|
| Feb 2025, Aug 2025, Feb 2026 | 351 | 350 | 349 |
| August 2026 admissions | 286 | 0 | 286 |

The first import invented an `@srisriuniversity.edu.in` login for everyone in the second row, and a
`TMP-…` roll number for anyone without one. `npm run data:fix-emails` undoes that — see BLOCKERS B7.

## Signing in

Everyone — student, faculty, admin — signs in at `/login` with an email and a password. Google
sign-in has been removed.

* **First password.** New students are created with the password in `STUDENT_DEFAULT_PASSWORD`
  (`srisri@26` unless it is overridden), and `must_change_password`, so the portal sends them to
  `/account/password` before they can see anything else.
* **After that** they are asked to choose two security questions, which is what makes a self-service
  reset possible later.
* **Change password** is in the header of every page, for every role.

## Forgotten passwords

`/login/reset` asks for the email address, shows the two questions that account chose, and sets a new
password once both are answered. Nothing is emailed.

This is deliberate. Supabase's built-in mailer is rate limited to a couple of messages an hour and, on
a new project, will only deliver to project members — it cannot serve a 600-student cohort. Configure
your own SMTP in the Supabase dashboard if you also want the emailed reset link to work; the security
questions work either way and need no mail server at all.

Answers are hashed with bcrypt inside the database (`set_security_answer`) and checked inside the
database (`check_security_answer`), so no hash ever reaches the application, let alone a browser.
Capitalisation and surrounding spaces are ignored. Both steps are rate limited per IP and per address.

## When somebody cannot sign in at all

An administrator sets a new password for them. **Passwords are not stored in the portal and cannot be
read back by anyone** — Supabase Auth keeps only a one-way bcrypt hash, which is what protects the
account if the database is ever copied or leaked. So "show me their password" is not something the
system can do, for an admin or for anybody else. Setting a new one does the same job:

* **Admin → Students → [student] → Password** — set one and tell them. They are asked to change it at
  their next sign-in.
* From a terminal, for any account including faculty:

      npm run auth:set-password -- someone@srisriuniversity.edu.in 'NewPassword26'

  This works for the 21 faculty placeholder logins whose mailboxes do not exist, so no invite email is
  needed.

Every password an administrator sets is recorded in the audit log (`student.password_set`), which a
stored plaintext column could never give you.

## Policy

Minimum 8 characters, at least one letter and one digit, no leading or trailing space
(`src/lib/auth/password.ts`). GoTrue enforces the same minimum, so `supabase/config.toml` and the
project's auth settings must agree — `npm run auth:config -- --apply` sets them.
