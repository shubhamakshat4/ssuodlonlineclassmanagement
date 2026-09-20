# Google sign-in for students — setup, step by step

**The rule (as decided 21 Sep 2026):**
- Students sign in with Google. Any `@srisriuniversity.edu.in` account is accepted; every other domain is rejected server-side.
- A student sees their timetable only after an admin maps them to a batch. Until then the dashboard says **"No classes are assigned to you yet — contact the ODL department"**.
- Faculty and admins sign in with email + password only; Google is blocked for them.

Everything in the portal for this is already built and deployed. What remains is creating a Google OAuth client and pasting two values into Supabase. Steps 1–7 need a **Google Workspace admin** for `srisriuniversity.edu.in` (or anyone allowed to create projects in Google Cloud for that organisation). Steps 8–10 need the Supabase dashboard.

## Part A — Google Cloud (10 minutes)

1. Go to **https://console.cloud.google.com** and sign in with a `@srisriuniversity.edu.in` account that can create projects.
2. Top bar → project selector → **New project** → name **SSU ODL Portal** → Create. Wait for it, then select it.
3. Left menu → **APIs & Services → OAuth consent screen** (Google may call this "Branding" under *Google Auth Platform*).
   - Audience / User type: **Internal** (only university accounts can use it — this is the first line of the domain rule).
   - App name: **SSU ODL Classes**
   - User support email: the ODL office address
   - Developer contact email: the ODL office address
   - Save.
4. **APIs & Services → Credentials → + Create credentials → OAuth client ID**.
   - Application type: **Web application**
   - Name: **SSU ODL Portal**
   - Under **Authorised JavaScript origins** click *Add URI* and enter:
     - `https://acflzvfiochinjuprrew.supabase.co`
   - Under **Authorised redirect URIs** click *Add URI* and enter exactly:
     - `https://acflzvfiochinjuprrew.supabase.co/auth/v1/callback`
   - Click **Create**.
5. A box shows **Client ID** (ends in `.apps.googleusercontent.com`) and **Client secret**. Copy both somewhere safe. You can reopen them later from the Credentials list.
6. If the consent screen shows a **Publishing status: Testing** banner, click **Publish app** (Internal apps do not need Google review).
7. Nothing else is needed in Google. No scopes beyond the defaults (email, profile, openid) are used.

## Part B — Supabase dashboard (5 minutes)

8. Go to **https://supabase.com/dashboard/project/acflzvfiochinjuprrew/auth/providers** → **Google**.
   - Enable: **On**
   - Client ID: paste from step 5
   - Client Secret: paste from step 5
   - Leave "Skip nonce check" off. Save.
9. **Authentication → URL Configuration**:
   - Site URL: the address students will use (for now `http://localhost:3000`; later the real domain, e.g. `https://classes.srisriuniversity.edu.in`).
   - Redirect URLs: add `<site url>/auth/callback` for every address the app is served from. (`http://localhost:3000/auth/callback` and `http://localhost:3100/auth/callback` are already there.)
10. Confirm these are set (applied by script): **Authentication → Sign In / Providers → "Allow new users to sign up" = ON** and **Authentication → Hooks → Before User Created = enabled, `public.before_user_created_hook`**.
    The global switch must stay **ON**: when it is off, Supabase refuses a first-time Google student with "Signups not allowed for this instance" before our rules run. The hook is what decides who gets an account: university Google accounts yes, other domains no, email/password only when created by the admin (the Admin API stamps `app_metadata.provisioned_by`, which the public sign-up API cannot set).

## Part C — Try it (2 minutes)

11. Open the portal → **Student sign in (Google)** → choose your `@srisriuniversity.edu.in` account.
    - First time: Google asks for consent once.
    - You land on `/student`. If nobody has mapped you yet you see **"No classes are assigned to you yet — contact the ODL department"** with your email.
12. As admin, open **/admin/students** → the yellow **"Signed in but not mapped"** box lists you → enter roll number, choose batch → **Map to batch**. Refresh the student tab: timetable appears.
13. Try a personal Gmail: Google may not even offer it (Internal app); if it does, the portal bounces it with *"Please sign in with your @srisriuniversity.edu.in account."*
14. Try Google with a teacher's address (e.g. `anand.mishra@…`): rejected with *"Google sign-in is only available to students."*

## What the pieces do (for whoever maintains this)

| Layer | Where | Role |
|---|---|---|
| Google consent screen = Internal | Google Cloud | Google itself refuses accounts outside the Workspace |
| `hd=srisriuniversity.edu.in` hint | `src/app/login/student/google-button.tsx` | pre-selects the university account in the chooser (hint only, never trusted) |
| `before_user_created_hook` | DB function, enabled in Supabase Auth Hooks | rejects Google sign-ups outside the domain, and any email/password sign-up not made by the admin API |
| `auth.users` insert trigger | DB | Google-domain rule again, in case the hook is ever disabled |
| `auth.users` after-insert trigger | DB | creates the `student` profile automatically (no batch) |
| `auth.identities` insert trigger | DB | blocks Google on teacher/admin accounts and wrong-domain identities |
| RLS | DB | an unmapped student can read nothing; mapping (`students` row) turns everything on |
| `/admin/students` "Signed in but not mapped" | app | admin assigns roll number + batch |

Admins can still pre-create students (single form or CSV import) — the record is then already mapped when the student first signs in.
