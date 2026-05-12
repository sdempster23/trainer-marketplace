-- ============================================================================
-- Migration 4 — trainer services + availability
-- ============================================================================
-- Phase 1's fourth migration. Adds the booking-readiness layer for the
-- trainer side: what services they offer (priceable units) and when they
-- are open to perform them (recurring weekly template + date exceptions).
-- This is the data Phase 5 search filters on (session_type, price) and
-- Phase 6 computes booking time slots from.
--
-- Five DDL operations in one migration because they form one conceptual
-- unit and have ordering dependencies:
--
--   1. session_type enum (must exist before trainer_services references it)
--   2. trainer_services table
--   3. trainers.timezone ALTER (prerequisite — availability times mean
--      nothing without a canonical timezone for the trainer)
--   4. trainer_availability table (DOW recurring template)
--   5. trainer_availability_exceptions table (date-specific overrides)
--
-- Key design decisions, recorded so the next reader doesn't have to
-- reverse-engineer them from the schema:
--
-- - SHAPE A AVAILABILITY: one row per (trainer, day_of_week, start_time)
--   for the recurring template, with a separate exceptions table for
--   date-specific overrides. Considered cron-string and RRULE shapes;
--   rejected both for being SQL-opaque and creating a UI translation
--   layer that buys nothing for the V1 use case (regular weekly schedules
--   with occasional days off). Shape A's data structure, the trainer's
--   mental model of their schedule, and the editing UI all collapse into
--   the same shape — no translation between them.
--
-- - REPLACE SEMANTICS for exceptions: a row in trainer_availability_exceptions
--   for a given date FULLY REPLACES the DOW template for that date.
--   is_blocked=true with NULL times means closed all day. is_blocked=false
--   with non-NULL times means "use these hours instead of the template."
--   No augment-mode (where exception adds extra windows on top of template);
--   can be added later if a trainer asks. UNIQUE (trainer_id, exception_date)
--   means at most one exception row per date — V1 trainers cannot model
--   multi-window overrides on a single special date. Common cases (vacation,
--   holiday close, single-window override) are covered.
--
-- - SOFT-DELETE on trainer_services (deleted_at). Bookings (M6) will FK
--   to service_id with NO ACTION (≈ RESTRICT); soft-delete lets a trainer
--   retire a service without breaking historical bookings. Public-read
--   RLS filter excludes deleted_at IS NOT NULL from the discovery surface;
--   trainer's own dashboard can still see retired services to un-retire.
--
-- - CONFLICT DETECTION DEFERRED to bookings (M6). The "two owners can't
--   book the same slot" guarantee will be a DB-level EXCLUDE USING gist
--   constraint on bookings, not on availability. Availability's only job
--   is "does this point-in-time fall inside an open window?" — which is
--   straight SQL against the rows here.
--
-- - UNIQUE CONSTRAINTS provide implicit btree indexes; we deliberately
--   don't create redundant idx_* on the same columns. If Phase 6 profiling
--   shows a non-covered query pattern, add then.
--
-- - TIMEZONE on trainers (one column, single canonical value), not on
--   each availability row. Availability times are stored as wall-clock
--   TIME (no zone) and interpreted in the trainer's timezone at query
--   time. Owner-facing displays convert to the owner's browser-local
--   zone in app code.
--
-- - FREE-FORM TEXT POLICY: project-wide rule (lodged at M4) that every
--   free-form text column (bio, description, name, reason, etc.) is
--   plain text/text-nullable with no DB-level length CHECK. App-layer
--   Zod handles bounds. Future-tightening of this policy, if needed,
--   would land as a single hardening migration touching all columns at
--   once — not piecemeal here.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. session_type enum
-- ----------------------------------------------------------------------------
-- Three values, intentionally narrow: pet-side and protection-sport
-- markets converged on these. Group classes and boarding-train would
-- imply different bookings shapes (multi-attendee, multi-day per booking)
-- and aren't part of the V1 single-dog-per-booking model. Add an enum
-- value when the bookings model is ready to support it.
--
-- Adding values later: alter type public.session_type add value 'X';
-- Removing values: NOT SUPPORTED by Postgres. Pick deliberately.
-- ----------------------------------------------------------------------------
create type public.session_type as enum (
  'in_home',
  'at_trainer_location',
  'virtual'
);

comment on type public.session_type is
  'Where the session physically happens. in_home: trainer travels to the dog. at_trainer_location: client travels to trainer''s facility/yard. virtual: video call. Drives Phase 5 search filtering and downstream UI (in_home triggers travel-time logic, virtual hides location entirely).';


