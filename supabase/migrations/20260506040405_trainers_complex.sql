-- ============================================================================
-- Migration 3 — trainers complex
-- ============================================================================
-- Adds the trainer-side foundation in one logical unit. Four objects
-- because the enum must exist before the join table that references it,
-- and the related tables share a single conceptual scope (a trainer's
-- public profile shape).
--
--   1. trainer_specialty enum (17 values, locked) — first
--   2. trainers table (1:1 extension of profiles where role='trainer')
--   3. trainer_certifications (many per trainer)
--   4. trainer_specialty_assignments (M2M join, UNIQUE per trainer+specialty)
--
-- Plus: GIST index on service_point (first non-btree index in the project),
-- public-read RLS pattern (first table set where anon legitimately needs
-- SELECT), and per-table GRANTs.
--
-- Public-read RLS uses a one-hop EXISTS lookup directly to profiles.
-- Works because trainers.id = profiles.id by design (1:1 PK extension),
-- so we never need to go trainers → profiles via JOIN — we lookup profiles
-- directly by the trainer_id (which IS a profile id). One less join,
-- one less plan node, identical semantics.
--
-- Soft-delete inheritance: trainers has no deleted_at of its own. When
-- a profile is soft-deleted (Phase 13 anonymization), the public-read
-- policies' EXISTS filter excludes its trainer/cert/assignment rows from
-- public visibility. The rows physically remain (preserving booking
-- history references) but become invisible to the discovery surface.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. trainer_specialty enum (must exist before the assignments table)
-- ----------------------------------------------------------------------------
-- 17 values, declared in the order Shane specified. Postgres orders enum
-- values internally by declaration order, which gives us a sensible default
-- UI sort for free.
--
-- Adding values later: alter type public.trainer_specialty add value 'X';
-- Removing values: NOT SUPPORTED by Postgres. Pick deliberately.
--
-- The protection_sport_* prefix is convention, not enforced. Used for
-- "all sport trainers" filters via WHERE specialty LIKE 'protection_sport_%'
-- or WHERE specialty IN (...).
-- ----------------------------------------------------------------------------
create type public.trainer_specialty as enum (
  'puppy',
  'basic_obedience',
  'competition_obedience',
  'behavioral',
  'reactivity',
  'aggression',
  'service_dog',
  'protection_sport_psa',
  'protection_sport_schutzhund_igp',
  'protection_sport_french_ring',
  'protection_sport_mondio_ring',
  'personal_protection',
  'decoy_work',
  'agility',
  'scent_work',
  'tracking',
  'gun_dog'
);

comment on type public.trainer_specialty is
  'Trainer specialty/discipline. Order is the canonical UI sort. Mix of pet-side (puppy, basic_obedience), behavior work (reactivity, aggression), competition (agility, scent_work, tracking), and the working-dog community (PSA, IGP, French Ring, Mondio Ring, decoy_work, gun_dog). Add via ALTER TYPE; cannot remove.';


