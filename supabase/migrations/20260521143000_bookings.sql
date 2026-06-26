-- ============================================================================
-- Migration 6 — bookings (state-machine core, race-safe slot reservation,
--                          dogs RLS forward-fix from M2)
-- ============================================================================
--
-- DO NOT ADD A PARTIAL FIX TO THIS MIGRATION.
--
-- M6 introduces FOUR concurrent layers of defense that only work together:
--   1. Status enum + CHECK constraints (column-level invariants)
--   2. EXCLUDE USING gist (race-safe slot reservation, atomic at INSERT time)
--   3. BEFORE INSERT/UPDATE triggers (state machine + immutability + role +
--      cross-table identity-integrity)
--   4. RLS policies (Cat 4 — dual-party row gates)
--
-- Removing any one of these in isolation creates a security gap that the
-- other three cannot cover. Specifically:
--   - Triggers without EXCLUDE → double-booking race window between
--     check-availability and insert-row.
--   - EXCLUDE without triggers → app code could mutate immutable columns,
--     execute illegal state transitions, skip the role gate, attach the
--     wrong dog to a booking, or denormalize stale prices.
--   - CHECK without trigger → snapshot column ⇔ status invariants would
--     hold column-wise but state transitions remain unvalidated.
--   - RLS without trigger → identity is gated but state machine is open;
--     any party could write any column, including reverting status.
-- If a future migration weakens one layer "temporarily," restore it
-- before the same migration ends.
--
-- ----------------------------------------------------------------------------
-- RLS classification: Category 4 — Dual-party row, state-machine-gated writes
-- ----------------------------------------------------------------------------
-- M1–M5 established three RLS categories:
--   1. Owner-only / self-owned          (profiles, dogs)
--   2. Public-read + owner-write        (trainers, trainer_services, availability)
--   3. Service-role-only writes         (trainer_stripe_accounts)
-- Bookings doesn't fit any of these. Two non-symmetric parties have row-
-- level read access; writes are gated by (identity × current state). This
-- is Category 4. Expected to recur for reviews, disputes, and possibly
-- some message workflows in M7+.
--
-- ----------------------------------------------------------------------------
-- Trigger-not-CHECK is structurally forced, not preferred
-- ----------------------------------------------------------------------------
-- State transition rules need to compare OLD.status to NEW.status. WITH
-- CHECK and CHECK constraints see NEW.* only. This is a Postgres structural
-- fact, not a stylistic preference. DO NOT try to "simplify by moving
-- transition logic into WITH CHECK" — it is impossible. The CHECK
-- constraints in §7 enforce NEW-only invariants (snapshot column ⇔ status);
-- the trigger in §10 enforces transitions.
--
-- ----------------------------------------------------------------------------
-- Cross-table identity-integrity gates (§9 BEFORE INSERT trigger)
-- ----------------------------------------------------------------------------
-- Four cross-table validations happen in the INSERT trigger that FK
-- constraints alone cannot enforce. All four also enforce
-- `deleted_at IS NULL` on the referenced dog and trainer_service —
-- existing bookings against soft-deleted entities are preserved (history),
-- but new bookings against soft-deleted entities are rejected.
--   (1) Owner role: NEW.owner_id is a profile with role='owner'
--   (2) Dog ownership: NEW.dog_id belongs to NEW.owner_id AND is active.
--       UUIDs aren't secret — without this, a malicious owner with a
--       leaked dog UUID could create fraudulent bookings, then M6
--       dog-level RLS would widen the victim's dog visibility to the
--       attacker-chosen trainer.
--   (3) Service-trainer alignment: NEW.service_id is offered by
--       NEW.trainer_id AND service is active. trainer_services are
--       public-readable, so service UUIDs aren't secret either.
--   (4) Denormalization fidelity: NEW.price_cents and NEW.duration_minutes
--       match the trainer_services row at INSERT time (stale UI data
--       could otherwise lock in a wrong-price booking, immutable
--       post-INSERT).
--
-- ----------------------------------------------------------------------------
-- M2 owner-level → M6 dog-level (explicit refinement, not silent revision)
-- ----------------------------------------------------------------------------
-- M2's deferred commitment used the wording "trainers see dogs of owners
-- they have bookings with." M6 refines this to dog-level visibility: a
-- trainer with a booking for Rex sees Rex's row; they do NOT see other
-- dogs in Rex's household (e.g., Bella, Max). Reasoning: least-privilege
-- default, working-dog community privacy fit, owner-controlled disclosure
-- path, narrower compromised-account blast radius, M2 was forward-
-- commitment rather than settled design. The owner-level interpretation
-- can be re-evaluated in a future migration if friction emerges (e.g.,
-- owners reporting they have to re-book for second dogs unnecessarily).
--
-- ----------------------------------------------------------------------------
-- FK target asymmetry (trainer_id → trainers; owner_id → profiles)
-- ----------------------------------------------------------------------------
-- bookings.trainer_id → trainers(id)              — structural role evidence
-- bookings.owner_id   → profiles(id)              — trigger validates role='owner'
-- bookings.dog_id     → dogs(id)                  — trigger validates dog.owner_id
-- bookings.service_id → trainer_services(id)      — trigger validates service.trainer_id
--
-- The owner_id asymmetry is correct, not an oversight. Trainers have a
-- dedicated table (M3) with profile-id PK; the FK itself proves trainer-
-- role. There is no "owners" table because owner-role is a value on the
-- profiles.role enum, not a structural entity. The role gate for owner_id
-- therefore lives in the INSERT trigger (§9), not the FK. Dog and service
-- ownership/alignment gates also live in the trigger because the FK only
-- proves row existence, not relationship correctness.
--
-- ----------------------------------------------------------------------------
-- I1 + EXCLUDE mutual reinforcement
-- ----------------------------------------------------------------------------
-- starts_at and duration_minutes are immutable post-INSERT (enforced by
-- §10 BEFORE UPDATE trigger). The generated `ends_at` column derives from
-- both, so it is also de-facto immutable. The EXCLUDE constraint indexes
-- tstzrange(starts_at, ends_at, '[)') — the index never shifts under a row,
-- which is what makes the constraint reliable. If a future migration
-- relaxes I1 to allow rescheduling, the EXCLUDE constraint's behavior
-- must be re-analyzed.
--
-- ----------------------------------------------------------------------------
-- Named-constraint convention (lodged from M6 forward)
-- ----------------------------------------------------------------------------
-- Constraints get explicit names when ALL of these are true:
--   (a) The constraint can be hit by user-facing actions
--   (b) The app needs to match on constraint name for specific UX
-- This covers EXCLUDEs (slot collision → "slot just taken"), business-rule
-- CHECKs (e.g., status/snapshot ⇔), and user-visible UNIQUEs (e.g., the
-- payment-intent uniqueness in §5). FKs to immutable parents and internal
-- invariants can stay auto-named.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 2. Extension: btree_gist
-- ----------------------------------------------------------------------------
create extension if not exists btree_gist;


