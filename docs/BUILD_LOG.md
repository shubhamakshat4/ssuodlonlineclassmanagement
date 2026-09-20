# Build log

One entry per phase. Newest at the bottom.

## Pre-phase — credentials
- `SPEC.md` arrived with credentials already redacted; verified `.env.local` is gitignored (`git check-ignore -v .env.local`), `.env.local.example` is committed with placeholders.
- Missing at build time: `SUPABASE_SERVICE_ROLE_KEY`, all `MS_*` values. See `docs/BLOCKERS.md`.

## Phase 0 — scaffold, env, CI — done
- Built: Next.js 15 App Router scaffold, `src/lib/env.ts` typed env access, `supabase/config.toml`
  (Google provider, `before_user_created` hook, 12-char password minimum, edge function entries),
  Vitest + Playwright configs, GitHub Actions CI (lint, typecheck, test, build).
- Tested: `npm run lint`, `npm run typecheck`, `npm test` (1 smoke test), `npm run build` — all green.
  Verified embedded Postgres 17.2 boots on this machine with `citext` + `pgcrypto` (basis for the RLS suite).
- Skipped: nothing.