-- ----------------------------------------------------------------------------
-- 2. trainers table
-- ----------------------------------------------------------------------------
-- 1:1 with profiles where role='trainer'. id is shared (PK + FK CASCADE).
-- The trainer record IS the profile in another shape.
--
-- No deleted_at: soft-delete is inherited from profiles (Phase 13 sets
-- profiles.deleted_at; the public-read RLS filter here hides the trainer).
-- ----------------------------------------------------------------------------
create table public.trainers (
  id                     uuid        primary key references public.profiles(id) on delete cascade,
  bio                    text,
  years_experience       integer     check (years_experience is null or (years_experience >= 0 and years_experience <= 80)),
  service_point          extensions.geography(point, 4326),
  service_radius_meters  integer     check (service_radius_meters is null or (service_radius_meters > 0 and service_radius_meters <= 200000)),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.trainers is
  '1:1 extension of profiles where role=''trainer''. Created during onboarding (Phase 3) by app code, not by trigger. No deleted_at — soft-delete inherited from profiles via the public-read RLS filter.';

comment on column public.trainers.bio is
  'Multi-paragraph free-form. V1 renders as plain text; markdown rendering deferred until there''s real demand.';

comment on column public.trainers.years_experience is
  'Self-reported. CHECK rejects negatives and >80 years (defensive against UI bugs sending garbage).';

comment on column public.trainers.service_point is
  'PostGIS geography(point, 4326). Lat/lng of the trainer''s base location. Set during onboarding map step. WRITE convention: ST_SetSRID(ST_MakePoint(LNG, LAT), 4326) — longitude FIRST, then latitude. Easy to get backwards. NOTE: PostGIS types live in the `extensions` schema (per Supabase''s install location), so DDL references the type as `extensions.geography(...)`. In query code, ST_* functions can be called unqualified if the session search_path includes extensions (Supabase''s default does).';

comment on column public.trainers.service_radius_meters is
  'How far the trainer will travel for in-home sessions. Capped at 200,000m (~125mi) to defend against UI sending nonsense values like 99999999.';


-- ----------------------------------------------------------------------------
-- 3. trainer_certifications table
-- ----------------------------------------------------------------------------
-- Self-reported credentials. Many per trainer. CASCADE on trainer_id
-- because certs are meaningless without the trainer.
-- ----------------------------------------------------------------------------
create table public.trainer_certifications (
  id           uuid        primary key default gen_random_uuid(),
  trainer_id   uuid        not null references public.trainers(id) on delete cascade,
  name         text        not null,
  issuer       text,
  issued_at    date,
  expires_at   date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.trainer_certifications is
  'Trainer-self-reported credentials (CPDT-KA, IACP-CDT, PSA Decoy, Schutzhund Helper, etc.). No verification mechanism in V1 — Phase 12 admin tools will add a verified_at column for manual verification of high-stakes claims (PSA Judge, etc.). Owner-facing UI for V1 just shows the trainer''s claim alongside the issuer name.';

comment on column public.trainer_certifications.expires_at is
  'For credentials with expiration (most CPDT certs are 3-year cycles). NULL means perpetual or unknown.';


-- ----------------------------------------------------------------------------
-- 4. trainer_specialty_assignments table (M2M join)
-- ----------------------------------------------------------------------------
-- Many-to-many between trainers and the trainer_specialty enum. UNIQUE
-- prevents the same specialty being assigned twice per trainer.
--
-- No "primary specialty" or "experience level per specialty" in V1 —
-- both are nice-to-have UI features that can be added later. Keeps the
-- join table truly atomic.
-- ----------------------------------------------------------------------------
create table public.trainer_specialty_assignments (
  id          uuid              primary key default gen_random_uuid(),
  trainer_id  uuid              not null references public.trainers(id) on delete cascade,
  specialty   trainer_specialty not null,
  created_at  timestamptz       not null default now(),
  updated_at  timestamptz       not null default now(),
  unique (trainer_id, specialty)
);

comment on table public.trainer_specialty_assignments is
  'M2M join between trainers and trainer_specialty enum. UNIQUE(trainer_id, specialty) prevents duplicate assignments. No update path — trainers add or remove (no DB UPDATE policy or grant), reflecting the data model: a specialty is either assigned or not.';


-- ----------------------------------------------------------------------------
-- 5. updated_at triggers (use shared function from Migration 1)
-- ----------------------------------------------------------------------------
-- Note: trainer_specialty_assignments has no UPDATE policy or grant, so
-- this trigger never actually fires for that table — but the column +
-- trigger stay for consistency. If a future migration adds a metadata
-- column to assignments (e.g., experience_level), the trigger is ready.
-- Cheap insurance.
-- ----------------------------------------------------------------------------
create trigger trg_trainers_updated_at
  before update on public.trainers
  for each row execute function public.update_updated_at_column();

create trigger trg_trainer_certifications_updated_at
  before update on public.trainer_certifications
  for each row execute function public.update_updated_at_column();

create trigger trg_trainer_specialty_assignments_updated_at
  before update on public.trainer_specialty_assignments
  for each row execute function public.update_updated_at_column();


-- ----------------------------------------------------------------------------
-- 6. Indexes
-- ----------------------------------------------------------------------------
-- GIST on service_point — first non-btree index in the project. Supports
-- the Phase 5 owner search query:
--
--   select * from trainers
--   where st_dwithin(
--     service_point,
--     st_setsrid(st_makepoint($lng, $lat), 4326)::geography,
--     service_radius_meters
--   )
--
-- GIST is the right index type for spatial data — Postgres uses it to
-- skip rows obviously too far away before precise distance math.
-- Without GIST, the query degrades to a full table scan + per-row distance
-- calculation, which gets slow fast as trainer count grows.
-- ----------------------------------------------------------------------------
create index idx_trainers_service_point
  on public.trainers using gist (service_point);

create index idx_trainer_certifications_trainer_id
  on public.trainer_certifications (trainer_id);

create index idx_trainer_specialty_assignments_trainer_id
  on public.trainer_specialty_assignments (trainer_id);

create index idx_trainer_specialty_assignments_specialty
  on public.trainer_specialty_assignments (specialty);

-- Composite (specialty, trainer_id) deliberately deferred until Phase 5
-- profiling shows real query patterns. Two simple btrees cover the V1
-- access shapes adequately.


-- ----------------------------------------------------------------------------
-- 7. RLS — trainers table
-- ----------------------------------------------------------------------------
alter table public.trainers enable row level security;

-- Policy 1: SELECT — public read, soft-deleted trainers hidden.
-- One-hop EXISTS directly to profiles. Saves a join vs the two-hop
-- pattern (trainers.id = profiles.id by design, so the lookup is
-- conceptually trainer_id → profile_id even though they're the same uuid).
create policy "Trainer profiles are publicly readable"
  on public.trainers
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = trainers.id and deleted_at is null
    )
  );

-- Policy 2: INSERT — only the user themselves, only if role='trainer'.
-- Same EXISTS role-check pattern as dogs INSERT. The trainer record is
-- created by app code during Phase 3 onboarding, not by a trigger.
create policy "Trainers create their own row"
  on public.trainers
  for insert
  with check (
    auth.uid() = id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'trainer'
    )
  );