-- ----------------------------------------------------------------------------
-- 3. Type: booking_status enum
-- ----------------------------------------------------------------------------
create type public.booking_status as enum (
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED'
);


-- ----------------------------------------------------------------------------
-- 4. Type: cancelled_by enum
-- ----------------------------------------------------------------------------
create type public.cancelled_by as enum (
  'owner',
  'trainer',
  'system'
);


-- ----------------------------------------------------------------------------
-- 4.5. Internal function: ends_at derivation
-- ----------------------------------------------------------------------------
-- Postgres marks timestamptz + interval as STABLE (not IMMUTABLE) in
-- general because intervals can contain months/years (timezone- and
-- calendar-dependent). GENERATED columns and EXCLUDE-indexed expressions
-- both require IMMUTABLE. We wrap the computation in an IMMUTABLE
-- function because make_interval(mins => N) produces only minute-level
-- intervals — genuinely immutable in practice, just narrower than the
-- operator's general signature.
--
-- See the COMMENT ON FUNCTION below for the full contract.
-- ----------------------------------------------------------------------------
create function public._bookings_ends_at(
  p_starts_at        timestamptz,
  p_duration_minutes integer
)
returns timestamptz
language sql
immutable
parallel safe
as $$
  select p_starts_at + make_interval(mins => p_duration_minutes)
$$;

