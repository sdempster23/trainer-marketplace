# PawMatch — Architecture Overview

This document describes the system shape and data model. Read it once at the start, then refer back whenever a new piece of the puzzle needs to fit into the bigger picture.

---

## System diagram

```
                         ┌──────────────────────┐
                         │   OWNER BROWSER      │
                         │   (mobile/desktop)   │
                         └──────────┬───────────┘
                                    │
                                    │ HTTPS
                                    │
                         ┌──────────▼───────────┐
                         │   TRAINER BROWSER    │
                         │   (mobile/desktop)   │
                         └──────────┬───────────┘
                                    │
                                    │
                    ┌───────────────▼────────────────┐
                    │      NEXT.JS APP (Vercel)      │
                    │                                │
                    │  • Server Components (SSR)     │
                    │  • Route Handlers (API)        │
                    │  • Server Actions              │
                    │  • Middleware (auth gating)    │
                    └─┬────────┬───────────┬─────────┘
                      │        │           │
          ┌───────────┘        │           └───────────┐
          │                    │                       │
          ▼                    ▼                       ▼
    ┌──────────┐       ┌──────────────┐        ┌─────────────┐
    │ SUPABASE │       │    STRIPE    │        │   RESEND    │
    │          │       │              │        │             │
    │ Postgres │       │ • Customers  │        │  Transact.  │
    │ + Auth   │       │ • Connect    │        │    Email    │
    │ + Storage│       │ • Payments   │        │             │
    │ + Realtime│      │ • Webhooks ──┼────────┼──►   ◄──── ─┤
    └──────────┘       └──────────────┘        └─────────────┘
          ▲                    │
          │                    │ webhooks
          │                    ▼
          │            ┌────────────────┐
          └────────────┤  WEBHOOK ROUTE │
                       │  (/api/webhooks│
                       │   /stripe)     │
                       └────────────────┘

                            ┌─────────────┐
                            │   SENTRY    │  (errors from every tier)
                            └─────────────┘
```

**Data flows of note:**
- Owner's browser never talks directly to Stripe for payment confirmation — the source of truth is the webhook from Stripe → our server → Supabase
- Trainer's browser never talks directly to Supabase with the service role key — all privileged operations go through our server
- Realtime updates (new messages, booking status changes) flow via Supabase Realtime subscriptions to the browser

---

## User types and role model

```
auth.users  (managed by Supabase Auth — email, password hash, session)
    │
    │ 1:1
    ▼
profiles  (our user table — role, display name, avatar)
    │
    ├── role = 'owner'
    │     │
    │     └── has many → dogs
    │         has many → bookings (as owner)
    │         has many → messages (sender)
    │         has many → reviews (author)
    │
    └── role = 'trainer'
          │
          └── has 1 → trainers (extended profile)
              has many → trainer_certifications
              has many → trainer_services
              has many → trainer_availability
              has 1 → trainer_stripe_accounts
              has many → bookings (as trainer)
              has many → messages (sender)
              has many → reviews (about them)
```

A single `auth.users` row → single `profiles` row → role determines which extension tables apply.

---

## Core entity relationships

```
                  OWNER                          TRAINER
                   │                                │
                   │                                │
              has many                          has many
                   │                                │
                   ▼                                ▼
                 dogs                      trainer_services
                   │                                │
                   │                                │
                   └────────── BOOKING ─────────────┘
                                  │
                          ┌───────┴───────┐
                          │               │
                          ▼               ▼
                   stripe_payment    message_thread
                                          │
                                          ▼
                                       messages
                          │
                       after
                     completion
                          │
                          ▼
                       review
```

---

## Booking lifecycle (the state machine)

