-- ============================================================================
-- Migration 2 — dogs (owner-side foundation)
-- ============================================================================
-- Adds:
--   1. dogs table — many per owner; first child table of profiles
--   2. updated_at trigger (uses shared function from Migration 1)
--   3. idx_dogs_owner_id
--   4. RLS — three policies, all owner-only for now
--   5. GRANTs — in this same file per the convention established in
--      Migration 1b (every table-creating migration includes its grants)
--
-- RLS scope is deliberately narrow in V1. The full Phase 1 spec calls
-- for "trainers see dogs of owners they have bookings with (including
-- completed/cancelled)." That requires a join against bookings, which
-- doesn't exist until Migration 6. The "Trainers read dogs of their
-- booked owners" SELECT policy will be added in Mig 6 alongside the
-- bookings table itself, when there's actually a join target. No
-- use case in Phases 3 / 4 / 5 needs trainer-read-dogs, so the gap
-- is invisible to users.
--
-- FK on owner_id is RESTRICT (not CASCADE) because dogs are referenced
-- by future bookings — losing dog records would corrupt booking history.
-- Production user-deletion is anonymization (Phase 13), which sets
-- deleted_at and never triggers RESTRICT. RESTRICT is the safety net
-- for the unexpected hard-delete path (dev cleanup, future bug):
-- Postgres refuses the delete loudly instead of silently nuking history.
--
-- Note for future-Shane reading the migration log: V1 deliberately omits
-- sex_at_birth and weight_lbs columns. Both are likely to come up early
-- given the working-dog community focus (PSA / Schutzhund / French Ring
-- trainers care about both for training selection and method choice).
-- Add via column-add migration when first asked, not now — keep V1
-- schema lean and let real demand drive shape.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. dogs table
-- ----------------------------------------------------------------------------
create table public.dogs (
  id                 uuid        primary key default gen_random_uuid(),
  owner_id           uuid        not null references public.profiles(id) on delete restrict,
  name               text        not null,
  breed              text,
  date_of_birth      date        check (date_of_birth <= current_date),
  temperament_notes  text,
  photo_url          text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

comment on table public.dogs is
  'Owners'' dogs. Many per owner. Soft-deleted via deleted_at; never hard-deleted from app code.';

comment on column public.dogs.owner_id is
  'FK to profiles.id with ON DELETE RESTRICT. Hard-deleting an owner with dogs requires explicit cleanup first — protects booking history.';

comment on column public.dogs.breed is
  'Free-form text. UI enforces AKC autocomplete in Phase 4; server-side Zod validates against a static AKC list. Not a DB enum to avoid migration churn as the breed list evolves.';

comment on column public.dogs.date_of_birth is
  'Owner-supplied. Nullable since some owners may not know exact DOB. CHECK rejects future dates (UTC comparison via current_date — edge case of timezone-ahead users submitting "today" is acceptable; the date picker prevents it client-side anyway). Age is computed at display time.';

comment on column public.dogs.photo_url is
  'Supabase Storage path (Phase 4). Plain text — path resolution lives in app code, not the database.';

comment on column public.dogs.deleted_at is
  'Soft-delete marker. NULL = active. Hidden from owner UI by app code, but preserved for booking history joins so cancelled/completed bookings still render the dog they referenced.';


-- ----------------------------------------------------------------------------
-- 2. updated_at trigger (uses shared function from Migration 1)
-- ----------------------------------------------------------------------------
create trigger trg_dogs_updated_at
  before update on public.dogs
  for each row
  execute function public.update_updated_at_column();


-- ----------------------------------------------------------------------------
-- 3. Index on owner_id
-- ----------------------------------------------------------------------------
-- Only one query pattern matters in V1: "give me this owner's dogs."
-- A composite (owner_id, deleted_at) would help "active dogs only" queries
-- but is premature until we have meaningful soft-delete volume — add later
-- if Phase 4 profiling shows it matters.
-- ----------------------------------------------------------------------------
create index idx_dogs_owner_id on public.dogs(owner_id);


-- ----------------------------------------------------------------------------
-- 4. Row Level Security
-- ----------------------------------------------------------------------------
-- Same posture as profiles: enable RLS, then explicit policies. Nothing
-- gets through that isn't named.
-- ----------------------------------------------------------------------------
alter table public.dogs enable row level security;


-- Policy 1: SELECT — owners read their own dogs.
--
-- Deliberately does NOT filter deleted_at. Owners see all their own dogs
-- at the data layer (including soft-deleted ones); the UI filters per
-- query intent. This keeps the owner side flexible AND lets future booking-
-- history queries join through dogs without RLS hiding the soft-deleted
-- ones the booking referenced.
--
-- Trainer-read coverage is intentionally absent from Mig 2 — see header
-- block. Added in Mig 6 alongside the bookings table.
create policy "Owners read their own dogs"
  on public.dogs
  for select
  using (auth.uid() = owner_id);


-- Policy 2: INSERT — owners create dogs they own, AND only owner-role
-- users can do this.
--
-- The role check uses the EXISTS pattern from database-agent.md
-- (not an inline JOIN). Postgres planner handles this as a semi-join;
-- with the btree on profiles.id (PK), the lookup is one index probe.
-- Cheap. Trainers explicitly cannot add dogs to themselves — defense in
-- depth on top of UI/route gating.
create policy "Owners insert their own dogs"
  on public.dogs
  for insert
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'owner'
    )
  );


-- Policy 3: UPDATE — owners update their own dogs (including setting
-- deleted_at to soft-delete).
--
-- No role recheck on UPDATE: by data construction, owner_id was set at
-- INSERT time when the role was verified. Even if a Phase-12 admin later
-- promoted this user from owner to trainer, their existing dog records
-- are still THEIR records and they should be able to manage them. They
-- just can't INSERT new ones (Policy 2 blocks that).
create policy "Owners update their own dogs"
  on public.dogs
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);


-- No DELETE policy: hard-delete is never the right operation for dogs.
-- Soft-delete via UPDATE deleted_at = now(). No DELETE GRANT either
-- (see §5) — two layers refusing the operation.


-- ----------------------------------------------------------------------------
-- 5. GRANTs (per the convention from Migration 1b)
-- ----------------------------------------------------------------------------
-- authenticated: SELECT (Policy 1), INSERT (Policy 2), UPDATE (Policy 3).
-- No DELETE — matches the absent DELETE policy.
-- No anon grants — dogs are never publicly visible (no policy covers anon).
-- ----------------------------------------------------------------------------
grant select, insert, update on public.dogs to authenticated;