comment on function public._bookings_ends_at(timestamptz, integer) is
  'INTERNAL — DO NOT MODIFY WITHOUT RE-ANALYZING IMMUTABILITY. Marked IMMUTABLE because make_interval(mins => N) produces only minute-level intervals (no months or years), which Postgres considers immutable in practice but cannot prove through the timestamptz + interval operator signature (STABLE in the general case). Used by bookings.ends_at GENERATED column and indexed by bookings_no_trainer_double_booking EXCLUDE constraint. Adding month or year intervals would silently corrupt the EXCLUDE index — bookings that should conflict would not, bookings that should not conflict would.';


-- ----------------------------------------------------------------------------
-- 5. Table: bookings
-- ----------------------------------------------------------------------------
create table public.bookings (
  id                        uuid              primary key default gen_random_uuid(),

  owner_id                  uuid              not null references public.profiles(id)         on delete restrict,
  trainer_id                uuid              not null references public.trainers(id)         on delete restrict,
  dog_id                    uuid              not null references public.dogs(id)             on delete restrict,
  service_id                uuid              not null references public.trainer_services(id) on delete restrict,

  starts_at                 timestamptz       not null,
  duration_minutes          integer           not null check (duration_minutes >= 15 and duration_minutes <= 480),
  ends_at                   timestamptz       generated always as
                              (public._bookings_ends_at(starts_at, duration_minutes)) stored,

  price_cents               integer           not null check (price_cents > 0 and price_cents <= 100000000),

  stripe_payment_intent_id  text              not null,

  status                    public.booking_status not null default 'PENDING',

  cancelled_at              timestamptz,
  cancelled_by              public.cancelled_by,
  completed_at              timestamptz,

  created_at                timestamptz       not null default now(),
  updated_at                timestamptz       not null default now()
);

alter table public.bookings
  add constraint bookings_stripe_payment_intent_unique
  unique (stripe_payment_intent_id);


-- ----------------------------------------------------------------------------
-- 6. Named EXCLUDE constraint: no double-booking
-- ----------------------------------------------------------------------------
alter table public.bookings
  add constraint bookings_no_trainer_double_booking
  exclude using gist (
    trainer_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('PENDING', 'CONFIRMED'));


-- ----------------------------------------------------------------------------
-- 7. CHECK constraints: snapshot column ⇔ status
-- ----------------------------------------------------------------------------
alter table public.bookings
  add constraint bookings_cancelled_at_iff_cancelled
  check ((cancelled_at is not null) = (status = 'CANCELLED'));

alter table public.bookings
  add constraint bookings_cancelled_by_iff_cancelled
  check ((cancelled_by is not null) = (status = 'CANCELLED'));

alter table public.bookings
  add constraint bookings_completed_at_iff_completed
  check ((completed_at is not null) = (status = 'COMPLETED'));


-- ----------------------------------------------------------------------------
-- 8. Indexes
-- ----------------------------------------------------------------------------
-- Composite (trainer_id, dog_id) is LOAD-BEARING for §12 dogs RLS.
create index idx_bookings_trainer_id_dog_id
  on public.bookings (trainer_id, dog_id);

create index idx_bookings_owner_id
  on public.bookings (owner_id);

-- Partial index for Phase 8 cron scans.
create index idx_bookings_inflight_by_starts_at
  on public.bookings (starts_at)
  where status in ('PENDING', 'CONFIRMED');


-- ----------------------------------------------------------------------------
-- 9. BEFORE INSERT trigger: entry-state + cross-table integrity + time gate
-- ----------------------------------------------------------------------------
create or replace function public.bookings_validate_insert()
returns trigger
language plpgsql
as $$
declare
  v_service_trainer_id  uuid;
  v_service_price       integer;
  v_service_duration    integer;
