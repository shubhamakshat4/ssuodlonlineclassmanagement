# Blockers

Things that could not be finished in this build, what was tried, and exactly what is needed.

## B1 — No Microsoft Graph credentials available
- **What:** `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_SERVICE_ACCOUNT_USER_ID` and the test teacher UPNs were redacted from the `SPEC.md` the build received.
- **Impact:** The Phase 6 real-tenant spike cannot run. All Graph work is built and tested against the mock client (`supabase/functions/_shared/graph/mock.ts`).
- **What was done instead:** the full client (`_shared/graph/real.ts`: client-credentials token cache, 4 req/s throttle, Retry-After backoff, max 5 attempts, per-call audit), the §7.2 sequence (`_shared/graph/sequence.ts`) and the spike script (`scripts/graph-spike.ts`) are written and unit-tested with a fake `fetch` and the mock. The spike was executed against the mock only — see `docs/GRAPH_SPIKE_LOG.md` ("MOCK ONLY"). The §7.4 fallback (manual recording + OneDrive scan) is implemented and selectable with `GRAPH_RECORDING_MODE=manual`; the sequence also degrades automatically when step 3 rejects `recordAutomatically` (applies the presenter/lobby options without it and records the error).
- **Needs:** fill the `MS_*` values in `.env.local`, set `GRAPH_MODE=real` and `SPIKE_TEACHER_UPN=<test mailbox>`, run `npm run graph:spike`. GREEN → deploy with `GRAPH_MODE=real`. Step 3 rejected → also set `GRAPH_RECORDING_MODE=manual`. 403 on step 1 → application access policy not granted (docs/M365_SETUP.md).

## B2 — Supabase — RESOLVED except the Google provider
- **Done (20 Sep 2026):** schema (11 migrations) applied and tracked; five Edge Functions deployed; secrets set (`GRAPH_MODE=mock` for the demo, `GRAPH_RECORDING_MODE=auto`, `CRON_SECRET`); Vault holds `project_url` + `cron_secret`; pg_cron jobs verified firing and reaching the functions (HTTP 200); auth config applied via the Management API (sign-ups off, `before_user_created` hook on, 12-char passwords, redirect allow-list). Demo data loaded. Verified live: `npm run smoke:cloud` 15/15, Playwright `e2e/demo-walkthrough.spec.ts` 3/3, `e2e/student-join.spec.ts` 3/3, `e2e/teacher-override.spec.ts` 2/2.
- **Google provider configured (21 Sep 2026)** — student Google sign-in works; unmapped university accounts see "No classes are assigned to you yet — contact the ODL department"; sign-ups switch is ON with the hook enforcing who may create an account.
- **Demo caveat:** functions run with `GRAPH_MODE=mock`, so the provisioner assigns fake `teams.microsoft.com/…/mock/…` links to new sessions. Go-live: `supabase secrets set GRAPH_MODE=real MS_…`, `npm run demo:reset-links`.
- **Rotate:** the database password, service-role key and CLI access token were all shared in chat. Rotate in the dashboard; update `.env.local` (`SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`).
