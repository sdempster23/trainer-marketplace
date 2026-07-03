-- ============================================================================
-- M11 — booking enablers (the Arc-C migration)
-- ============================================================================
-- Four items, all carried in the scratch backlog since their discovery, all
-- probed against the live DB before drafting (P1-P4):
--
-- §1  NO-PAYMENT V1: stripe_payment_intent_id becomes NULLABLE, and the §10
--     immutability gate is amended in place (M9 precedent) to permit exactly
--     ONE NULL -> value transition, system-path only. M6 designed the column
--     NOT NULL + UNIQUE + immutable — payment-intent-BEFORE-insert. v1 books
--     without payment; Phase 8 attaches the intent later without weakening
--     immutable-once-set. UNIQUE stays: Postgres btree UNIQUE is NULLS
--     DISTINCT (PG17 default) — unlimited NULL rows never conflict.
--
-- §2  THE COUNTERPARTY READ: trainers can read profiles of owners who have a
--     booking with them. Without it a trainer's booking list cannot render
--     WHO booked (profiles RLS was trainer-public-or-self only — found in
--     the booking-sequencing investigation). Exact structural mirror of the
--     M6 dogs policy ("Trainers read dogs they have any booking for"),
--     including its no-status-filter semantics: ANY booking (even cancelled)
--     establishes the relationship — matched, not invented. Circularity
--     probed live (P3): bookings' SELECT policy never subqueries profiles,
--     so profiles->bookings terminates; the INSERT-time WITH CHECK chain
--     (bookings->profiles->bookings) also proven non-recursive in a
--     rolled-back run. SCOPED TO authenticated — the PUBLIC default would
--     make anon evaluate a bookings-reading qual with zero bookings grants,
--     breaking every public profiles read (see the §2 comment). §2 also
--     TRIGGER-IZES the profiles role freeze: the old WITH CHECK self-subquery
--     was the policy-recursion partner (42P17 on every authenticated profile
--     UPDATE once the counterparty policy existed) — the freeze moves to a
--     BEFORE UPDATE trigger and the WITH CHECK simplifies (M9's lesson
--     applied: OLD/NEW enforcement is a trigger's job).
--
-- §3  service_role EXECUTE on _bookings_ends_at — the M10 hosted-push drift
--     finding's remedy: local's service_role grant was a PLATFORM ARTIFACT
--     (pre-M10 default ACL at creation time); hosted never had it, so a
--     Phase-8 service_role bookings write that recomputes the GENERATED
--     ends_at column would die with "permission denied for function"
--     (generated-column evaluation checks the DML caller's EXECUTE — M10
--     empirical finding 2). This grant makes it DELIBERATE on both
--     environments. nearby_trainers gets its service_role grant in §4's
--     re-issue.
--
-- §4  nearby_trainers gains max_results/result_offset WITH DEFAULTS (the
--     directory-pagination enabler; the single runtime call site keeps
--     working unchanged). Adding parameters is a SIGNATURE CHANGE: CREATE OR
--     REPLACE would create an OVERLOAD (two functions), so DROP + CREATE,
--     and the new function is born grantless under the M10 §3 guard — the
--     full REVOKE-then-GRANT re-issue follows (M10 §2 pattern, now including
--     service_role explicitly for cross-environment determinism).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. No-payment v1: nullable payment intent + the one-shot attach
-- ----------------------------------------------------------------------------
alter table public.bookings
  alter column stripe_payment_intent_id drop not null;

-- The §10 trigger, re-created IN PLACE from the live definition — everything
-- outside the stripe_payment_intent_id clause is byte-for-byte the M6/M9
-- text (the amendment was spliced into a pg_get_functiondef dump, not
-- retyped). M6's category F suite re-runs as the regression proof that the
-- other eight immutability clauses still fire.
CREATE OR REPLACE FUNCTION public.bookings_validate_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
  if NEW.stripe_payment_intent_id  is distinct from OLD.stripe_payment_intent_id  then
    -- M11 amendment (in-place, the M9 precedent): IMMUTABLE ONCE SET. The
    -- single permitted transition is NULL -> value, and ONLY via the system
    -- path (auth.uid() is null = service_role/postgres — the Phase-8 payment
    -- attach). Parties may never set it: an owner/trainer squatting a value
    -- pre-payment would permanently BLOCK the real attach (immutability
    -- would then protect the squat). value -> NULL and value -> different
    -- still reject unconditionally, for every actor.
    if OLD.stripe_payment_intent_id is not null then
      raise exception 'stripe_payment_intent_id is immutable once set';
    end if;
    if auth.uid() is not null then
      raise exception 'Only the system path may attach a payment intent';
    end if;
  end if;
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
$function$
;


-- ----------------------------------------------------------------------------
-- 2. Counterparty profile read (SELECT only, the dogs-policy mirror)
-- ----------------------------------------------------------------------------
-- No grant change: anon/authenticated SELECT on profiles already exist (M7);
-- this only widens which ROWS an authenticated trainer can see.
--
-- TO authenticated IS LOAD-BEARING (test B4/D1 caught the PUBLIC-defaulted
-- draft breaking every anon read): profiles SELECT policies are OR'd, so a
-- PUBLIC-scoped qual is evaluated for anon too — and this qual reads
-- bookings, where anon holds ZERO grants (M6 §13, by design). The PUBLIC
-- draft made every logged-out profiles read — the entire public directory —
-- die with "permission denied for table bookings". The dogs policy this
-- mirrors never detonates only because its GRANT CONTEXT differs: dogs has
-- no anon SELECT at all, so anon never evaluates dogs policies. A policy
-- mirror without its grant-context mirror is not a mirror. (M7's lesson,
-- now with teeth: policies without TO default to PUBLIC.)
create policy "Trainers read profiles of owners they have a booking with"
on public.profiles for select to authenticated using (
  exists (
    select 1 from public.bookings b
    where b.owner_id = profiles.id and b.trainer_id = auth.uid()
  )
);

-- THE RECURSION PARTNER, corrected (found by M10-E5 during this migration's
-- test run): the profiles UPDATE policy's WITH CHECK carried a role-freeze
-- SELF-SUBQUERY (role = (select role from profiles where id = auth.uid())).
-- A policy on profiles subquerying profiles was always the anomaly — M9's own
-- recorded lesson is that OLD-vs-NEW enforcement is a TRIGGER's job (RLS
-- cannot see OLD) — and it detonated the moment a second table-subquerying
-- SELECT policy (the counterparty read above) joined the expansion: every
-- authenticated profiles UPDATE raised 42P17 "infinite recursion detected".
-- This is a CORRECTION TO CONVENTION, not a workaround: the freeze moves to
-- a BEFORE UPDATE trigger (the M8 §5 immutability pattern) and the WITH
-- CHECK simplifies to plain self-scoping.
--
-- Considered and REJECTED: wrapping the counterparty EXISTS in a SECURITY
-- DEFINER helper inside the policy. Probed live: it bypasses the planner's
-- 42P17 guard into RUNTIME recursion — the backend died with SIGSEGV.
-- DEFINER-inside-policy is not a remedy; Postgres cannot even fail it safely.
--
-- The trigger fires for EVERY updater including the system path — role
-- changes are now impossible for everyone, deliberately (stronger than the
-- old WITH CHECK, which never constrained table-owner writes anyway). An
-- admin role-change flow, if ever wanted, is its own future migration.
create function public.profiles_validate_update()
returns trigger
language plpgsql
as $$
begin
  if NEW.role is distinct from OLD.role then
    raise exception 'role is immutable';
  end if;
  return NEW;