begin
  -- Entry-state gates
  if NEW.status is distinct from 'PENDING' then
    raise exception 'Bookings must enter at status=PENDING (got %)', NEW.status
      using errcode = 'check_violation';
  end if;

  if NEW.cancelled_at is not null
     or NEW.cancelled_by is not null
     or NEW.completed_at is not null then
    raise exception 'cancelled_at/cancelled_by/completed_at must be NULL at INSERT'
      using errcode = 'check_violation';
  end if;

  -- Owner role gate (FK target asymmetry — see header).
  if not exists (
    select 1 from public.profiles
    where id = NEW.owner_id and role = 'owner'
  ) then
    raise exception 'owner_id % is not a profile with role=owner', NEW.owner_id
      using errcode = 'foreign_key_violation';
  end if;

  -- G1: dog ownership gate + soft-delete filter.
  if not exists (
    select 1 from public.dogs
    where id = NEW.dog_id
      and owner_id = NEW.owner_id
      and deleted_at is null
  ) then
    raise exception 'Booking dog_id % does not belong to owner_id % or dog is not active',
      NEW.dog_id, NEW.owner_id
      using errcode = 'foreign_key_violation';
  end if;

  -- G2 + G3: service-trainer alignment + denormalization fidelity
  -- (single SELECT, soft-delete filtered).
  select trainer_id, price_cents, duration_minutes
    into v_service_trainer_id, v_service_price, v_service_duration
    from public.trainer_services
    where id = NEW.service_id
      and deleted_at is null;

  if not found then
    raise exception 'service_id % not found or not active', NEW.service_id
      using errcode = 'foreign_key_violation';
  end if;
  if v_service_trainer_id is distinct from NEW.trainer_id then
    raise exception 'service_id % is not offered by trainer_id %',
      NEW.service_id, NEW.trainer_id
      using errcode = 'foreign_key_violation';
  end if;
  if NEW.price_cents is distinct from v_service_price then
    raise exception 'price_cents % does not match service price %',
      NEW.price_cents, v_service_price
      using errcode = 'check_violation';
  end if;
  if NEW.duration_minutes is distinct from v_service_duration then
    raise exception 'duration_minutes % does not match service duration %',
      NEW.duration_minutes, v_service_duration
      using errcode = 'check_violation';
  end if;

  -- Time gate
  if NEW.starts_at <= now() + interval '15 minutes' then
    raise exception 'starts_at must be at least 15 minutes in the future (got %)', NEW.starts_at
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

create trigger trg_bookings_validate_insert
  before insert on public.bookings
  for each row
  execute function public.bookings_validate_insert();


-- ----------------------------------------------------------------------------
-- 10. BEFORE UPDATE trigger: immutability + state machine + snapshots
-- ----------------------------------------------------------------------------
create or replace function public.bookings_validate_update()
returns trigger
language plpgsql
as $$
declare
  v_is_system        boolean;
  v_actor_is_owner   boolean;
  v_actor_is_trainer boolean;
