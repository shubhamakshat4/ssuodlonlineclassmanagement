# Kickoff prompt for Claude Code

Put `SPEC.md` in the repo root (or `docs/SPEC.md`) first, then paste everything below
the line into Claude Code.

---

I'm building an online class management portal for Sri Sri University's ODL programme.
The full specification is in `SPEC.md` in this repo. **Read it completely before writing
any code.** It is the source of truth — if anything I say in chat contradicts it, stop and
ask me rather than guessing.

## How I want you to work

- **Build in the phases listed in SPEC.md §12, strictly in order.** Do one phase per
  working session. At the end of each phase, stop, summarise what you built, tell me what
  I need to verify manually, and wait for my go-ahead before starting the next phase.
- Do not scaffold the whole application up front. I would rather have Phase 1 working and
  tested than twelve phases half-built.
- Before you start a phase, tell me your plan for it in five bullets or fewer and let me
  correct it. After that, just build — don't check in on every file.
- Every schema change is a numbered Supabase migration under `supabase/migrations/`.
  Never edit a migration that has already been applied; add a new one.
- Write the RLS policies in the same migration as the table they protect, not later.
- TypeScript strict mode. No `any`. Generate Supabase types with the CLI and use them.
- If something in SPEC.md is ambiguous, underspecified, or looks wrong to you, say so
  before implementing it. I would much rather have the argument now.

## Start with Phase 0

1. Create `CLAUDE.md` at the repo root capturing our conventions: the stack, the
   phase-by-phase workflow above, the migration rules, the "no Graph calls from the
   browser" rule, and where the env vars live. Keep it under 60 lines — it gets read on
   every future session.
2. Scaffold a Next.js 15 App Router project with TypeScript, Tailwind, and shadcn/ui.
3. Wire up local Supabase (`supabase init`, `supabase start`) and confirm it runs.
4. Set up `.env.local.example` with every variable from SPEC.md §13, with comments and
   no real values. Make sure `.env.local` is gitignored.
5. Set up Vitest and a GitHub Actions workflow running lint, typecheck, and tests.
6. Commit.

Then stop and show me the project structure before touching the schema.

## Two things to flag early

**Phase 6 is a hard gate.** It's a spike that proves the Microsoft Graph sequence in
SPEC.md §7.2 works against our real tenant: create a calendar-backed event on the service
account, resolve the online meeting, then PATCH `recordAutomatically` plus the co-organiser
and lobby settings onto it. The whole recording feature depends on that combination working.
Build it as a standalone throwaway script I can run from the CLI against one test class.
Do not start Phase 7 until I confirm the spike passed.

**I may not have the Microsoft tenant credentials on day one.** Design every Graph call
behind a small interface with a mock implementation, so Phases 0–5 and 8–9 can be built and
tested without them. Tell me clearly whenever you hit something that genuinely cannot be
built or verified without real credentials.

## What I do not want

- Don't add features that aren't in SPEC.md. No notifications, no chat, no assignments,
  no analytics dashboards, no dark-mode toggle unless I ask.
- Don't install a dependency without telling me why in one line.
- Don't write mock data into production code paths. Seeds live in `supabase/seed.sql`.
- Don't tell me something works if you haven't run it.

Start by reading `SPEC.md` and tell me anything in it you think is wrong or missing before
you begin Phase 0.
