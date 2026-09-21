# Deploying to Vercel — step by step

Only the Next.js app runs on Vercel. The database, authentication, Edge Functions, cron jobs and all
Microsoft secrets stay in Supabase, exactly as they are now. Total time: about 20 minutes.

## Part A — Create the project (5 min)

1. Go to **https://vercel.com** → sign in with the GitHub account that owns
   `shubhamakshat4/ssuodlonlineclassmanagement` (or one that has access).
2. **Add New… → Project** → **Import** next to `ssuodlonlineclassmanagement`.
3. Leave the defaults: Framework **Next.js**, Root Directory `./`, Build Command `next build`,
   Install Command `npm ci`. Do **not** click Deploy yet — add the environment variables first (Part B).

## Part B — Environment variables (5 min)

In the same screen expand **Environment Variables** (later: Project → Settings → Environment Variables).
Add each row for **Production** and **Preview**.

| Name | Value | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://acflzvfiochinjuprrew.supabase.co` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_…` | same page, "publishable" key |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_…` or the legacy `service_role` JWT | same page, **secret** key — mark as *Sensitive* |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-project>.vercel.app` (or the custom domain) | you know it after the first deploy — see step 6 |
| `GRAPH_MODE` | `mock` for the demo, `real` once Microsoft credentials are in Supabase | — |
| `GRAPH_RECORDING_MODE` | `auto` | — |
| `ALLOWED_STUDENT_DOMAIN` | `srisriuniversity.edu.in` | — |
| `APP_TIMEZONE` | `Asia/Kolkata` | — |
| `JOIN_WINDOW_LEAD_MINUTES` | `10` | — |
| `RECORDING_RETENTION_DAYS` | `30` | — |
| `SESSION_GENERATION_HORIZON_DAYS` | `21` | — |
| `ERROR_WEBHOOK_URL` | *(optional)* Slack / Teams incoming-webhook URL for error alerts | — |

**Do not add** to Vercel: `MS_*` (Graph runs only in Supabase Edge Functions), `CRON_SECRET`,
`SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_*`. They are not used by the app.

4. Click **Deploy**. The first build takes 2–3 minutes (it installs a small embedded Postgres used only by tests; that is expected).
5. When it finishes, note the production URL, e.g. `https://ssuodlonlineclassmanagement.vercel.app`.
6. Settings → Environment Variables → set **`NEXT_PUBLIC_SITE_URL`** to that exact URL (no trailing slash) →
   **Deployments → ⋯ → Redeploy** (env vars are baked in at build time).

## Part C — Callback URLs (5 min)

Two systems must know the new address. Nothing changes in Google Cloud: Google always redirects to
Supabase (`https://acflzvfiochinjuprrew.supabase.co/auth/v1/callback`), and Supabase then redirects to the app.

7. **Supabase → Authentication → URL Configuration**
   - **Site URL:** `https://<your-project>.vercel.app`
   - **Redirect URLs** — add, one per line:
     - `https://<your-project>.vercel.app/auth/callback`
     - `https://<your-project>.vercel.app/**` (covers `/account/password` after invites/resets)
     - keep `http://localhost:3000/auth/callback` for local development
     - optional, for preview deployments: `https://*-<your-vercel-team>.vercel.app/auth/callback`
   - Save.
   Without this, Google sign-in bounces back to whatever Site URL is set (currently localhost).
8. **Google Cloud → APIs & Services → Credentials → the OAuth client** (optional but tidy):
   add `https://<your-project>.vercel.app` under *Authorised JavaScript origins*. The redirect URI stays the
   Supabase one from `docs/GOOGLE_SSO_SETUP.md`.
9. **Supabase → Edge Functions**: nothing to change. `recording-play` is called by the app server-side with
   the user's token, not by the browser, so the Vercel domain needs no allow-listing there.

## Part D — Verify (3 min)

10. Open `https://<your-project>.vercel.app` → landing page loads.
11. `/login` with the admin account → `/admin` overview shows the stat tiles (this proves the anon key,
    the service-role key and the database connection).
12. `/login/student` → Google → your `@srisriuniversity.edu.in` account → `/student` timetable
    (proves the callback URLs).
13. Admin → Students → create a test teacher → the invite e-mail's link must point at the Vercel domain
    (proves `NEXT_PUBLIC_SITE_URL`).
14. Admin → Sync health → "Run provisioner now" returns a summary (proves `GRAPH_MODE` and the 60 s limit).

## Part E — Custom domain (optional, 10 min + DNS)

15. Vercel → Project → **Settings → Domains → Add** `classes.srisriuniversity.edu.in`.
16. Ask IT to create the DNS record Vercel shows (a **CNAME** to `cname.vercel-dns.com`). SSL is automatic.
17. Update the three places that carry the address: `NEXT_PUBLIC_SITE_URL` (redeploy), Supabase Site URL +
    Redirect URLs (step 7), Google JavaScript origins (step 8).

## Notes

- **Region:** `vercel.json` pins server functions to Sydney (`syd1`), the same region as the Supabase project,
  so every database round-trip stays local. Change both together if the Supabase project ever moves.
- **Function limits:** admin pages that run imports or the provisioner export `maxDuration = 60`. On the
  Hobby plan the maximum is 60 s; on Pro it can be raised further if very large CSV files are expected.
- **Previews:** every pull request gets a preview URL. Preview builds use the same Supabase project unless
  you give them different env values under the *Preview* environment — for a real staging setup create a
  second Supabase project and point Preview at it.
- **Going live with Microsoft:** set the `MS_*` secrets and `GRAPH_MODE=real` in **Supabase** (Edge
  Functions), then set `GRAPH_MODE=real` in **Vercel** too (it only affects the admin "Run provisioner now"
  button) and redeploy. Run `npm run demo:reset-links` once to replace the demo links.
- **Secrets hygiene:** mark `SUPABASE_SERVICE_ROLE_KEY` as *Sensitive* in Vercel so it can't be read back
  from the dashboard; rotate it if it was ever shared in chat or e-mail.
