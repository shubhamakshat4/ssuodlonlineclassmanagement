# SSU ODL — Online Class Management Portal

Sri Sri University's ODL programme: students sign in with Google and join scheduled classes; teachers
manage their links; admins run programmes, batches, timetables and reports; Microsoft Teams meetings
are created automatically and recordings are streamed from the university's OneDrive for 30 days.

- Spec: [`SPEC.md`](SPEC.md) · Conventions: [`CLAUDE.md`](CLAUDE.md)
- Progress: [`docs/BUILD_LOG.md`](docs/BUILD_LOG.md) · Decisions: [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md) · Open items: [`docs/BLOCKERS.md`](docs/BLOCKERS.md)
- Operate: [`docs/RUNBOOK.md`](docs/RUNBOOK.md) · Verify by hand: [`docs/MANUAL_VERIFICATION.md`](docs/MANUAL_VERIFICATION.md) · Tests: [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md)
- Microsoft 365 prerequisites: [`docs/M365_SETUP.md`](docs/M365_SETUP.md) · Email for IT: [`docs/IT_REQUEST_EMAIL.md`](docs/IT_REQUEST_EMAIL.md) · Demo: [`docs/DEMO.md`](docs/DEMO.md) · Google SSO: [`docs/GOOGLE_SSO_SETUP.md`](docs/GOOGLE_SSO_SETUP.md) · CSV import: [`docs/CSV_IMPORT.md`](docs/CSV_IMPORT.md) · Deploy: [`docs/VERCEL_DEPLOY.md`](docs/VERCEL_DEPLOY.md)

## Quick start
```bash
cp .env.local.example .env.local   # fill in values
npm ci
npm run dev                        # http://localhost:3000
npm test                           # unit + RLS suite (embedded Postgres, no Docker needed)
npm run lint && npm run typecheck && npm run build
npm run db:migrate             # apply migrations to SUPABASE_DB_URL (cloud)
npm run demo:seed              # load demo data (never on production)
npm run smoke:cloud            # live-stack checks with the anon key
```
Local Supabase (needs Docker): `supabase start && supabase db reset` seeds fake data —
admin `odl.admin@srisriuniversity.edu.in`; passwords are not kept in this repository - set
`E2E_ADMIN_PASSWORD` and `E2E_TEACHER_PASSWORD` in `.env.local` (see `.env.local.example`).