-- ----------------------------------------------------------------------------
-- 2. trainer_services table
-- ----------------------------------------------------------------------------
-- Bookable products a trainer offers. Many per trainer. price_cents drives
-- payment, duration_minutes drives slot sizing in Phase 6, session_type
-- drives Phase 5 search filtering.
--
-- Soft-delete via deleted_at. Hard-delete is reserved for the trainer
-- CASCADE path (the GDPR/admin nuke); normal "retire this service" is
-- an UPDATE setting deleted_at = now().
-- ----------------------------------------------------------------------------
create table public.trainer_services (
  id                uuid                primary key default gen_random_uuid(),
  trainer_id        uuid                not null references public.trainers(id) on delete cascade,
  name              text                not null,
  description       text,
  session_type      public.session_type not null,
  price_cents       integer             not null check (price_cents > 0 and price_cents <= 100000000),
  duration_minutes  integer             not null check (duration_minutes >= 15 and duration_minutes <= 480),
  deleted_at        timestamptz,
  created_at        timestamptz         not null default now(),
  updated_at        timestamptz         not null default now()
);

comment on table public.trainer_services is
  'A trainer''s bookable services. Price in cents (USD V1, single-currency by convention). Duration drives Phase 6 slot generation. session_type drives Phase 5 search filtering. Soft-delete via deleted_at; bookings reference service_id and need it to survive retirement.';

comment on column public.trainer_services.price_cents is
  'Integer cents. CHECK rejects 0 or negative (a free service is a future flag, not price=0) and >$1M (defends against UI bugs sending nonsense values).';

comment on column public.trainer_services.duration_minutes is
  'Floor 15 (drive time alone for in_home sessions exceeds shorter durations); ceiling 480 (= 8h, full-day seminars). Multi-day intensives bill per day, not per booking. ALTER COLUMN if community-knowledge ever needs the cap raised.';

comment on column public.trainer_services.deleted_at is
  'Soft-delete timestamp. Active services have deleted_at IS NULL. Retired services stay queryable for booking history but are excluded from public discovery via the SELECT RLS filter.';


-- ----------------------------------------------------------------------------
-- 3. trainers.timezone — ALTER TABLE
-- ----------------------------------------------------------------------------
-- Prerequisite for availability. Availability times are stored as wall-clock
-- TIME (no zone) and interpreted in the trainer's timezone at query time.
-- Without a canonical timezone, the times are meaningless.
--
-- Default 'UTC' so any rows created in M3 (or seed data added between
-- migrations) populate cleanly. App-layer onboarding will require the
-- trainer to pick a real IANA zone before completing setup.
--
-- Validation: app-layer Zod against the IANA tz-database list. Not
-- enforced at DB level — Postgres has no IANA-list type, and a CHECK
-- against a hardcoded subset would rot.
-- ----------------------------------------------------------------------------
alter table public.trainers
  add column timezone text not null default 'UTC';

comment on column public.trainers.timezone is
  'IANA timezone identifier (e.g., America/New_York). Canonical zone for interpreting trainer_availability.start_time / end_time. Default UTC is a safe placeholder; onboarding flow forces a real selection before the trainer is discoverable. Owner-side displays convert to browser-local zone.';


-- ----------------------------------------------------------------------------
-- 4. trainer_availability table — recurring weekly template
-- ----------------------------------------------------------------------------
-- One row per (trainer, day_of_week, start_time). Multiple windows per
-- day allowed (Mon 9-12 and Mon 14-17 are two rows with the same
-- day_of_week=1).
--
-- Same-day overlap (e.g., 9-11 and 10-12 on Monday) is NOT enforced at
-- the DB level. Postgres has no time-range exclude pattern that doesn't
-- require materializing to tstzrange, and the trade-off isn't worth it
-- for a data-quality concern: an overlapping template just produces
-- redundant slot candidates, and dedup happens in slot generation
-- anyway. App-layer Zod validates non-overlap at form submit.
--
-- day_of_week 0 = Sunday, 6 = Saturday. Matches JavaScript's
-- Date.prototype.getDay(), which is what the editor UI will use.
-- Deliberately NOT ISO-8601 (which numbers Monday as 1) — the
-- JS-compatible numbering avoids client-side conversion.
-- ----------------------------------------------------------------------------
create table public.trainer_availability (
  id           uuid        primary key default gen_random_uuid(),
  trainer_id   uuid        not null references public.trainers(id) on delete cascade,
  day_of_week  smallint    not null check (day_of_week between 0 and 6),
  start_time   time        not null,
  end_time     time        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (trainer_id, day_of_week, start_time),
  check (end_time > start_time)
);

