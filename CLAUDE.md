# PawMatch — Project Context for Claude Code

This file is read by Claude Code at the start of every session. Keep it current as the project evolves.

---

## What we're building

PawMatch is a two-sided marketplace web app connecting dog owners with dog trainers. The app serves two distinct communities: everyday pet owners looking for basic obedience and behavior training, and the working/sport dog community (PSA, Schutzhund, French Ring, PPD) — a differentiated niche where trainer credentialing and specialty search matter more than in mainstream pet apps.

**Core flow:**
- Owners search trainers by location, specialty, price, and availability
- Owners view profiles (credentials, specialties, reviews, photos)
- Owners book and pay for sessions via Stripe
- Trainers receive automatic payouts after completed sessions (minus platform commission)
- Both parties can message in-app, and owners leave reviews after sessions

## Who the builder is

Shane is a Private Wealth Financial Advisor learning software engineering through this project. He is not a professional developer. When making architectural decisions, prefer:
- **Clarity over cleverness** — standard patterns beat novel approaches
- **Explain the "why"** inline in comments and in your responses, not just the "what"
- **Ask, don't assume** — when product requirements are ambiguous, stop and ask. Don't guess at product direction
- **Teach the mechanic** — when a non-obvious marketplace concept comes up (idempotency, webhooks, RLS, state machines), briefly explain it; the goal is Shane understanding what's being built, not just shipping it

## Tech stack (decided — don't change without discussion)

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | Industry standard, great DX, Vercel-optimized |
| Language | TypeScript (strict mode) | Catch errors at compile time, better refactoring |
| Styling | Tailwind CSS v4 + shadcn/ui | Productive and widely understood |
| Database | Supabase (Postgres) | Hosted Postgres + Auth + Storage + Realtime in one service |
| Auth | Supabase Auth | Bundled with the DB, handles JWT + sessions |
| Payments | Stripe Connect (Express) | The only real option for a marketplace |
| Email | Resend | Developer-friendly transactional email |
| Hosting | Vercel | Zero-config for Next.js, excellent preview deploys |
| Error tracking | Sentry | Industry standard |
| Testing | Vitest (unit/integration) + Playwright (E2E) | Fast, modern, well-documented |
| Package manager | pnpm | Fast, disk-efficient, deterministic |

## Directory structure

```
pawmatch/
├── app/                    # Next.js App Router — pages and layouts
│   ├── (owner)/           # Owner-facing route group
│   ├── (trainer)/         # Trainer-facing route group
│   ├── (auth)/            # Sign up, sign in, reset password
│   ├── api/               # API route handlers
│   └── layout.tsx
├── components/
│   ├── ui/                # shadcn/ui components (generated)
│   └── shared/            # Our shared components
├── lib/
│   ├── supabase/          # Supabase clients (server + browser)
│   ├── stripe/            # Stripe client and helpers
│   ├── validators/        # Zod schemas
│   └── utils/             # Shared utilities
├── types/
│   └── supabase.ts        # Generated from DB schema
├── supabase/
│   ├── migrations/        # SQL migrations (never edit applied ones)
│   └── seed.sql           # Local dev seed data
├── tests/
│   ├── integration/
│   └── e2e/
├── .claude/
│   └── agents/            # Subagent definitions (read this dir)
├── CLAUDE.md              # This file
├── .env.example           # Template for env vars
└── .env.local             # Local env vars (NEVER commit)
```

## Subagents

Six specialized subagents are available in `.claude/agents/`. **Use them.** Don't do agent-scoped work in the main context.

| Agent | Use for |
|---|---|
| `frontend-agent` | React components, Tailwind, shadcn, forms, owner/trainer UI flows |
| `backend-agent` | API routes, Server Actions, auth checks, business logic |
| `database-agent` | Schema design, migrations, RLS policies, queries |
| `stripe-agent` | All payment work — Connect, checkout, webhooks, payouts |
| `testing-agent` | Unit, integration, and E2E tests |
| `devops-agent` | Deployment, env vars, CI, error tracking, domains |

## Universal conventions

- **TypeScript strict** — no `any` without an inline comment explaining why
- **RLS on every table** — no exceptions, even internal tables
- **Zod on every form and API input boundary** — validate before trusting
- **Auth check is the first line** inside any protected handler
- **Idempotency keys on every Stripe API call** that mutates state
- **All money as integers in cents** — never floats, never dollar strings
- **All timestamps stored as UTC** — timezone conversion happens at display time
- **Server Components by default** — `"use client"` only when interactivity requires it
- **Commit messages explain the "why"**, not just "added X"

## Definition of done (for every feature)

Before claiming a feature is complete:

1. `pnpm typecheck` passes
2. `pnpm test` passes (unit + integration)
3. `pnpm lint` passes
4. Manually test the happy path in the browser
5. Manually test at least one error/edge case
6. Commit with a message explaining what and why
7. If env vars were added, update `.env.example`
8. If manual setup steps are needed (Stripe dashboard, Supabase dashboard), add them to `docs/manual-steps.md`

## When to escalate to Shane

Always ask Shane before:
- Adding a new third-party service or SDK
- Making a product decision (feature scope, user flow, business rules)
- Anything that costs money (paid tiers, domains, SMS)
- Going to production (Vercel production deploy, Stripe live keys, custom domain)
- Bulk data operations (migrations that backfill, mass emails)
- Destructive operations (dropping tables, deleting users)

## What NOT to do without asking

- Never run `DROP TABLE` or destructive migrations against the remote Supabase
- Never push to `main` directly — always work in a branch
- Never swap test Stripe keys for live keys without explicit approval
- Never commit `.env.local`, service role keys, or any secret
- Never disable RLS "temporarily" without a follow-up to re-enable
- Never install a new dependency without noting why in the commit

## Current phase

See `build-plan.md` for phase tracking. Update that file as phases complete.

## Glossary (for when terms come up in conversation)

- **RLS** — Row Level Security; Postgres feature that enforces row-level access control
- **Connect** — Stripe's platform product for marketplaces that pay out to third parties
- **Webhook** — server endpoint that receives async events from Stripe (source of truth for payment state)
- **Idempotency key** — a unique ID on an API request that prevents double-processing on retry
- **Server Component** — React component that runs on the server, can fetch data directly, can't have interactivity
- **Server Action** — function that runs on the server, called directly from a form or client component
- **Migration** — a versioned SQL file that describes a schema change
