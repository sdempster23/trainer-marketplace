# PawMatch — Build Plan

This document is the master sequence of work. Each phase has a goal, a rough time estimate at 10 hours/week solo, and a done-when checklist. Work the phases in order. Don't skip ahead.

As phases complete, update the status below (change `[ ]` to `[x]`).

---

## Phase status

- [ ] Phase 0 — Scaffold (1 week)
- [ ] Phase 0.5 — Deploy the empty app to Vercel (2 days)
- [ ] Phase 1 — Data model foundations (2 weeks)
- [ ] Phase 2 — Authentication (1.5 weeks)
- [ ] Phase 3 — Trainer profiles (2 weeks)
- [ ] Phase 4 — Owner profiles + dogs (1 week)
- [ ] Phase 5 — Search & discovery (2 weeks)
- [ ] Phase 6 — Booking system (3 weeks)
- [ ] Phase 7 — Stripe Connect onboarding (2 weeks)
- [ ] Phase 8 — Payment flow + webhook (2 weeks)
- [ ] Phase 9 — Messaging (1.5 weeks)
- [ ] Phase 10 — Reviews (1 week)
- [ ] Phase 11 — Notifications + email (1.5 weeks)
- [ ] Phase 12 — Admin dashboard (1 week)
- [ ] Phase 13 — Production hardening (2 weeks)
- [ ] Phase 14 — Go-live prep (open-ended)

**Rough total: ~22 weeks of 10 hr/week work = ~5.5 months for a working prototype. Production-ready adds another 2–3 months.**

---

## Phase 0 — Scaffold

**Goal**: A Next.js 15 project running locally on `http://localhost:3000`, with TypeScript strict, Tailwind v4, shadcn/ui initialized, pnpm, ESLint, Prettier, and a CI-ready test setup.

**What gets built:**
- `create-next-app` with TypeScript, Tailwind, App Router, ESLint, src-less layout (app in root)
- shadcn/ui initialized with the navy/amber theme configured
- Vitest + Playwright configured with example tests
- `.nvmrc` with Node LTS
- `.gitignore`, `.env.example`, `.prettierrc`
- Folder structure as defined in CLAUDE.md