comment on table public.trainer_availability is
  'Recurring weekly template. One row per open window. Multiple rows per (trainer, day_of_week) allowed (split shifts, lunch breaks). Times are wall-clock in the trainer''s timezone (see trainers.timezone). Phase 6 slot generation: walk the date range, look up DOW windows for each date, apply exceptions, subtract held/confirmed bookings, slice into service.duration_minutes chunks. Same-day overlap is permitted at the DB level; app-layer Zod prevents at write time.';

comment on column public.trainer_availability.day_of_week is
  '0=Sunday, 1=Monday, ..., 6=Saturday. Matches JavaScript Date.getDay() to avoid client-side conversion. NOT ISO-8601 (which uses 1=Monday).';

comment on column public.trainer_availability.start_time is
  'Wall-clock TIME (no timezone). Interpreted in the trainer''s timezone at query time. Storing TIMESTAMPTZ here would conflate "what time" with "what date", which doesn''t make sense for a recurring template.';


-- ----------------------------------------------------------------------------
-- 5. trainer_availability_exceptions table — date-specific overrides
-- ----------------------------------------------------------------------------
-- REPLACE semantics: an exception row for a date fully replaces the DOW
-- template for that date.
--
-- Two valid shapes, enforced by the table-level CHECK:
--   - is_blocked=true,  start_time / end_time both NULL  → "closed all day"
--   - is_blocked=false, start_time / end_time both NOT NULL → "use these
--     hours instead of the template" (single window)
--
-- UNIQUE (trainer_id, exception_date) means one exception per date per
-- trainer. V1 cut: trainers cannot model multi-window overrides on a
-- single special date (e.g., "today only, work 10-11 and 14-15"). The
-- common cases (vacation, holiday close, single-window override) are
-- covered. Future migration could relax this to support multi-window
-- overrides if a trainer asks.
-- ----------------------------------------------------------------------------
create table public.trainer_availability_exceptions (
  id              uuid        primary key default gen_random_uuid(),
  trainer_id      uuid        not null references public.trainers(id) on delete cascade,
  exception_date  date        not null,
  is_blocked      boolean     not null default false,
  start_time      time,
  end_time        time,
  reason          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (trainer_id, exception_date),
  check (
    (is_blocked = true  and start_time is null     and end_time is null)
    or
    (is_blocked = false and start_time is not null and end_time is not null and end_time > start_time)
  )
);

comment on table public.trainer_availability_exceptions is
  'Date-specific overrides to the recurring template. REPLACE semantics: presence of a row for a date means the row IS the schedule for that date — the DOW template is not consulted. is_blocked=true with NULL times = closed all day; is_blocked=false with both times = use these hours instead. UNIQUE per (trainer, date): one override per date in V1.';

comment on column public.trainer_availability_exceptions.reason is
  'Optional free-text label (e.g., "Memorial Day", "Vet appointment"). Trainer-facing only — not exposed to owners. Owners see "trainer unavailable" with no reason.';


-- ----------------------------------------------------------------------------
-- 6. updated_at triggers (use shared function from Migration 1)
-- ----------------------------------------------------------------------------
create trigger trg_trainer_services_updated_at
  before update on public.trainer_services
  for each row execute function public.update_updated_at_column();

create trigger trg_trainer_availability_updated_at
  before update on public.trainer_availability
  for each row execute function public.update_updated_at_column();

create trigger trg_trainer_availability_exceptions_updated_at
  before update on public.trainer_availability_exceptions
  for each row execute function public.update_updated_at_column();


-- ----------------------------------------------------------------------------
-- 7. Indexes
-- ----------------------------------------------------------------------------
-- Only one explicit index needed. UNIQUE constraints on the availability
-- tables provide implicit btree indexes covering the Phase 6 access
-- patterns (lookup by trainer_id; lookup by trainer_id+date for
-- exceptions). No redundant idx_* on the same columns.
--
-- trainer_services has no UNIQUE other than the PK, so it needs an
-- explicit (trainer_id) index for the listing query "show me trainer X's
-- services".
-- ----------------------------------------------------------------------------
create index idx_trainer_services_trainer_id
  on public.trainer_services (trainer_id);

