# Blockers

Things that could not be finished in this build, what was tried, and exactly what is needed.

## B1 — No Microsoft Graph credentials available
- **What:** `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_SERVICE_ACCOUNT_USER_ID` and the test teacher UPNs were redacted from the `SPEC.md` the build received.
- **Impact:** The Phase 6 real-tenant spike cannot run. All Graph work is built and tested against the mock client (`supabase/functions/_shared/graph/mock.ts`).
- **Needs:** fill the `MS_*` values in `.env.local`, then run `npm run graph:spike` (see `docs/MANUAL_VERIFICATION.md`). If step 3 (`recordAutomatically`) is rejected, set `GRAPH_RECORDING_MODE=manual` in Edge Function secrets to switch the harvester to the OneDrive-scan fallback.

## B2 — No Supabase service-role key / CLI login / Docker
- **What:** `SUPABASE_SERVICE_ROLE_KEY` is a placeholder; the Supabase CLI is not logged in; Docker is not installed.
- **Impact:** Migrations were applied and tested against an embedded Postgres 17 (real RLS, real roles) but **not** against the cloud project `acflzvfiochinjuprrew` or a local `supabase start` stack. Playwright E2E is written but was not executed (needs GoTrue + PostgREST).
- **Needs:** `supabase login`, `supabase link --project-ref acflzvfiochinjuprrew`, `supabase db push`, `supabase functions deploy`, `supabase secrets set …`, and set the service-role key in `.env.local`. Then `npm run test:e2e`.
