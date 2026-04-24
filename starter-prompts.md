# PawMatch — Starter Prompts

These are the exact prompts to paste into Claude Code at the start of each phase. They're written to get the session oriented, delegate to the right subagents, and produce a clear deliverable per phase.

**How to use:**
1. Start a fresh Claude Code session (`claude` in terminal, or `/clear` if you're already in one)
2. Paste the phase prompt
3. Claude Code will either start working or ask clarifying questions — answer them
4. When the phase is done, commit, push, and move to the next phase

**General rules for every session:**
- Work one phase at a time. Don't pre-fetch work from the next phase.
- If Claude Code proposes something unexpected, ask "why?" before accepting.
- If you don't understand a concept Claude Code mentions, ask for a plain-English explanation.
- After each session, commit your work.

---

## Phase 0 — Scaffold

**Paste this into a fresh Claude Code session:**

```
We're starting Phase 0 of the PawMatch build. Read CLAUDE.md, architecture.md, and build-plan.md first to get oriented. Then read all six agent files in .claude/agents/.

Goal for this session: produce a working Next.js 15 scaffold in this directory following the conventions in CLAUDE.md.

Requirements:
- Next.js 15 App Router with TypeScript strict mode
- Tailwind CSS v4
- shadcn/ui initialized with the navy/amber theme described in frontend-agent.md (configure CSS variables for the color tokens in app/globals.css)
- pnpm as the package manager
- ESLint + Prettier
- Vitest configured for unit and integration tests, with one passing example test
- Playwright configured with one example E2E test
- .nvmrc pinning the current LTS Node version
- .gitignore covering node_modules, .next, .env.local, coverage reports, and Playwright artifacts
- .env.example as an empty template (we'll fill it phase by phase)
- The folder structure from CLAUDE.md (app/, components/, lib/, types/, supabase/, tests/)
- A package.json with these scripts: dev, build, start, lint, typecheck, test, test:e2e

Before writing code:
1. List what you're about to do
2. Call out any decisions where my input would help
3. Wait for me to say "go"

When done:
- Run pnpm typecheck, pnpm lint, pnpm test, and pnpm build — show me they all pass
- Give me the exact git commands to commit this as the Phase 0 checkpoint
```

---

## Phase 0.5 — Deploy to Vercel

```
Phase 0.5: get the scaffold deployed to Vercel with a CI pipeline.

Use the devops-agent for this work.

Deliverables:
1. A GitHub repository for this project (I'll create it manually on github.com; guide me through what to name it, which visibility, and the exact commands to push the local repo to it)
2. Link the repo to a new Vercel project — give me the exact click-by-click for the Vercel UI
3. A .github/workflows/ci.yml that runs on every PR: lint, typecheck, test, and build
4. Branch protection rules on main — describe the exact GitHub settings I need to configure

Do not enable auto-deploy to production. Preview deploys on every PR are fine; production is manual-promote only.

When done:
- Confirm my scaffold is live on a vercel.app preview URL
- Confirm CI ran green on my first PR
- Tell me what to add to .env.example and what env vars Vercel needs (should be none yet)
```

---

## Phase 1 — Data model foundations

```
Phase 1: set up Supabase and build the initial data model.

Primary agent: database-agent. Other agents as needed.

Before any code, walk me through:
1. Creating a Supabase dev project at supabase.com (exact clicks)
2. Installing the Supabase CLI locally (brew install supabase/tap/supabase)
3. Linking the project: `supabase login`, `supabase link --project-ref <ref>`
4. Enabling PostGIS in the Supabase dashboard

Then build these tables (in this order, as sequential migrations):
- profiles (extends auth.users, has role enum: owner | trainer | admin)
- dogs
- trainers
- trainer_certifications
- trainer_specialties enum + trainer_specialty_assignments
- trainer_services
- trainer_availability
- trainer_stripe_accounts
- bookings (with status enum and the full state machine)
- message_threads
- messages
- reviews
- notifications

For each table:
- id, created_at, updated_at, deleted_at (where appropriate) following CLAUDE.md conventions
- Foreign keys with ON DELETE behavior explicitly chosen and justified in a comment
- RLS enabled with at least one policy (follow patterns in database-agent.md)
- Indexes based on expected query patterns

Also create:
- A shared trigger function for auto-updating updated_at
- A trigger on auth.users that creates a matching profiles row on signup
- supabase/seed.sql with ~10 trainers and ~10 owners for local dev (realistic names, Nashville-area locations for geo testing)

Stop and ask me:
- Before finalizing the booking state machine — confirm the status values and transitions match what's in architecture.md
- Before choosing cascade vs. restrict on any foreign key involving user data

When done:
- Run `supabase db reset` locally and confirm all migrations apply cleanly
- Generate types to types/supabase.ts
- Walk me through testing RLS manually in Supabase Studio — show me a query that should be blocked and confirm it is
- Give me commit commands
```

---

## Phase 2 — Authentication

```
Phase 2: implement full authentication.

Primary agents: backend-agent (auth flows), frontend-agent (sign-up/sign-in UI), database-agent (if any schema tweaks needed).

Requirements:
- Sign up with email + password, with role selection (owner or trainer) at signup
- Email confirmation using Supabase's built-in email
- Sign in
- Sign out
- Password reset (forgot password → email → reset page → new password)
- Session management using @supabase/ssr (not the raw JS client)
- Next.js middleware that:
  - Redirects unauthenticated users hitting /owner/* or /trainer/* to /sign-in
  - Returns 403 if a user's role doesn't match the route group
- lib/auth/require-user.ts helper for server-side auth checks in route handlers
- UI: sign-up page, sign-in page, password reset flow, onboarding role selector
- Integration tests covering every auth path (success + failure)

UI design notes:
- Follow the design direction in frontend-agent.md (mobile-first, navy/amber)
- Keep it minimal — this is infrastructure, not brand real estate

Before you build, ask me:
- Whether I want magic link sign-in as an option alongside password (recommend yes for reduced friction)
- Whether I want Google OAuth (recommend deferring to Phase 13 to avoid scope creep)

When done:
- Walk me through testing every flow in a browser
- Show me the integration tests running green
- List the Supabase dashboard settings I need to verify manually (email templates, redirect URLs)
```

---

## Phase 3 — Trainer profiles

```
Phase 3: build trainer profile creation, editing, and public display.

Agents: frontend-agent (heavy), backend-agent (Server Actions for mutations), database-agent (if schema needs tweaks for images or slug), testing-agent (after core flows work).

Scope:
- Onboarding wizard after a trainer signs up (multi-step form):
  1. Basic info (display name, bio, profile photo)
  2. Credentials (certifications, years of experience)
  3. Specialties (multi-select from the enum, with the ability to flag "working dog" specialties prominently)
  4. Service area (map-based picker with radius slider — use MapLibre GL with OpenStreetMap tiles for V1; no Mapbox account needed)
  5. Review + publish
- Trainer dashboard /trainer/dashboard — profile status, quick links, "complete your profile" progress
- Trainer profile edit pages (one per section, not one monolithic form)
- Trainer services management:
  - Add/edit/delete services with: name, session type (in_home/at_trainer_location/virtual), duration, price
- Public profile page at /trainers/[slug]:
  - Server-rendered, SEO-friendly
  - Hero with photo, name, specialties
  - About section (bio)
  - Services listed with prices
  - Credentials
  - Reviews section (empty state for now — Phase 10 fills it in)
  - "Book with [Name]" CTA (disabled until Phase 6)
- Image upload to Supabase Storage — configure a bucket with appropriate policies; resize on upload to reasonable dimensions

Before building:
- Ask me what specialties to include in the enum — I want working dog sports well-represented (PSA, Schutzhund/IGP, French Ring, Mondio Ring, PPD) alongside the standard categories (puppy, basic obedience, reactivity, aggression, service dog, etc.)
- Ask me about the slug strategy — username-based vs. auto-generated from name

Done when:
- A trainer can go from signup to a complete, publicly-viewable profile
- Images work (upload, display, resize)
- Service area saved correctly as PostGIS geography (visible in Supabase Studio)
- E2E test: new trainer signs up, completes wizard, visits their public profile URL as a logged-out user
```

---

## Phase 4 — Owner profiles + dogs

```
Phase 4: owner profile and dog management.

Agents: frontend-agent, backend-agent, database-agent, testing-agent.

Scope:
- Owner onboarding (post-signup): display name, photo, home location (address with geocoding to lat/lng for search origin)
- Owner dashboard /owner/dashboard with "my dogs" section
- Dogs CRUD:
  - Name, breed (autocomplete from AKC-style list — include common working breeds: Malinois, GSD, Dutch Shepherd, etc.)
  - Age
  - Temperament notes (free text, for trainer context)
  - Photo
- Location input uses a geocoding API — recommend OpenStreetMap's Nominatim for V1 (free, no API key)

Before building:
- Ask me whether to pull the breed list from a static JSON or a DB table (recommend static for V1)
- Confirm geocoding choice — Nominatim is fine for prototype but has rate limits; note for Phase 13

Done when:
- Owner can complete onboarding
- Owner can add, edit, delete dogs
- Owner home location stored correctly as PostGIS point
- Tests cover CRUD paths
```

---

## Phase 5 — Search & discovery

```
Phase 5: trainer search for owners.

Agents: database-agent (geo query, indexes), backend-agent (search endpoint), frontend-agent (search UI + map), testing-agent.

Features:
- Search page at /search
- Query inputs: location (default to owner's home, editable), radius (default 25 miles), specialty filter (multi), price range, min rating, session type
- Sort: distance (default), rating desc, price asc
- Results:
  - Grid of trainer cards
  - Map view toggle (MapLibre GL again)
  - Pagination: infinite scroll or "load more" — pick one, document why
- Empty states, loading skeletons, error handling
- Debounce filter changes
- URL state — search params in the URL so a search is shareable and back-button works

Performance target: <500ms for search with 100 trainers in seed data.

Before building:
- Ask me: what's the right default radius for the Nashville market? (Recommend 25 miles — dense enough that most trainers in-market will show, loose enough that owners outside the urban core still get results.)
- Ask me about the sort default — distance vs. rating

Done when:
- Search returns correct results for seed data
- Map and list views are in sync
- URL state works (reload the page with filters applied → filters persist)
- Performance target met
- E2E test: owner searches, filters, clicks a result, lands on trainer profile
```

---

## Phase 6 — Booking system

```
Phase 6: booking flow up to (but not including) payment.

Agents: database-agent (availability logic, booking constraints), backend-agent (booking Server Actions, state machine), frontend-agent (booking UI), testing-agent (booking tests are critical — the race condition test especially).

Scope:
- From a trainer profile, owner clicks "Book" on a service
- Owner selects: which dog, date, time slot
- Time slot generation:
  - From trainer's availability template
  - Minus existing bookings (confirmed or pending with recent timestamp)
  - Minus manual blocks (trainer's vacation/exceptions)
  - Expressed in the trainer's local timezone but stored UTC
- Tentative hold (row in bookings with status=pending, expires_at set to +15 min)
  - Why: payment takes a moment; we need to prevent someone else grabbing the slot mid-checkout
- Confirmation preview screen before checkout (shows everything including the refund policy)
- Booking state machine implementation (enforce valid transitions; invalid transitions throw)
- Trainer bookings page at /trainer/bookings (list, filterable by status)
- Owner bookings page at /owner/bookings (list, filterable by status)
- Manual cancel button with the refund policy preview (but no actual refund yet — Phase 8 wires that up)

Critical test: two owners book the same slot simultaneously — exactly one succeeds. Do this with a unique constraint on (trainer_id, start_at) where status in (pending, confirmed). The testing-agent should write a test that actually triggers this race.

Before building:
- Walk me through the booking state machine before coding it — I want to see the state diagram one more time and confirm the transitions
- Ask me about the hold duration (recommend 15 min) and the auto-complete grace period (recommend 24h after session end)
- Confirm the cancellation UI — does it show the refund policy before they click cancel, or after?

Done when:
- Full flow works: select slot → preview → "reserve" (no payment yet, just creates pending booking)
- Race condition test passes
- State transitions enforced
- Both parties see bookings in their dashboards
- Times display in each user's local timezone consistently
```

---

## Phase 7 — Stripe Connect onboarding

```
Phase 7: Stripe Connect Express onboarding for trainers.

PRE-REQUISITE: before we start, confirm that you have:
1. A Stripe account created
2. Submitted the Connect platform profile (Dashboard → Connect → Get started → Platform profile)
3. Received approval from Stripe (or at least submitted — approval can come mid-phase)

If you haven't done these, do that NOW and come back. Onboarding trainers without platform approval will fail.

Primary agent: stripe-agent. Also: backend-agent (endpoints), frontend-agent (onboarding UI), database-agent (trainer_stripe_accounts table).

Scope:
- "Set up payouts" CTA on trainer dashboard (visible when payouts_enabled is false)
- Server Action: create Express account via stripe.accounts.create, store account_id, create account link via stripe.accountLinks.create, return URL to Stripe hosted onboarding
- Return URL handler at /trainer/payouts/return — refresh account status, show appropriate UI
- Refresh URL handler at /trainer/payouts/refresh — in case the link expires mid-flow, regenerate
- Account status states in the UI:
  - Not started (show CTA)
  - In progress (show "continue setup")
  - Rejected (show reason from Stripe if available)
  - Enabled (show "payouts enabled ✓" with deauth option)
- Webhook handler stub at /api/webhooks/stripe (we'll flesh it out in Phase 8, but wire up signature verification and event routing now)
- Handle account.updated event: sync charges_enabled + payouts_enabled to trainer_stripe_accounts
- Rule: a booking can only be created for a trainer whose trainer_stripe_accounts.payouts_enabled = true

Test plan:
- Install the Stripe CLI (brew install stripe/stripe-cli/stripe, then `stripe login`)
- Run `stripe listen --forward-to localhost:3000/api/webhooks/stripe` in a separate terminal
- Complete Express onboarding with test data (Stripe accepts Jenny Rosen / 000-00-0000 / 01-01-1901 / any address)
- Verify webhook received and payouts_enabled flipped

Before starting:
- Confirm with me that platform profile is submitted
- Explain (for my learning) the difference between direct charges, destination charges, and separate charges & transfers — and tell me which we're using and why

Done when:
- A trainer completes test-mode onboarding end-to-end
- charges_enabled and payouts_enabled flags reflected in UI
- Booking flow gates on payouts-enabled status
- Webhook handler signature-verifies and processes at least account.updated correctly
```

---

## Phase 8 — Payment flow + full webhook handler

```
Phase 8: real payment flow.

Primary agent: stripe-agent, with backend-agent for endpoints, frontend-agent for the checkout UI, testing-agent for payment tests (critical).

Scope:
- On booking confirmation preview, "Proceed to payment" button → creates PaymentIntent
- PaymentIntent setup:
  - amount = service price in cents
  - currency = 'usd'
  - application_fee_amount = amount * PLATFORM_COMMISSION_BPS / 10000
  - transfer_data.destination = trainer's connected account ID
  - metadata = { booking_id, owner_id, trainer_id, dog_id }
  - idempotency_key = deterministic key derived from booking_id (e.g., `booking_${booking_id}_intent`)
- Client renders Stripe Payment Element
- On confirm: client redirects to /booking/[id]/pending (NOT /confirmed — confirmation is webhook-driven)
- Webhook handler processes events:
  - payment_intent.succeeded → booking.status = confirmed, send emails (trainer notification + owner confirmation)
  - payment_intent.payment_failed → booking.status = cancelled, notify owner
  - charge.refunded → update refund info on booking
  - charge.dispute.created → flag booking, create admin notification
  - account.updated → (already handled in Phase 7, extend if needed)
  - payout.failed → notify trainer
- Idempotency: store processed event IDs in a processed_webhooks table, reject duplicates
- Refund policy as a pure function: lib/stripe/refund-policy.ts — takes booking + cancellation time, returns { refund_cents, retained_cents, reason }
- Cancel booking flow:
  - Owner cancels → apply policy, issue refund via stripe.refunds.create with idempotency key, update booking.status = cancelled
  - Trainer cancels → full refund always, update booking.status = cancelled
- Payment confirmation page + email (use React Email for templates)

Critical tests (testing-agent):
- Unit test: refund-policy.ts across every cancellation window
- Integration test: webhook handler processes payment_intent.succeeded correctly and is idempotent on duplicate
- Integration test: webhook rejects requests with bad signatures
- E2E test in Playwright: full book → pay with 4242 → webhook → see confirmation
- E2E test: book → pay with 4000 0000 0000 0002 (decline) → see failure state

Before starting:
- Have the Stripe CLI running for local webhook testing
- Explain (teach me) idempotency keys in Stripe — what happens with a duplicate request, why this matters

Done when:
- A booking can be paid for, confirmed via webhook, and show as confirmed in both dashboards
- Cancellation produces correct refund
- All critical tests pass
- Webhook is idempotent and signature-verified
- Refund policy matches the matrix in stripe-agent.md
```

---

## Phase 9 — Messaging

```
Phase 9: in-app messaging between owner and trainer.

Agents: database-agent (realtime-friendly schema, RLS for thread participants), backend-agent (send message Server Action), frontend-agent (conversation UI), testing-agent.

Scope:
- Message threads auto-created on first booking (idempotent — check if thread exists first)
- Conversation list UI (/messages) showing all threads with preview + unread count
- Conversation detail UI (/messages/[threadId]) with message history and send box
- Send message via Server Action
- Supabase Realtime subscription for live updates in the conversation view
- Read receipts — message.read_at set when the recipient opens the conversation
- Unread badge in global nav
- Message content validation (length limits, Zod-validated)
- V1 restrictions: no links in messages, no file attachments, no message deletion
- RLS: users can only read/write in threads they're part of

Before starting:
- Walk me through how Supabase Realtime works — what's the subscription model, what are the limits, when does it scale badly
- Ask me about notification behavior — should receiving a message create a notification row (yes, I think) and trigger an email (maybe, with a digest preference — defer full logic to Phase 11)

Done when:
- Two users can message in real time (test with two browsers)
- Unread state updates correctly
- RLS blocks access from non-participants (write an integration test for this)
- E2E test: owner sends message, trainer receives in real time, trainer replies, owner sees reply
```

---

## Phase 10 — Reviews

```
Phase 10: post-session reviews.

Agents: database-agent (constraints), backend-agent (Server Actions for review submission + trainer response), frontend-agent (review UI on owner dashboard + trainer profile), testing-agent.

Scope:
- After booking.status = completed, show review prompt on owner dashboard
- Review form: 1-5 stars (required), written review (optional, but encouraged with placeholder prompts)
- DB constraint: one review per booking (unique)
- Review appears on trainer public profile, sorted newest first
- Trainer response: trainer can post one response per review
- Rating aggregation: compute average on trainer profile (use a view or computed column — discuss tradeoffs)
- Report button on each review → creates a moderation_queue entry for admin review

Before starting:
- Discuss the aggregation strategy — materialized view? trigger-maintained column? Query-time aggregation? Tradeoffs
- Ask me about the review moderation policy — do we auto-hide flagged reviews until admin approves, or keep them visible until admin acts?

Done when:
- Review flow works end-to-end
- Constraint prevents duplicate reviews
- Aggregate rating on trainer profile is correct
- Trainer can respond once
- Review display is accessible (proper ARIA for star ratings)
```

---

## Phase 11 — Notifications + transactional email

```
Phase 11: notifications — in-app and email.

Agents: backend-agent (notification creation + email triggers), database-agent (notifications table, email preferences), devops-agent (Resend setup, Supabase Edge Functions for scheduled jobs), frontend-agent (notification bell + preferences UI), testing-agent.

Scope:
- Every major business event creates a notification:
  - Booking pending (owner) / booking received (trainer)
  - Booking confirmed (both)
  - Booking cancelled (both, with reason)
  - Session reminder 24h out (both)
  - Session reminder 1h out (both)
  - New message
  - Review received (trainer) / thank you for reviewing (owner)
  - Payout arriving (trainer)
- In-app notification bell with unread count, panel showing recent notifications
- Email via Resend using React Email templates:
  - Set up Resend account (Shane, 1 min)
  - Configure domain DNS for proper deliverability (SPF, DKIM)
  - Templates for each event type
- User email preferences page:
  - Separate toggles per notification type
  - Always-on: security-critical emails (password reset, account actions) — not user-controllable
- Scheduled reminders:
  - Supabase Edge Function + pg_cron for 24h and 1h reminder dispatch
  - Idempotent — don't double-send

Before starting:
- Walk me through setting up a Resend account and domain authentication (I need to know DNS record types: SPF, DKIM)
- Recommend which notifications should be opt-out by default vs. opt-in (my preference: critical booking/payment emails are not-opt-outable, marketing-ish emails are opt-in)

Done when:
- Every trigger above creates both in-app + email
- Emails render correctly in Gmail, Apple Mail, and at least one other client
- 24h reminder fires at the right time in testing (use a test booking with start_at = now + 24h1m)
- Preferences page works
- Idempotency verified — the same event processed twice doesn't send two emails
```

---

## Phase 12 — Admin dashboard

```
Phase 12: Shane's admin dashboard.

Agents: frontend-agent, backend-agent, database-agent (admin role + audit logs), testing-agent.

Scope:
- Admin role: add 'admin' to the role enum; manually SQL-promote my account (no UI to create admins — only via direct SQL for safety)
- /admin/* route group gated by role=admin
- Dashboard home: KPIs (users, trainers, bookings, revenue, platform fee revenue) with time filters
- Users list + detail: view profile, trainer info, booking history, suspend/unsuspend
- Bookings list + filters by status, date range, search
- Refund action: manual refund any booking (partial or full) — creates a Stripe refund and updates booking state
- Disputes queue: bookings with active chargebacks
- Moderation queue: reported reviews — approve/reject/hide
- Audit log: all admin actions logged to an admin_actions table (who, what, when)

Security:
- All admin actions are audit-logged
- Destructive actions (suspend user, refund) require a confirm step
- Admin session is separate — consider re-auth for sensitive actions

Before starting:
- Ask me exactly what KPIs I want on the dashboard (propose a set, I'll edit)
- Ask me whether audit log is visible to admins or only queryable via SQL (propose: visible, so there's accountability)

Done when:
- I can see my app's state across all users and bookings
- I can refund a booking and see the refund in Stripe dashboard
- I can suspend a user and they lose access
- Every admin action appears in the audit log
```

---

## Phase 13 — Production hardening

```
Phase 13: get the app ready for real users.

Agents: devops-agent (observability, performance, security infra), backend-agent (rate limiting, input hardening), frontend-agent (SEO, metadata, a11y pass), testing-agent (load tests).

Scope:
- Sentry integration in Next.js (server + client, source maps uploaded)
- Structured logging throughout (helpful JSON to stdout)
- Rate limiting on auth endpoints, signup, and messaging (use Upstash Redis if needed, or Vercel edge-middleware)
- CAPTCHA on signup (Cloudflare Turnstile — free)
- Security headers: CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy
- Performance pass:
  - Run Lighthouse on key pages, target ≥90 on perf/a11y/best-practices/SEO
  - Bundle size audit — flag any route chunks > 200KB gzipped
  - Image optimization verification
- SEO:
  - sitemap.xml generated dynamically from trainer profiles
  - robots.txt
  - OG tags per page (especially trainer profiles — rich preview when shared)
  - JSON-LD structured data for trainer profiles (LocalBusiness schema)
- Accessibility audit:
  - Color contrast check on all UI
  - Keyboard navigation test for critical flows
  - Screen reader pass on at least: auth, search, booking
- Terms of Service + Privacy Policy (I'll draft — you give me a skeleton; I'll get legal review before go-live)
- Data portability:
  - /account/export endpoint that returns a user's data as JSON
  - Account deletion: soft-delete + 30-day grace + hard-delete + Stripe customer archival
- Load test the critical flows (k6 or Artillery) — simulate 50 concurrent bookings

Before starting:
- Ask me what budget I'm willing to spend on infrastructure (Upstash has a free tier; Sentry Developer is free; I likely won't need paid tiers yet)

Done when:
- Sentry is catching errors in preview
- Lighthouse scores meet targets
- Rate limits verified
- Legal pages live
- Load test results documented
- Accessibility audit complete with findings triaged
```

---

## Phase 14 — Go-live prep

```
Phase 14: switch to production.

Agents: devops-agent primarily, stripe-agent for the live key swap, database-agent for the production DB setup.

Pre-reqs (confirm before starting):
1. Custom domain purchased
2. Terms of Service + Privacy Policy legally reviewed
3. Stripe platform profile fully approved (not just submitted)
4. Seed population plan: I have 5-10 trainers in my Global K9 / PSA network who've agreed to be beta users

Scope:
- Provision production Supabase project
- Run all migrations against production
- Production env vars configured in Vercel
- Custom domain DNS configured, SSL verified
- Stripe live keys swapped in (production env only; preview stays on test)
- Stripe webhook endpoints registered for the production domain
- Supabase Auth URL allowlist updated
- Resend domain authenticated for the production domain
- Sentry production project configured
- Smoke test checklist run against production
- Backup verification: confirm pg_dump is working on schedule
- Runbook for incidents: what do I do when X breaks?
- Soft launch plan: invite list, messaging for beta trainers, feedback channel

Do not execute the live go-live without pausing for explicit approval at each irreversible step:
- Switching Stripe to live mode
- Pointing DNS to the production Vercel deployment
- Sending the first trainer onboarding invites

Done when:
- First real trainer onboards and can receive bookings
- First real owner books and pays for a real session
- Money actually flows — Stripe charge → platform fee retained → transfer to trainer → trainer gets a payout
- First review submitted
```

---

## Between-phase prompts

**When you hit a bug you can't explain:**

```
I'm seeing [describe the behavior you expected vs. what's happening]. Here's the relevant code: [paste]. Here's the error/log: [paste]. Before fixing, help me understand what's actually happening — I want to learn, not just get unstuck.
```

**When you want to learn a concept deeper:**

```
I just built [feature] but I don't fully understand [concept]. Explain it to me like I'm a smart beginner. Use a concrete example from our codebase, not hypothetical.
```

**When Claude Code's context is getting messy:**

```
/clear

Start fresh. Read CLAUDE.md and build-plan.md to reorient. We're currently in Phase [N] working on [specific task]. Here's where we left off: [one paragraph]. Continue from there.
```

**When you want to plan before executing:**

```
Before writing any code, walk me through your plan for [task]. List the files you'll create or modify, the order you'll do them in, and any decisions where my input would help. Wait for me to say "go."
```