-- session_type index deliberately deferred: 3-value enum has low cardinality,
-- and Phase 5 search filters compose with PostGIS distance which dominates
-- the query plan. Add only if profiling shows it's needed.


-- ----------------------------------------------------------------------------
-- 8. RLS — trainer_services
-- ----------------------------------------------------------------------------
alter table public.trainer_services enable row level security;

-- Two SELECT policies, OR-combined by Postgres:
--
--   Policy 1: public read of ACTIVE services from non-soft-deleted trainers.
--   Policy 2: trainer reads ALL their own services (including retired).
--
-- The second policy lets a trainer see their archive in the dashboard
-- to un-retire a service. Splitting into two policies is cleaner than
-- one OR-clause because each policy expresses a single intent.
create policy "Active trainer services are publicly readable"
  on public.trainer_services
  for select
  using (
    deleted_at is null
    and exists (
      select 1 from public.profiles
      where id = trainer_services.trainer_id and deleted_at is null
    )
  );

create policy "Trainers see all their own services"
  on public.trainer_services
  for select
  using (auth.uid() = trainer_id);

create policy "Trainers create their own services"
  on public.trainer_services
  for insert
  with check (
    auth.uid() = trainer_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'trainer'
    )
  );

create policy "Trainers update their own services"
  on public.trainer_services
  for update
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);

-- No DELETE policy. Hard-delete only via the trainers CASCADE chain
-- (GDPR/admin). Normal "retire" path is UPDATE setting deleted_at = now().


-- ----------------------------------------------------------------------------
-- 9. RLS — trainer_availability
-- ----------------------------------------------------------------------------
alter table public.trainer_availability enable row level security;

-- Public read: owners need to compute slot lists for any trainer they're
-- considering booking. Same one-hop EXISTS to profiles for soft-delete.
create policy "Trainer availability is publicly readable"
  on public.trainer_availability
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = trainer_availability.trainer_id and deleted_at is null
    )
  );

create policy "Trainers create their own availability"
  on public.trainer_availability
  for insert
  with check (
    auth.uid() = trainer_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'trainer'
    )
  );

create policy "Trainers update their own availability"
  on public.trainer_availability
  for update
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);

-- DELETE allowed: removing a window from the template is a normal
-- editing operation (unlike services, where deletion would orphan
-- bookings).
create policy "Trainers delete their own availability"
  on public.trainer_availability
  for delete
  using (auth.uid() = trainer_id);


-- ----------------------------------------------------------------------------
-- 10. RLS — trainer_availability_exceptions
-- ----------------------------------------------------------------------------
alter table public.trainer_availability_exceptions enable row level security;

create policy "Trainer availability exceptions are publicly readable"
  on public.trainer_availability_exceptions
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = trainer_availability_exceptions.trainer_id and deleted_at is null
    )
  );

create policy "Trainers create their own availability exceptions"
  on public.trainer_availability_exceptions
  for insert
  with check (
    auth.uid() = trainer_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'trainer'
    )
  );

create policy "Trainers update their own availability exceptions"
  on public.trainer_availability_exceptions
  for update
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);

create policy "Trainers delete their own availability exceptions"
  on public.trainer_availability_exceptions
  for delete
  using (auth.uid() = trainer_id);


-- ----------------------------------------------------------------------------
-- 11. GRANTs
-- ----------------------------------------------------------------------------
-- Per the convention from Migration 1b: anon and authenticated roles
-- need explicit table-level GRANTs in addition to RLS. RLS filters rows;
-- GRANTs gate the SQL operation itself.
--
-- trainer_services: SELECT public; INSERT/UPDATE for authenticated. NO
-- DELETE GRANT — matches the absent DELETE policy. Soft-delete is the
-- only retirement path from app code.
--
-- availability + exceptions: SELECT public; full INSERT/UPDATE/DELETE
-- for authenticated. Trainers actively maintain these.
--
-- session_type enum: USAGE so anon/authenticated can reference it in
-- query parameters and casts.
-- ----------------------------------------------------------------------------

-- trainer_services
grant select         on public.trainer_services to anon, authenticated;
grant insert, update on public.trainer_services to authenticated;

-- trainer_availability
grant select                 on public.trainer_availability to anon, authenticated;
grant insert, update, delete on public.trainer_availability to authenticated;

-- trainer_availability_exceptions
grant select                 on public.trainer_availability_exceptions to anon, authenticated;
grant insert, update, delete on public.trainer_availability_exceptions to authenticated;

-- session_type enum
grant usage on type public.session_type to anon, authenticated;
