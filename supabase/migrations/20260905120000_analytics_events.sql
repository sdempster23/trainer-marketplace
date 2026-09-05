-- ============================================================================
-- M20 — analytics_events (Proof north-star funnel, first-party, DB-backed)
-- ============================================================================
-- Five product events, written only from trusted server paths (the service
-- role). The table is the source of truth for Proof exports; Vercel custom
-- events are an optional mirror and must never be the only copy.
--
-- WHY THIS SHAPE (deviates from the "every table has updated_at" convention
-- on purpose, not by omission):
--   Events are append-only facts. There is no legal UPDATE. An updated_at
--   column would imply a mutation path we refuse to grant. created_at is
--   the only timestamp that means anything.
--
-- WHY SERVICE-ROLE INSERT ONLY:
--   Authenticated PostgREST would let any signed-in user mint funnel events
--   (fake trainer_signup / booking_request counts). The emit helper in
--   lib/supabase/admin.ts is the one write path; it uses the service-role
--   key. anon and authenticated hold ZERO table DML — the M7
--   REVOKE-then-GRANT convention, and the M14 declared-set update below.
--
-- WHY NO SELECT FOR API ROLES:
--   Event rows are an internal product log (user_id + search ZIP). They are
--   not a user-facing read. postgres (SQL editor / Proof export) can
--   always read as table owner. service_role gets INSERT only — the emit
--   path never .select()s the row back.
--
-- ONCE-PER-USER EVENTS (trainer_signup, complete_profile):
--   A partial unique index + ON CONFLICT-equivalent 23505 makes retries
--   idempotent. complete_profile is fire-on-transition: the app checks the
--   six completeness facts and inserts only when all are true; the unique
--   index is the backstop if two writes race. search / conversation /
--   booking_request MAY repeat (a user searches twice; two pairs converse;
--   two bookings).
--
-- user_id ON DELETE SET NULL:
--   Account deletion unlinks the person from the event and keeps the
--   anonymous count (Proof still sees "a trainer signed up"). Search from
--   a logged-out visitor is user_id NULL from the start — the directory
--   is public on purpose.
--
-- event_name CHECK:
--   Only the five Proof names. A typo in app code fails loud rather than
--   silently polluting the export.
--
-- M14: this is a new declared service_role position (INSERT). The M14
-- suite's catalog-driven matrix will fail until its declared jsonb is
-- updated in the same change — that update is in
-- supabase/tests/m14_service_role_grants/grants.sql.
-- ============================================================================

create table public.analytics_events (
  id          uuid        primary key default gen_random_uuid(),
  event_name  text        not null,
  user_id     uuid        references public.profiles(id) on delete set null,
  props       jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint analytics_events_known_name check (
    event_name in (
      'trainer_signup',
      'complete_profile',
      'search',
      'conversation',
      'booking_request'
    )
  )
);

comment on table public.analytics_events is
  'First-party product analytics (M20). Append-only Proof north-star events. Writes: service_role INSERT only (trusted server emit). No anon/authenticated DML. No updated_at — events are facts, not rows that mutate. user_id SET NULL on profile delete so counts survive and the person does not.';

comment on column public.analytics_events.event_name is
  'One of the five Proof names. Enforced by CHECK so a typo cannot land.';

comment on column public.analytics_events.user_id is
  'Actor when signed in; NULL for logged-out search (the directory is public) and after account deletion (ON DELETE SET NULL).';

comment on column public.analytics_events.props is
  'Event-specific payload. search carries zip/radius/specialties/result_count/beachhead_nashville. Never store secrets (calendar URLs, message bodies, emails).';

-- Fire-on-transition / idempotent upsert backstop for the two once-per-user
-- events. Partial: other event names may repeat for the same user.
create unique index analytics_events_once_per_user
  on public.analytics_events (event_name, user_id)
  where event_name in ('trainer_signup', 'complete_profile')
    and user_id is not null;

-- Proof export: GROUP BY event_name, filter by created_at.
create index analytics_events_name_created_at
  on public.analytics_events (event_name, created_at desc);

-- ----------------------------------------------------------------------------
-- RLS + grants — default deny; service_role INSERT is the only API write
-- ----------------------------------------------------------------------------
alter table public.analytics_events enable row level security;

-- Convention (database-agent): every table has at least one policy even
-- when service_role BYPASSRLS makes the policy inert. Named so a future
-- "drop unused policies" sweep does not treat this as dead.
create policy "Service role inserts analytics events"
  on public.analytics_events
  for insert
  to service_role
  with check (true);

-- M7 convention: strip, then grant back exactly the declared verbs.
-- ALTER DEFAULT PRIVILEGES already keeps anon/authenticated at {} on
-- new tables. service_role is a different story: current CLI images
-- confer service_role=arwdDxtm at CREATE TABLE (the M14 drift class
-- returning — M14's own suite is red on this stack for every older
-- table too). REVOKE ALL from service_role here so THIS table's
-- declared position (INSERT only) is real, not a no-op GRANT on top
-- of the platform default.
revoke all on public.analytics_events from anon, authenticated, service_role;
grant insert on public.analytics_events to service_role;
