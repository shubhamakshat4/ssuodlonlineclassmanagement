# Runbook — SSU ODL online class portal

Operational reference for whoever runs the portal. Everything here assumes the repo is checked out,
`npm ci` has run, and `.env.local` is filled in.

## 1. First deployment

1. **Supabase**
   ```bash
   supabase login
   supabase link --project-ref acflzvfiochinjuprrew
   supabase db push                       # applies supabase/migrations in order
   supabase functions deploy cron-generate-sessions cron-provision-meetings cron-harvest-recordings cron-expire-recordings recording-play
   supabase secrets set GRAPH_MODE=real GRAPH_RECORDING_MODE=auto \
     MS_TENANT_ID=… MS_CLIENT_ID=… MS_CLIENT_SECRET=… MS_SERVICE_ACCOUNT_USER_ID=… MS_SERVICE_ACCOUNT_UPN=…
   ```
   Do **not** run `supabase db reset` against production; the seed contains fake accounts and passwords.
2. **Dashboard settings** (Authentication):
   - Providers → Google: client id/secret; authorised redirect `https://<ref>.supabase.co/auth/v1/callback`.
   - Sign-ups: **disabled** (users are pre-provisioned).
   - Hooks → Before User Created: `public.before_user_created_hook` (enabled).
   - Password: minimum length 12, letters + digits.
   - URL configuration: site URL = the Vercel domain; redirect URLs include `https://<domain>/auth/callback`.
3. **Vault secrets for cron** (SQL editor, once):
   ```sql
   select vault.create_secret('https://acflzvfiochinjuprrew.supabase.co', 'project_url');
   select vault.create_secret('<service role key>', 'service_role_key');
   ```
   Then confirm the jobs exist: `select jobname, schedule from cron.job;` — expect `ssu-generate-sessions`,
   `ssu-provision-meetings`, `ssu-harvest-recordings`, `ssu-expire-recordings`, `ssu-rate-limits-cleanup`.
4. **Vercel**: set every variable from `.env.local.example` (never `MS_*` — the Next app does not call Graph), plus
   `GRAPH_MODE=real` (used only by the admin "Run provisioner now" button), `NEXT_PUBLIC_SITE_URL`, optional `ERROR_WEBHOOK_URL`.
5. **First admin**: in the SQL editor create the auth user (Authentication → Users → "Add user", email + password, auto-confirm),
   then `insert into profiles (id, role, full_name, email) values ('<auth user id>', 'admin', 'Name', 'email');`.
6. Run the Phase 6 spike from a workstation: `GRAPH_MODE=real npm run graph:spike` (see `docs/MANUAL_VERIFICATION.md`).

## 2. Daily operation

| Job | Schedule (UTC / IST) | What it does | Where to look |
|---|---|---|---|
| `cron-generate-sessions` | 19:30 / 01:00 | expands timetable → sessions 21 days ahead; completes past sessions | `audit_log` action `sessions.generated` |
| `cron-provision-meetings` | every 10 min | Teams meetings create/patch/delete; retries; `failed` after 5 | `/admin/sync-health` |
| `cron-harvest-recordings` | hourly :05 | finds recordings for sessions ended ≤ 48 h ago | `audit_log` `recording.harvested` / `harvester.run` |
| `cron-expire-recordings` | 20:00 / 01:30 | flips rows past 30 days to `expired` | `audit_log` `recordings.expired` |

Cron health: `select * from cron.job_run_details order by start_time desc limit 20;` and
`select * from net._http_response order by created desc limit 20;` (pg_net responses; status 200 expected).

## 3. Common problems

**Sessions stuck in `pending` / red tile on the admin overview**
1. `/admin/sync-health` → "Run provisioner now". Read the error text.
2. `403 Forbidden … application access policy` → IT has not granted `New-CsApplicationAccessPolicy` to the service account (docs/M365_SETUP.md). Nothing to fix in code.
3. `401` token errors → client secret expired/rotated. Update `MS_CLIENT_SECRET` with `supabase secrets set`, redeploy functions.
4. `429` → throttling; the job backs off automatically. If persistent at term start, lower the batch size (POST body `{"limit": 10}`) or spread timetable creation.
5. Nothing runs at all → check Vault secrets and `cron.job`. Call the function by hand:
   `curl -X POST https://<ref>.supabase.co/functions/v1/cron-provision-meetings -H "Authorization: Bearer <service role key>"`.

**Teacher not added as co-organiser** — `teachers.entra_upn` must be the exact tenant UPN and the teacher must be a licensed Entra user (§3.6). Check `entra_user_id` on `/admin/teachers`; "unresolved" means the UPN lookup failed.

**Students land in the lobby** — Teams meeting policy on the service account: anonymous join + anonymous start must be On (§3.4). Not a code issue.

**No recording after class** — (a) `provider='custom'` sessions are never recorded; (b) check `GRAPH_RECORDING_MODE`; (c) look in the service account's OneDrive `/Recordings` — if the file is in the *teacher's* OneDrive the teacher started the recording manually (§15.5); (d) `audit_log` `recording.harvest_failed`. The harvester retries hourly for 48 h.

**Recording plays for nobody / 410** — the file was deleted by Teams' 35-day expiry, or the download URL failed (`graph.call` rows with `GET /drives/{id}/items/{id}`).

**Student cannot sign in with Google** — they must exist under `/admin/students` with the exact `@srisriuniversity.edu.in` address first. The auth error page states the reason. Personal Gmail is rejected server-side.

**Teacher forgot password** — `/admin/teachers/<id>` → "Resend invite / reset password".

## 4. Manual job runs
- Sessions: `/admin/sessions` → "Generate sessions now".
- Provisioning: `/admin/sync-health` → "Run provisioner now" (needs `GRAPH_MODE` on the Next server) or the curl above.
- Harvest / expire: curl the function with the service-role bearer as above.

## 5. Credentials
- Rotate the Entra client secret before go-live (it was handled outside a secret manager) and yearly thereafter.
- Rotate the Supabase service-role key if it ever leaves the server side. It lives in Vercel env, Supabase Vault, and Edge Function secrets — update all three.
- Seeded passwords (`AdminPass12345`, `TeacherPass12345`) exist only in local/test databases.

## 6. Backups & data
- Supabase daily backups cover Postgres. Recordings are never stored by the portal (OneDrive only).
- `audit_log` grows with every Graph call (~5 rows per session). Archive rows older than a year if size matters.

## 7. Monitoring
- Next.js server errors → `src/instrumentation.ts` → structured JSON logs (Vercel) and `ERROR_WEBHOOK_URL` if set.
- Edge Function errors → Supabase function logs + `audit_log` (`graph.provision_failed`, `recording.harvest_failed`).
- Rate limits: `join` 30/min per user, login 20/15 min per IP and 8/15 min per email, playback 60/min per user (`src/lib/rate-limit.ts`).
