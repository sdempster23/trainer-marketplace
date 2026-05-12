-- ============================================================================
-- Migration 5 — trainer_stripe_accounts
-- ============================================================================
-- Phase 1's fifth migration. Adds the Stripe Connect account state mirror
-- for the trainer side. Phase 7 will populate these rows during Express
-- onboarding (via server action calling Stripe's accounts.create) and
-- Phase 8 will keep them in sync via the account.updated webhook handler.
--
-- One object: trainer_stripe_accounts. 1:1 with trainers via id-as-PK,
-- continuing the auth.users → profiles → trainers → trainer_stripe_accounts
-- extension chain.
--
-- ============================================================================
-- ARCHITECTURAL SIGNATURE: WRITE PATH IS SERVICE-ROLE ONLY
-- ============================================================================
-- This table has a deliberately asymmetric RLS shape that diverges from
-- every prior migration. Read it carefully before changing anything.
--
--   SELECT  → authenticated trainer reads their own row. anon and
--             cross-trainer authenticated see zero rows (no matching
--             policy).
--   INSERT  → NO POLICY EXISTS.
--   UPDATE  → NO POLICY EXISTS.
--   DELETE  → NO POLICY EXISTS.
--
-- All mutation flows through Supabase's service_role JWT, used by
-- server actions and webhook handlers running server-side. service_role
-- bypasses RLS entirely, which is exactly what we want for this table.
--
-- The lockdown is enforced by TWO INDEPENDENT GATES:
--
--   GATE 1 (RLS):    no INSERT/UPDATE/DELETE policies. No row-security
--                    path admits a write.
--   GATE 2 (GRANT):  authenticated has SELECT only. No INSERT/UPDATE/
--                    DELETE GRANT exists for any non-service role.
--                    Even if a future migration accidentally added an
--                    RLS policy, the table-level privilege check would
--                    still reject the operation.
--
-- WHY TWO GATES, NOT ONE
-- ----------------------
-- trainer_stripe_accounts mirrors external Stripe state. Stripe is the
-- source of truth for every column other than `id`. We do not trust the
-- trainer's browser to write `charges_enabled = true`, and we do not
-- want a single future RLS-policy mistake to make that possible. The
-- only legitimate mutation path is the webhook handler (Phase 8), which
-- runs service-side and validates Stripe's signature before writing.
--
-- DO NOT ADD A PARTIAL FIX
-- ------------------------
-- If a future migration relaxes either gate (adds an RLS INSERT/UPDATE/
-- DELETE policy OR adds an INSERT/UPDATE/DELETE GRANT to authenticated),
-- the design is partially undone. The two-gate structure is the design;
-- a partial fix is a security regression. If you genuinely need a
-- trainer to write here, the architectural conversation is "should we
-- still be mirroring Stripe state at all?" — not "let's loosen one
-- gate."
--
-- ============================================================================
-- ROW ABSENCE IS A FIRST-CLASS STATE
-- ============================================================================
-- A trainer who hasn't started Stripe onboarding has NO ROW in this table.
-- This is intentional and load-bearing: row-presence already carries the
-- "has started onboarding" signal cleanly. Do not denormalize this with
-- a boolean column ("started_onboarding") on trainers or here — the
-- presence/absence dichotomy is the cleanest possible model and any flag
-- column would just duplicate it with drift risk.
--
-- Onboarding progress beyond "started" lives in the three primitive
-- booleans (charges_enabled, payouts_enabled, details_submitted) plus
-- requirements_due. "Onboarding complete" is COMPUTED at query time from
-- those four — do not store the derived state.
--
-- ============================================================================
-- NO SOFT-DELETE
-- ============================================================================
-- This is an external state mirror, not authoritative data. Hard-delete
-- via CASCADE from trainers is correct. App-side admin / GDPR tooling
-- (Phase 12) is responsible for calling Stripe's API to delete the
-- external account when the trainer is purged. An orphaned Stripe account
-- (deleted locally but still live at Stripe) is a separate reconciliation
-- problem; soft-delete locally would not help.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. trainer_stripe_accounts table
-- ----------------------------------------------------------------------------
-- 1:1 with trainers. id IS trainer_id. Onboarding state lives in the
-- three primitive booleans + requirements_due jsonb. Onboarding-complete
-- is COMPUTED AT QUERY TIME from those four primitives — do not
-- denormalize.
-- ----------------------------------------------------------------------------
create table public.trainer_stripe_accounts (
  id                  uuid        primary key references public.trainers(id) on delete cascade,
  stripe_account_id   text        not null unique,
  charges_enabled     boolean     not null default false,
  payouts_enabled     boolean     not null default false,
  details_submitted   boolean     not null default false,
  requirements_due    jsonb,
  default_currency    text,
  country             text,
  business_type       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.trainer_stripe_accounts is
  '1:1 mirror of trainer Stripe Connect Express account state. Populated during Phase 7 onboarding via server action; kept in sync via Phase 8 webhook handler. ROW ABSENCE is a first-class state (= trainer has not started onboarding) — do not denormalize with a boolean flag. WRITES happen only via service_role; see migration header for the two-gate design.';

comment on column public.trainer_stripe_accounts.id is
  'PK + FK to trainers(id) on delete cascade. Same id-as-PK pattern as trainers extends profiles; continues the auth.users → profiles → trainers → trainer_stripe_accounts extension chain.';

comment on column public.trainer_stripe_accounts.stripe_account_id is
  'Stripe-issued account identifier (format: acct_xxx). UNIQUE: defense against the same Stripe account being linked to two trainer rows by a dev bug. Set once at row creation; never mutated.';

comment on column public.trainer_stripe_accounts.charges_enabled is
  'Stripe says: account can charge customers. One of the three booleans that compose "onboarding complete" — do not store that derived state, compute it at query time.';

comment on column public.trainer_stripe_accounts.payouts_enabled is
  'Stripe says: account can receive payouts to its bank. Part of the onboarding-complete derivation.';

comment on column public.trainer_stripe_accounts.details_submitted is
  'Stripe says: trainer has completed the onboarding form. Part of the onboarding-complete derivation.';

comment on column public.trainer_stripe_accounts.requirements_due is
  'Stripe Requirements object (jsonb). NULL or empty {} means no outstanding requirements. Non-empty means Stripe is asking for more information (additional ID verification, bank account, etc.) — Phase 7 UI surfaces this to the trainer. Fourth component of the onboarding-complete derivation.';

comment on column public.trainer_stripe_accounts.default_currency is
  'Lowercase ISO 4217 (e.g., usd). Populated from Stripe webhook. No DB CHECK against length=3 — same free-form-text policy lodged at M4.';

comment on column public.trainer_stripe_accounts.country is
  '2-letter ISO 3166-1 alpha-2 country code (e.g., US). Populated from Stripe.';

comment on column public.trainer_stripe_accounts.business_type is
  'Stripe business_type: individual, company, non_profit, government_entity (as of 2026). Stored as text, not enum, because Stripe may add values without warning — an enum here would require a migration each time Stripe extends the set. App-layer Zod or a runtime allowlist handles validation.';


-- ----------------------------------------------------------------------------
-- 2. updated_at trigger
-- ----------------------------------------------------------------------------
-- Uses the shared function from Migration 1. The webhook handler updates
-- this row on each account.updated event; updated_at gives us "last synced
-- from Stripe at" for free, useful for debugging webhook lag.
-- ----------------------------------------------------------------------------
create trigger trg_trainer_stripe_accounts_updated_at
  before update on public.trainer_stripe_accounts
  for each row execute function public.update_updated_at_column();


-- ----------------------------------------------------------------------------
-- 3. Indexes — V1 minimal
-- ----------------------------------------------------------------------------
-- Two indexes created implicitly by the table definition above:
--
--   - PK btree on (id)                  → primary access pattern, "find
--                                          this trainer's Stripe state"
--   - UNIQUE btree on (stripe_account_id) → webhook lookup pattern,
--                                          "find row for incoming
--                                          account.updated event"
--
-- Both Phase 7/8 access patterns are covered. No explicit idx_* needed.
--
-- INDEX ABSENCE IS DELIBERATE: filtering on (charges_enabled, payouts_
-- enabled) for Phase 12 admin queries ("all trainers pending onboarding")
-- runs over a small total population and tolerates a seq scan at V1
-- scale. Add a partial or composite index only if profiling shows a real
-- bottleneck. Reading absence as "forgotten" is the wrong inference.
-- ----------------------------------------------------------------------------
-- (no additional indexes)


-- ----------------------------------------------------------------------------
-- 4. RLS — SELECT ONLY for the row's owner (Gate 1)
-- ----------------------------------------------------------------------------
-- Single SELECT policy: trainer reads their own row. NO INSERT/UPDATE/
-- DELETE policies — see migration header for the two-gate write-path
-- design. Adding any of those policies undermines the architecture.
--
-- anon, cross-trainer authenticated, and the trainer themselves
-- attempting to write through their own session are all blocked by the
-- absence of a matching policy. Postgres returns zero rows on SELECT and
-- silently rejects write operations under RLS (UPDATE silent no-op,
-- INSERT throws — the M3/M4 asymmetry pattern continues here).
-- ----------------------------------------------------------------------------
alter table public.trainer_stripe_accounts enable row level security;

create policy "Trainers read their own Stripe account row"
  on public.trainer_stripe_accounts
  for select
  using (auth.uid() = id);

-- INTENTIONALLY: no INSERT policy.
-- INTENTIONALLY: no UPDATE policy.
-- INTENTIONALLY: no DELETE policy.
-- All writes flow through service_role (server actions + webhook handler).


-- ----------------------------------------------------------------------------
-- 5. GRANTs — second gate of the service-role-only design (Gate 2)
-- ----------------------------------------------------------------------------
-- authenticated gets SELECT only. NO anon access at all (no public
-- discovery surface for Stripe state). NO INSERT/UPDATE/DELETE grants to
-- authenticated — even if a future RLS policy were added by mistake, the
-- table-level privilege check at the GRANT layer still rejects the
-- operation. Two gates.
--
-- service_role bypasses RLS and has implicit table-level privileges via
-- the Supabase grants chain. The webhook handler and server actions
-- write through that path.
--
-- The Studio "postgres" superuser also bypasses RLS — useful for manual
-- verification and the Phase B service-role smoke test in the test plan.
-- ----------------------------------------------------------------------------
grant select on public.trainer_stripe_accounts to authenticated;
-- (no anon grant; no insert/update/delete grants to authenticated)