**Done when:**
- [ ] `pnpm dev` serves the home page
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` runs the one example test and passes
- [ ] `pnpm build` completes successfully
- [ ] Initial commit pushed to GitHub

---

## Phase 0.5 — Deploy the empty app

**Goal**: Muscle memory for the deploy path before there's anything complex to deploy.

**What gets built:**
- GitHub repo linked to Vercel
- First production deployment of the scaffold
- Basic GitHub Actions CI pipeline

**Done when:**
- [ ] Vercel project created and linked to GitHub
- [ ] Main branch deploys automatically to preview
- [ ] CI runs lint + typecheck + test on every PR
- [ ] You've successfully made a change, opened a PR, seen a preview URL, merged, and seen it live

---

## Phase 1 — Data model foundations

**Goal**: Supabase project set up. Core tables created with RLS. TypeScript types generated.

**What gets built:**
- Supabase dev project created
- Supabase CLI linked locally
- Migrations for: `profiles`, `dogs`, `trainers`, `trainer_certifications`, `trainer_specialties` enum, `trainer_services`, `trainer_availability`, `trainer_stripe_accounts`, `bookings`, `message_threads`, `messages`, `reviews`, `notifications`
- RLS policies for all of the above
- PostGIS extension enabled
- `updated_at` trigger function and triggers on all tables
- Seed data for local development
- Generated `types/supabase.ts`

**Done when:**
- [ ] All migrations apply cleanly via `supabase db reset`
- [ ] `supabase gen types` produces clean types
- [ ] Every table has RLS enabled and at least one policy
- [ ] Seed data loads without errors
- [ ] You can explain what RLS does in one sentence

---

## Phase 2 — Authentication

**Goal**: A user can sign up as an owner or a trainer, confirm their email, sign in, sign out, and reset their password. Middleware enforces role-based route access.

**What gets built:**
- Supabase Auth configured with email/password + magic link
- Sign up flow with role selection (owner vs. trainer)
- Sign in, sign out, password reset
- Email confirmation (via Supabase's built-in email)
- Next.js middleware that gates `/owner/*` and `/trainer/*` routes by role
- `profiles` row created automatically on signup (via DB trigger)
- Session management using `@supabase/ssr`
- `requireUser()` helper for route handlers

**Done when:**
- [ ] Full auth flow works end-to-end for both roles
- [ ] A logged-out user hitting `/trainer/dashboard` gets redirected to sign-in
- [ ] An owner hitting `/trainer/dashboard` gets a 403
- [ ] Password reset email arrives
- [ ] Integration tests cover each auth path

---

## Phase 3 — Trainer profiles

**Goal**: A signed-in trainer can build out their profile — bio, photo, certifications, specialties, services (prices + session types), availability (weekly schedule), service area.

**What gets built:**
- Trainer onboarding wizard (multi-step form)
- Profile edit pages
- Avatar + gallery image upload via Supabase Storage
- Service CRUD
- Availability editor (recurring weekly template)
- Service area picker (map + radius slider)
- Public trainer profile page (read-only view at `/trainers/[slug]`)

**Done when:**
- [ ] A trainer can complete a profile from empty to discoverable
- [ ] Images upload, resize, and serve from Supabase Storage
- [ ] Service area saved as PostGIS geography
- [ ] Public profile page renders for logged-out visitors
- [ ] E2E test: trainer signs up → fills profile → profile is visible

---

## Phase 4 — Owner profiles + dogs

**Goal**: A signed-in owner can set up their profile and add their dog(s).

**What gets built:**
- Owner onboarding (name, location, photo)
- Dog CRUD (name, breed, age, notes, photo)
- "My dogs" page

**Done when:**
- [ ] Owner can add, edit, delete dogs
- [ ] Owner location saved as PostGIS point (for search origin)
- [ ] Breed autocomplete from a static list (AKC breed list is fine)

---

## Phase 5 — Search & discovery

**Goal**: An owner can search trainers by location, filter by specialty/price/rating, and view results in a list and on a map.

**What gets built:**
- Search page with filters
- Geo query (trainers whose service area covers the owner's location, within a max distance)
- Filters: specialty (multi), price range, min rating, session type (in-home/at-trainer/virtual)
- Sort: distance, rating, price
- List view + toggleable map view (using MapLibre or Mapbox GL — choose one)
- Trainer card component (photo, name, specialties, distance, starting price, rating)
- Pagination or infinite scroll

**Done when:**
- [ ] Search returns correct results for a given owner location
- [ ] Filters combine correctly (AND between filter groups, OR within)
- [ ] Map view shows trainer markers and clicking opens a card
- [ ] Empty states, loading states, error states all handled
- [ ] Performance: search returns in <500ms with seed data of 100 trainers

---

## Phase 6 — Booking system

**Goal**: An owner can select a trainer, pick a service and a time slot, and reach a "checkout" screen (payment comes in Phase 8).

**What gets built:**
- Time slot generation from trainer's availability + existing bookings
- Booking form: dog, service, date, time, notes
- Tentative hold mechanism (reservations don't persist forever)
- Confirmation preview before checkout
- Booking state machine implementation
- Trainer's bookings page
- Owner's bookings page

**Done when:**
- [ ] Available slots are computed correctly (subtracting existing bookings and blocked times)
- [ ] Race condition is handled: two owners trying to book the same slot — exactly one succeeds
- [ ] State transitions enforced at the DB level (trigger or constraint) and in code
- [ ] Both parties see bookings in their respective dashboards

---

## Phase 7 — Stripe Connect onboarding

**Goal**: A trainer can complete Stripe Express onboarding and reach "payouts enabled" status.

**Pre-req**: Shane must complete the Stripe platform profile and receive approval from Stripe (1–5 business days — start this early in Phase 6).

**What gets built:**
- "Set up payouts" CTA on trainer dashboard
- Server action: create Express account + account link
- Redirect to Stripe's hosted onboarding
- Return URL handling
- Account status polling / refresh
- `trainer_stripe_accounts` records updated via webhook (`account.updated`)
- UI states: not started, in progress, rejected, enabled
- Webhook handler stub (receives events, logs them; full handler in Phase 8)

**Done when:**
- [ ] A trainer completes test-mode onboarding end-to-end
- [ ] `charges_enabled` and `payouts_enabled` reflected in UI
- [ ] Bookings can only be accepted by payout-enabled trainers
- [ ] `account.updated` webhook received and processed in dev

---

## Phase 8 — Payment flow + full webhook handler

**Goal**: Owner pays for a booking. Payment captured. Webhook confirms booking. Trainer sees "payment received."

**What gets built:**
- PaymentIntent creation with `application_fee_amount` and `transfer_data.destination`
- Stripe Payment Element integration on checkout
- `app/api/webhooks/stripe/route.ts` — signature verification, event routing, idempotent processing
- Handlers for: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `account.updated`, `payout.failed`
- Refund policy as a pure function + application at cancellation time
- Cancel booking flow (both owner + trainer sides)
- Payment confirmation page + email

**Done when:**
- [ ] A full book → pay → webhook → confirm flow works with test cards
- [ ] Webhook signature verification rejects forged requests
- [ ] Duplicate webhooks (same event ID twice) are no-ops
- [ ] Refund amounts match the policy for each cancellation window
- [ ] Platform commission correctly deducted (test: trainer's Stripe balance shows amount minus fee)
- [ ] Full E2E test in Playwright: owner books → pays → sees confirmation → trainer sees booking

---

## Phase 9 — Messaging

**Goal**: Owner and trainer can message each other within a booked relationship. Realtime delivery. Read receipts.

**What gets built:**
- Message thread created automatically on first booking between owner + trainer
- Send message (Server Action)
- Realtime subscription via Supabase Realtime for live updates
- Unread indicators
- Basic content moderation (length limits, no links in V1, profanity filter optional)
- Conversation list + conversation detail UI

**Done when:**
- [ ] Messages deliver in realtime between two browsers
- [ ] Unread count updates correctly
- [ ] Users can only message people they're booked with
- [ ] Messages survive browser refresh (they're persisted)

---

## Phase 10 — Reviews

**Goal**: After a completed booking, the owner can leave a rating + text review. Trainer can respond.

**What gets built:**
- Review prompt on owner dashboard after session completion
- Review form (stars + text)
- Trainer response flow
- Review display on trainer profile (with average rating calculation)
- Report-a-review button → admin queue (Shane reviews manually)
- Constraint: one review per booking

**Done when:**
- [ ] Review can only be left after status=completed
- [ ] Average rating aggregated correctly on trainer profile
- [ ] Trainer can respond once per review
- [ ] Reviews visible on public trainer profile page

---

## Phase 11 — Notifications + transactional email

**Goal**: Both users get notified at the right moments — in-app notifications + transactional emails.

**What gets built:**
- Notification table populated at business-event boundaries (booking created, payment succeeded, message received, review received, etc.)
- In-app notification bell + panel
- Email templates (using React Email + Resend): booking confirmation, cancellation, reminder 24h out, reminder 1h out, new message, review received
- User email preferences (which emails to receive)
- Scheduled jobs for time-based notifications (24h reminder etc.) — use Supabase Edge Functions + pg_cron

**Done when:**
- [ ] Every major event creates appropriate in-app + email notifications
- [ ] Emails render correctly in Gmail, Apple Mail, Outlook (test with Litmus or manually)
- [ ] 24h reminder fires at the right time
- [ ] User can opt out of non-essential emails
- [ ] No notification creates duplicate sends (idempotent)

---

## Phase 12 — Admin dashboard

**Goal**: Shane can see all users, bookings, revenue, and intervene when needed (refund a booking, suspend a user, moderate a review).

**What gets built:**
- Admin-only route group (`/admin/*`)
- Admin role flag + UI gating
- Users list + detail
- Bookings list + filters by status
- Revenue dashboard (gross, platform fee, net to trainers, over time)
- Dispute queue (bookings with chargebacks)
- Moderation queue (reported reviews)
- Manual refund button
- User suspend/unsuspend

**Done when:**
- [ ] Shane can self-promote to admin (via a `.sql` script, not UI)
- [ ] Revenue numbers match Stripe dashboard numbers
- [ ] Refund button actually refunds via Stripe + updates booking state
- [ ] Suspended users can't sign in

---

## Phase 13 — Production hardening

**Goal**: The app is ready for real users — observability, error handling, performance, security review.

**What gets built:**
- Sentry integration across client and server
- Structured logging throughout
- Rate limiting on auth endpoints and signup
- CAPTCHA on signup (hCaptcha or Cloudflare Turnstile)
- Content security policy + security headers
- Performance pass: lighthouse audit, bundle size review, Core Web Vitals
- SEO: sitemap, robots.txt, OG tags, structured data for trainer profiles
- Terms of Service + Privacy Policy pages (Shane drafts, get legal review)
- GDPR/CCPA: data export endpoint, account deletion with proper cascading
- Backup strategy for Supabase (pg_dump on schedule, store in S3-compatible storage)
- Load test the booking + payment flow (k6 or Artillery)

**Done when:**
- [ ] Sentry catching errors in preview
- [ ] Lighthouse ≥ 90 on performance, accessibility, best practices, SEO for key pages
- [ ] Rate limits verified working
- [ ] ToS + Privacy Policy live and linked from footer
- [ ] Data export works for a test user

---

## Phase 14 — Go-live prep

**Goal**: Switch from "it works" to "real users can sign up."

This is the most variable phase. It depends on Shane's readiness to go live from a business perspective.

**What gets built:**
- Production Supabase project provisioned
- Production Stripe live keys obtained (requires Stripe review completion)
- Custom domain purchased + DNS configured
- Production Vercel environment configured
- Final smoke tests against production
- Soft launch plan — invite 5–10 trainers in Shane's PSA network first
- Feedback loop — how trainers can report issues, how Shane triages

**Done when:**
- [ ] First real trainer has onboarded and received at least one booking
- [ ] First real owner has booked and completed a session
- [ ] First real review has been submitted
- [ ] First real payout has landed in a trainer's bank account

This is the milestone where "prototype" becomes "live product."

---

## Working rhythm suggestions

- **Sessions of 90 minutes work well** — long enough to get real work done, short enough to stay fresh
- **End every session with a commit** — even if it's imperfect, a checkpoint matters
- **Take notes per phase** — what you learned, what surprised you, what you'd do differently
- **Review your own code once a week** — rereading what you built a week ago teaches you what you didn't understand then
- **Talk to real users early** — even a phase-5 version is enough to show a few trainers in the Global K9 network for feedback