end;
$$;

-- Trigger functions hold no API-role EXECUTE (the M10 §4 sweep convention;
-- firing is checked against the trigger creator, never the DML caller).
revoke execute on function public.profiles_validate_update() from public, anon, authenticated;

create trigger trg_profiles_validate_update
  before update on public.profiles
  for each row execute function public.profiles_validate_update();

alter policy "Users update their own profile" on public.profiles
  with check (auth.uid() = id);


-- ----------------------------------------------------------------------------
-- 3. service_role EXECUTE on _bookings_ends_at (deliberate, both envs)
-- ----------------------------------------------------------------------------
-- Idempotent additive grant — no revoke needed; §4 handles nearby_trainers.
grant execute on function public._bookings_ends_at(timestamp with time zone, integer)
  to service_role;


-- ----------------------------------------------------------------------------
-- 4. nearby_trainers: pagination params via DROP + CREATE + grant re-issue
-- ----------------------------------------------------------------------------
drop function public.nearby_trainers(double precision, double precision, double precision);

-- Same body and security posture as M10 (SQL, STABLE, SECURITY INVOKER,
-- pinned empty search_path, extensions.* qualified), plus:
--   max_results   default 50, CLAMPED to 1..100 in-body — this is a PUBLIC,
--                 anon-callable API; a crafted URL must not demand unbounded
--                 rows. 50 comfortably covers a directory page.
--   result_offset default 0, clamped to >= 0.
-- NOTE for consumers: PostgREST applies CHAINED filters (the directory's
-- display_name floor, specialty ov) AFTER the function's internal LIMIT —
-- a filtered page can therefore return fewer than max_results rows. Fine at
-- current population; the flow arc's pagination UI owns that arithmetic.
create function public.nearby_trainers(
  search_lat double precision,
  search_lng double precision,
  radius_miles double precision,
  max_results integer default 50,
  result_offset integer default 0
)
returns table (
  id uuid,
  display_name text,
  bio text,
  years_experience integer,
  service_radius_meters integer,
  timezone text,
  specialties public.trainer_specialty[],
  lat double precision,
  lng double precision,
  distance_meters double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id,
    p.display_name,
    t.bio,
    t.years_experience,
    t.service_radius_meters,
    t.timezone,
    coalesce(
      (
        select array_agg(a.specialty order by a.specialty)
        from public.trainer_specialty_assignments a
        where a.trainer_id = t.id
      ),
      '{}'::public.trainer_specialty[]
    ) as specialties,
    extensions.st_y(t.service_point::extensions.geometry) as lat,
    extensions.st_x(t.service_point::extensions.geometry) as lng,
    extensions.st_distance(
      t.service_point,
      extensions.st_setsrid(
        extensions.st_makepoint(search_lng, search_lat), 4326
      )::extensions.geography
    ) as distance_meters
  from public.trainers t
  join public.profiles p on p.id = t.id
  where t.service_point is not null
    and extensions.st_dwithin(
      t.service_point,
      extensions.st_setsrid(
        extensions.st_makepoint(search_lng, search_lat), 4326
      )::extensions.geography,
      radius_miles * 1609.344
    )
  order by distance_meters asc
  limit least(greatest(max_results, 1), 100)
  offset greatest(result_offset, 0)
$$;

comment on function public.nearby_trainers(double precision, double precision, double precision, integer, integer) is
  'Directory proximity search: trainers within radius_miles of (search_lat, '
  'search_lng), ordered nearest-first, with directory-card fields and '
  'pagination (max_results clamped to 1..100; result_offset >= 0). SECURITY '
  'INVOKER deliberately (M8 integrity-vs-access convention): rows are gated '
  'by the caller''s own RLS. Distances in meters (geodesic); callers convert '
  'miles at the boundary.';

-- Grant re-issue (the new signature was born grantless under the M10 §3
-- guard). REVOKE-then-GRANT including service_role on BOTH sides: local and
-- hosted platforms disagreed about service_role's platform-default grant
-- (the M10 drift finding) — naming it in both statements makes the final
-- state identical everywhere, deliberately.
revoke execute on function public.nearby_trainers(double precision, double precision, double precision, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.nearby_trainers(double precision, double precision, double precision, integer, integer)
  to anon, authenticated, service_role;
