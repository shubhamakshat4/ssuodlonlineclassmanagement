# Blockers

Things that could not be finished in this build, what was tried, and exactly what is needed.

## B1 — No Microsoft Graph credentials available
- **What:** `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_SERVICE_ACCOUNT_USER_ID` and the test teacher UPNs were redacted from the `SPEC.md` the build received.
- **Impact:** The Phase 6 real-tenant spike cannot run. All Graph work is built and tested against the mock client (`supabase/functions/_shared/graph/mock.ts`).
- **What was done instead:** the full client (`_shared/graph/real.ts`: client-credentials token cache, 4 req/s throttle, Retry-After backoff, max 5 attempts, per-call audit), the §7.2 sequence (`_shared/graph/sequence.ts`) and the spike script (`scripts/graph-spike.ts`) are written and unit-tested with a fake `fetch` and the mock. The spike was executed against the mock only — see `docs/GRAPH_SPIKE_LOG.md` ("MOCK ONLY"). The §7.4 fallback (manual recording + OneDrive scan) is implemented and selectable with `GRAPH_RECORDING_MODE=manual`; the sequence also degrades automatically when step 3 rejects `recordAutomatically` (applies the presenter/lobby options without it and records the error).
- **Needs:** fill the `MS_*` values in `.env.local`, set `GRAPH_MODE=real` and `SPIKE_TEACHER_UPN=<test mailbox>`, run `npm run graph:spike`. GREEN → deploy with `GRAPH_MODE=real`. Step 3 rejected → also set `GRAPH_RECORDING_MODE=manual`. 403 on step 1 → application access policy not granted (docs/M365_SETUP.md).

## B2 — Supabase: schema is live; Edge Functions and the service-role key are still missing
- **Done (20 Sep 2026):** all 10 migrations applied to `acflzvfiochinjuprrew` with `npm run db:migrate` (direct Postgres via the IPv4 session pooler in `ap-southeast-2`, recorded in `supabase_migrations.schema_migrations` so `supabase db push` stays in sync). pg_cron + pg_net installed, 5 jobs scheduled. Demo data loaded (`npm run demo:seed`). Verified live: `npm run smoke:cloud` (real GoTrue login, PostgREST embeds, RLS, override trigger — 15/15) and the Playwright walkthrough `e2e/demo-walkthrough.spec.ts` (admin screens, teacher override + revert, role bouncing — 3/3).
- **Still missing:**
  - `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API) → needed by the admin UI to create students/teachers, by the shared rate limiter, and by the two original E2E journeys (student magic-link sign-in).
  - `SUPABASE_ACCESS_TOKEN` or `supabase login` → needed to deploy the five Edge Functions and set their secrets. Until then the cron jobs fire but `invoke_edge_function` returns null (no Vault secrets) — harmless.
  - Dashboard settings that cannot be set from SQL: Google provider (client id/secret from IT Part 4), Sign-ups **off**, Before-user-created hook **on**, password minimum 12.
- **Note:** the database password was shared in chat; rotate it in Project Settings → Database and update `SUPABASE_DB_URL` in `.env.local`.