-- Policy 3: UPDATE — only the trainer themselves can modify their own row.
-- No role recheck (consistent with dogs).
create policy "Trainers update their own row"
  on public.trainers
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No DELETE policy: deletion comes via CASCADE from profiles only.


-- ----------------------------------------------------------------------------
-- 8. RLS — trainer_certifications table
-- ----------------------------------------------------------------------------
alter table public.trainer_certifications enable row level security;

-- Policy 1: public read, soft-deleted trainers' certs hidden.
-- Same one-hop EXISTS pattern, joining via trainer_id which equals the
-- relevant profiles.id.
create policy "Trainer certifications are publicly readable"
  on public.trainer_certifications
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = trainer_certifications.trainer_id and deleted_at is null
    )
  );

create policy "Trainers add their own certifications"
  on public.trainer_certifications
  for insert
  with check (
    auth.uid() = trainer_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'trainer'
    )
  );

create policy "Trainers update their own certifications"
  on public.trainer_certifications
  for update
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);

-- DELETE allowed (correct mistakes) — unlike dogs, certs have no
-- downstream history significance, so hard-delete is appropriate.
create policy "Trainers delete their own certifications"
  on public.trainer_certifications
  for delete
  using (auth.uid() = trainer_id);


-- ----------------------------------------------------------------------------
-- 9. RLS — trainer_specialty_assignments table
-- ----------------------------------------------------------------------------
alter table public.trainer_specialty_assignments enable row level security;

-- Policy 1: public read, soft-deleted trainers' assignments hidden.
create policy "Trainer specialty assignments are publicly readable"
  on public.trainer_specialty_assignments
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = trainer_specialty_assignments.trainer_id and deleted_at is null
    )
  );

create policy "Trainers add their own specialty assignments"
  on public.trainer_specialty_assignments
  for insert
  with check (
    auth.uid() = trainer_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'trainer'
    )
  );

-- DELETE allowed — drop a specialty by removing the assignment row.
create policy "Trainers delete their own specialty assignments"
  on public.trainer_specialty_assignments
  for delete
  using (auth.uid() = trainer_id);

-- No UPDATE policy: an assignment row has nothing to update — the
-- specialty IS the data. Trainers add or remove, not edit.


-- ----------------------------------------------------------------------------
-- 10. GRANTs (per the convention from Migration 1b)
-- ----------------------------------------------------------------------------
-- All three tables: public can read, only the trainer can write. This is
-- the first table set in the project where anon legitimately needs
-- SELECT — trainer profiles + certs + specialties power the public
-- discovery surface (search, profile pages) for logged-out browsers.
-- ----------------------------------------------------------------------------

-- trainers
grant select         on public.trainers to anon, authenticated;
grant insert, update on public.trainers to authenticated;

-- trainer_certifications
grant select                 on public.trainer_certifications to anon, authenticated;
grant insert, update, delete on public.trainer_certifications to authenticated;

-- trainer_specialty_assignments
grant select         on public.trainer_specialty_assignments to anon, authenticated;
grant insert, delete on public.trainer_specialty_assignments to authenticated;
-- (no UPDATE grant — matches the absent UPDATE policy)

-- USAGE on the enum so anon and authenticated can reference it in queries
grant usage on type public.trainer_specialty to anon, authenticated;