```
    Owner initiates
    checkout
         │
         ▼
   ┌──────────┐
   │ PENDING  │◄─── created with stripe_payment_intent_id
   └────┬─────┘
        │
        ├───► Stripe webhook: payment_intent.succeeded
        │
        ▼
   ┌───────────┐
   │ CONFIRMED │◄─── money held by Stripe, trainer notified
   └─────┬─────┘
         │
         │   (time passes, session occurs)
         │
    ┌────┴────────────────────────┐
    │                             │
    ▼                             ▼
After session end                Owner or trainer
  (auto-complete                  cancels
   after 24h)                        │
    │                                │
    ▼                                ▼
┌───────────┐                  ┌───────────┐
│ COMPLETED │                  │ CANCELLED │
└───────────┘                  └───────────┘
   │                                 │
   │                                 │
   ▼                                 ▼
Transfer to trainer              Refund policy
(minus platform fee)             applied (see
                                 stripe-agent.md)
   │
   ▼
Review eligible
```

Rules:
- Only forward transitions (no going from cancelled back to pending)
- PENDING → CONFIRMED **only** via Stripe webhook
- CONFIRMED → COMPLETED **only** after session end time (+ grace period) OR manual trainer mark-complete
- Either party can cancel while CONFIRMED; both see the refund outcome per policy
- Review can only be created for a COMPLETED booking, by the owner

---

## Authentication and authorization layers

**Three layers, each enforcing the same rules:**

1. **Route middleware** — gates whole routes (e.g., `/trainer/*` requires role=trainer)
2. **Route handler auth check** — `requireUser()` + role check as first operation
3. **Postgres Row Level Security** — even if application code had a bug, the DB refuses unauthorized reads/writes

The database RLS is the last line of defense. Treat it as inviolable.

---

## Why these choices

**Why Next.js App Router over Pages Router?**
Server Components reduce the amount of client JS and simplify data fetching. App Router is the current direction; Pages Router is maintained but not recommended for new projects.

**Why Supabase over rolling our own Postgres + auth?**
Supabase bundles Postgres + Auth + Storage + Realtime behind one API. For a solo builder, this is a massive time saver. We can always migrate off if we outgrow it — the database is just Postgres.

**Why Stripe Connect Express over Standard?**
Express means trainers don't need their own full Stripe dashboard. Stripe handles the KYC UI, their identity verification, their bank connection. Standard requires trainers to set up their own dashboard and is heavier for non-technical users.

**Why Tailwind + shadcn over a component library like MUI?**
Tailwind + shadcn gives you components you own and can modify, with less runtime overhead. MUI is great for internal tools; for a consumer-facing marketplace where brand matters, owning the components is worth it.

**Why Vercel over AWS?**
Zero-config for Next.js. Preview deploys on every PR are fantastic for solo iteration. When costs become a concern (~5k+ users), revisit.

---

## What's deliberately NOT in V1

Scope discipline matters. These are explicitly deferred:

- **Native mobile apps** — V1 is a mobile-optimized web app. Native comes later if product-market fit is strong.
- **Multiple languages / currencies** — US English, USD only.
- **Subscription plans for trainers** — per-session commission only to start.
- **Video sessions in-app** — virtual sessions will link out to Zoom/Google Meet for V1.
- **Automated dispute arbitration** — manual admin handling (Shane) for now.
- **Loyalty / referral program** — nice-to-have, explicitly Phase 2.
- **AI-generated trainer recommendations** — basic filter + sort first; personalization later once there's real usage data.

---

## What Shane will learn by building each layer

This isn't just a project roadmap — each phase teaches a durable concept.

| Phase | Marketplace concept learned |
|---|---|
| 1. Data model | Relational design, normalization, denormalization tradeoffs |
| 2. Auth | Session management, JWT, RBAC |
| 3–4. Profiles | CRUD patterns, image upload, form UX |
| 5. Search | Geo queries, index design, pagination |
| 6. Booking | State machines, race conditions, reservation systems |
| 7–8. Stripe | Connect model, webhooks, idempotency, money math |
| 9. Messaging | Realtime/WebSocket patterns, read receipts, notification fan-out |
| 10. Reviews | Trust systems, moderation primitives |
| 11. Notifications | Queueing, fan-out, deliverability |
| 12. Admin | Role escalation, audit logging |
| 13. Production | Observability, deployment pipelines, incident response |
| 14. Hardening | Performance budgets, security review, load testing |

Take notes as you go. The mechanics you learn here transfer to any future product.