begin
  -- (a) Immutability (I1)
  if NEW.owner_id                  is distinct from OLD.owner_id                  then raise exception 'owner_id is immutable';                  end if;
  if NEW.trainer_id                is distinct from OLD.trainer_id                then raise exception 'trainer_id is immutable';                end if;
  if NEW.dog_id                    is distinct from OLD.dog_id                    then raise exception 'dog_id is immutable';                    end if;
  if NEW.service_id                is distinct from OLD.service_id                then raise exception 'service_id is immutable';                end if;
  if NEW.starts_at                 is distinct from OLD.starts_at                 then raise exception 'starts_at is immutable';                 end if;
  if NEW.duration_minutes          is distinct from OLD.duration_minutes          then raise exception 'duration_minutes is immutable';          end if;
  if NEW.price_cents               is distinct from OLD.price_cents               then raise exception 'price_cents is immutable';               end if;
  if NEW.stripe_payment_intent_id  is distinct from OLD.stripe_payment_intent_id  then raise exception 'stripe_payment_intent_id is immutable';  end if;
  if NEW.created_at                is distinct from OLD.created_at                then raise exception 'created_at is immutable';                end if;

  -- (b) Actor classification
  v_is_system        := auth.uid() is null;
  v_actor_is_owner   := (not v_is_system) and (auth.uid() = OLD.owner_id);
  v_actor_is_trainer := (not v_is_system) and (auth.uid() = OLD.trainer_id);

  if NEW.status = OLD.status then
    if NEW.cancelled_at is distinct from OLD.cancelled_at
       or NEW.cancelled_by is distinct from OLD.cancelled_by
       or NEW.completed_at is distinct from OLD.completed_at then
      raise exception 'Snapshot columns only mutate via status transitions';
    end if;
    return NEW;
  end if;

  -- (c) Transition validation
  if v_is_system then
    if not (
      (OLD.status = 'PENDING'   and NEW.status = 'CANCELLED')
      or
      (OLD.status = 'CONFIRMED' and NEW.status = 'COMPLETED')
    ) then
      raise exception 'System path: illegal transition % → %', OLD.status, NEW.status;
    end if;
    if NEW.status = 'CANCELLED' and NEW.cancelled_by is distinct from 'system' then
      raise exception 'System cancellation must set cancelled_by=system';
    end if;

    -- System path defense-in-depth: same time floor as trainer T2 gate.
    -- Cron should only fire CONFIRMED → COMPLETED after starts_at + duration
    -- + grace, but trigger guards against buggy cron firing before session
    -- even starts. Mirrors the trainer-path Q3 (loose-with-starts_at-floor)
    -- decision.
    if NEW.status = 'COMPLETED' and now() < OLD.starts_at then
      raise exception 'System: cannot complete before session start (starts_at=%, now=%)',
        OLD.starts_at, now();
    end if;

  elsif v_actor_is_owner then
    if (OLD.status = 'PENDING'   and NEW.status = 'CANCELLED')
       or
       (OLD.status = 'CONFIRMED' and NEW.status = 'CANCELLED')
    then
      if NEW.cancelled_by is distinct from 'owner' then
        raise exception 'Owner cancellation must set cancelled_by=owner';
      end if;
    else
      raise exception 'Owner: illegal transition % → %', OLD.status, NEW.status;
    end if;

  elsif v_actor_is_trainer then
    if OLD.status = 'PENDING' and NEW.status = 'CONFIRMED' then
      if OLD.starts_at <= now() then
        raise exception 'Cannot confirm a booking whose start time has passed (starts_at=%)', OLD.starts_at;
      end if;

    elsif (OLD.status = 'PENDING'   and NEW.status = 'CANCELLED')
          or
          (OLD.status = 'CONFIRMED' and NEW.status = 'CANCELLED') then
      if NEW.cancelled_by is distinct from 'trainer' then
        raise exception 'Trainer cancellation must set cancelled_by=trainer';
      end if;

    elsif OLD.status = 'CONFIRMED' and NEW.status = 'COMPLETED' then
      if now() < OLD.starts_at then
        raise exception 'Cannot complete before session start (starts_at=%, now=%)', OLD.starts_at, now();
      end if;

    else
      raise exception 'Trainer: illegal transition % → %', OLD.status, NEW.status;
    end if;

  else
    raise exception 'Caller is not a party to this booking';
  end if;

  -- (d) Snapshot writes
  if NEW.status = 'CANCELLED' and NEW.cancelled_at is null then
    NEW.cancelled_at := now();
  end if;
  if NEW.status = 'COMPLETED' and NEW.completed_at is null then
    NEW.completed_at := now();
  end if;

  return NEW;
end;
$$;

create trigger trg_bookings_validate_update
  before update on public.bookings
  for each row
  execute function public.bookings_validate_update();

create trigger trg_bookings_updated_at
  before update on public.bookings
  for each row
  execute function public.update_updated_at_column();


-- ----------------------------------------------------------------------------
-- 11. RLS — Category 4 policies
-- ----------------------------------------------------------------------------
alter table public.bookings enable row level security;

create policy "Parties read their own bookings"
  on public.bookings
  for select
  to authenticated
  using (auth.uid() in (owner_id, trainer_id));

create policy "Owners create their own bookings"
  on public.bookings
  for insert
  to authenticated
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'owner'
    )
  );

create policy "Parties update their own bookings"
  on public.bookings
  for update
  to authenticated
  using (auth.uid() in (owner_id, trainer_id))
  with check (auth.uid() in (owner_id, trainer_id));


-- ----------------------------------------------------------------------------
-- 12. Dogs RLS forward-fix: trainers read dogs they have any booking for
-- ----------------------------------------------------------------------------
create policy "Trainers read dogs they have any booking for"
  on public.dogs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.dog_id = dogs.id
        and b.trainer_id = auth.uid()
    )
  );


-- ----------------------------------------------------------------------------
-- 13. GRANTs
-- ----------------------------------------------------------------------------
grant select, insert, update on public.bookings to authenticated;

