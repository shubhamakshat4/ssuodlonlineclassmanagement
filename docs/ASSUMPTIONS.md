# Assumptions

Every decision the spec did not make. Format: what — why — cost to change later.

## Credentials / environment
- The `SPEC.md` handed to the build already had the Microsoft credentials and the Supabase service-role key redacted; only the Supabase URL and publishable key were present. `.env.local` therefore carries `REPLACE_ME` placeholders for those. — Nothing to move; nothing secret entered git. — Fill in `.env.local` and `supabase secrets set` when available.
- All credentials that were ever pasted into `SPEC.md` must be **rotated before go-live** (they were handled outside a secret manager). — Hygiene. — Trivial.
- The Supabase publishable key (`sb_publishable_…`) is used as `NEXT_PUBLIC_SUPABASE_ANON_KEY`. — It is the current name for the anon key. — None.

## Phase 0
- Next.js 15.5 + React 19, Tailwind v4, ESLint 9 flat config, npm. — Latest 15.x at build time; spec says 15. — Low.
- shadcn/ui components are vendored by hand in `src/components/ui` in shadcn style, without Radix dependencies. — Keeps the install deterministic and offline-friendly; shadcn is copy-in by design. — Low; `npx shadcn add` can replace any file.
- System font stack instead of `next/font/google` (Geist). — Google Fonts needs network at build time. — Trivial.
- Tests: Vitest for unit + RLS; the RLS suite runs on **embedded Postgres 17** (`embedded-postgres` npm package) with a small shim for Supabase's `auth` schema/roles (`tests/db/supabase-shim.sql`). — The build machine has no Docker, so `supabase start`/`db reset` is impossible; real Postgres with real roles is the closest faithful alternative and it also runs in CI without services. — Medium: if Docker becomes available, `supabase db reset` + the same tests can run against the real stack.
- `pg_cron`/`pg_net` scheduling migrations are guarded with `IF EXISTS (extension)` so the same migrations apply on embedded Postgres and Supabase cloud. — Portability. — None.
- CI = GitHub Actions: lint, typecheck, unit + RLS, build. Graph always mocked (`GRAPH_MODE=mock`). — Spec §14. — Low.
- Edge Functions use `verify_jwt = false` and verify callers themselves (cron functions check the service-role bearer; `recording-play` validates the user JWT with `auth.getUser`). — pg_net cron calls carry the service key, not a user JWT. — Low.
- Password policy: min 12 chars, letters + digits (`config.toml`, also enforced in the app). — Spec says a sane minimum of 12. — Trivial.
