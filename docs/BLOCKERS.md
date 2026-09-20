# Blockers

Things that could not be finished in this build, what was tried, and exactly what is needed.

## B1 — No Microsoft Graph credentials available
- **What:** `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_SERVICE_ACCOUNT_USER_ID` and the test teacher UPNs were redacted from the `SPEC.md` the build received.
- **Impact:** The Phase 6 real-tenant spike cannot run. All Graph work is built and tested against the mock client (`supabase/functions/_shared/graph/mock.ts`).
- **What was done instead:** the full client (`_shared/graph/real.ts`: client-credentials token cache, 4 req/s throttle, Retry-After backoff, max 5 attempts, per-call audit), the §7.2 sequence (`_shared/graph/sequence.ts`) and the spike script (`scripts/graph-spike.ts`) are written and unit-tested with a fake `fetch` and the mock. The spike was executed against the mock only — see `docs/GRAPH_SPIKE_LOG.md` ("MOCK ONLY"). The §7.4 fallback (manual recording + OneDrive scan) is implemented and selectable with `GRAPH_RECORDING_MODE=manual`; the sequence also degrades automatically when step 3 rejects `recordAutomatically` (applies the presenter/lobby options without it and records the error).
- **Needs:** fill the `MS_*` values in `.env.local`, set `GRAPH_MODE=real` and `SPIKE_TEACHER_UPN=<test mailbox>`, run `npm run graph:spike`. GREEN → deploy with `GRAPH_MODE=real`. Step 3 rejected → also set `GRAPH_RECORDING_MODE=manual`. 403 on step 1 → application access policy not granted (docs/M365_SETUP.md).

## B2 — No Supabase service-role key / CLI login / Docker
- **What:** `SUPABASE_SERVICE_ROLE_KEY` is a placeholder; the Supabase CLI is not logged in; Docker is not installed.
- **Impact:** Migrations were applied and tested against an embedded Postgres 17 (real RLS, real roles) but **not** against the cloud project `acflzvfiochinjuprrew` or a local `supabase start` stack. Playwright E2E is written but was not executed (needs GoTrue + PostgREST).
- **Needs:** `supabase login`, `supabase link --project-ref acflzvfiochinjuprrew`, `supabase db push`, `supabase functions deploy`, `supabase secrets set …`, and set the service-role key in `.env.local`. Then `npm run test:e2e`.