-- Supabase's platform default (pg_default_acl) auto-grants ALL privileges to
-- anon AND authenticated on every public-schema table. The GRANT above is
-- therefore redundant for addition — those privileges already exist. Worse,
-- anon and authenticated also hold DELETE/TRUNCATE/REFERENCES/TRIGGER that §13
-- never intended. The REVOKEs below make the GRANT layer actually restrictive:
-- anon gets nothing, authenticated gets exactly the three DML operations
-- bookings needs. This restores the GRANT layer as a real second gate beneath
-- RLS — without it, the four-layer defense-in-depth claim in the M6 header is
-- false at the privilege layer (RLS would be the SOLE gate, and a disabled/
-- misconfigured RLS policy would expose full CRUD to anon).
revoke all on public.bookings from anon;
revoke delete, truncate, references, trigger
  on public.bookings from authenticated;
-- authenticated retains exactly: select, insert, update


-- ----------------------------------------------------------------------------
-- 14. Column + table documentation
-- ----------------------------------------------------------------------------
comment on table public.bookings is
  'Cat 4 keystone — two non-symmetric parties (owner, trainer) hold row-level read access; writes are gated by (identity × current state) via the §10 BEFORE UPDATE trigger, not by RLS alone. See migration header for the full state transition table, the four-layer defense-in-depth rationale, and Category 4 classification notes.';

comment on column public.bookings.trainer_id is
  'FK to trainers(id). The FK target itself is structural trainer-role evidence — trainers extends profiles only for role=trainer, so no separate role gate is needed here (contrast owner_id). See header "FK target asymmetry".';

comment on column public.bookings.owner_id is
  'FK to profiles(id) — owner-role is a value on profiles.role, not a separate table, so the FK alone proves nothing. §9 INSERT trigger validates role=owner. See header "FK target asymmetry" for why this asymmetry is correct rather than an oversight.';

comment on column public.bookings.dog_id is
  'Drives dog-level (not owner-level) trainer visibility via §12 dogs RLS — a trainer with a booking for Rex sees Rex only, not Bella or Max in the same household. §9 trigger validates dog.owner_id = owner_id AND deleted_at IS NULL (G1); without this gate, a leaked dog UUID would let an attacker widen the victim''s dog visibility to an attacker-chosen trainer.';

comment on column public.bookings.service_id is
  'FK to trainer_services(id). §9 validates service.trainer_id = trainer_id AND service is active (G2) — service UUIDs are public-readable, so the FK alone does not prevent cross-trainer attachment.';

comment on column public.bookings.starts_at is
  'Immutable post-INSERT (§10 I1). §9 enforces starts_at > now() + 15 minutes — short enough to allow last-minute bookings, long enough to absorb clock skew and give the trainer notice. If a future migration adds rescheduling, the I1 + EXCLUDE invariant in the header must be re-analyzed.';

comment on column public.bookings.duration_minutes is
  'Denormalized from trainer_services at INSERT; §9 validates equality with source (G3). Drives the generated ends_at column, which is what the §6 EXCLUDE constraint indexes. Immutable post-INSERT — see header "I1 + EXCLUDE mutual reinforcement".';

comment on column public.bookings.ends_at is
  'Generated stored column derived from starts_at and duration_minutes via public._bookings_ends_at(). Indexed by the §6 EXCLUDE constraint as the upper bound of tstzrange(starts_at, ends_at, ''[)''). The wrapper function exists because Postgres marks timestamptz + interval as STABLE in general; see the COMMENT ON FUNCTION for the IMMUTABLE contract.';

comment on column public.bookings.price_cents is
  'Integer cents (USD V1 by trainer_services convention). Denormalized from trainer_services at INSERT; §9 validates equality with source (G3); immutable post-INSERT. CHECK bounds (1 to $1M) match trainer_services per the M4 reasoning.';

comment on column public.bookings.stripe_payment_intent_id is
  'NOT NULL enforces E1 — every booking row carries a Stripe payment intent (no half-created bookings without payment in flight). UNIQUE via bookings_stripe_payment_intent_unique so the Phase 8 webhook handler can resolve "which booking does this event belong to" idempotently, even if Stripe delivers the same event twice.';

comment on column public.bookings.status is
  'State machine value. Defaults to PENDING; mutates only via §10 BEFORE UPDATE trigger, which enforces (actor × old → new) transitions and writes the matching snapshot column. See migration header for the full transition table.';

comment on column public.bookings.cancelled_by is
  'Who triggered cancellation. ''owner'' and ''trainer'' values enforced against §10 actor classification; ''system'' covers transition 5 (auto-expire / payment-failure) on the service_role path. NULL when status is not CANCELLED — enforced by §7 bookings_cancelled_by_iff_cancelled.';
