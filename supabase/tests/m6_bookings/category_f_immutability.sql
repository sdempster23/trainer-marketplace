-- ============================================================================
-- Category F — Immutability gates (§10a I1)
-- ============================================================================
-- Covers: §10a — the immutability block (section (a)) of the BEFORE UPDATE
--         trigger bookings_validate_update(). Nine columns are frozen
--         post-INSERT via `is distinct from OLD` guards that raise before any
--         actor classification or transition logic runs:
--
--           owner_id, trainer_id, dog_id, service_id, starts_at,
--           duration_minutes, price_cents, stripe_payment_intent_id, created_at
--
-- Why section (a) ordering matters: immutability is checked FIRST in the
-- trigger body — before actor classification (auth.uid()) and before the
-- state machine. So an immutable-column UPDATE raises P0001 regardless of
-- WHO the caller is. Every F case therefore runs as the JWT-cleared
-- `postgres` actor: no role setup is needed, and the absence of role setup
-- is itself the proof that the gate is actor-independent.
--
-- All F cases run as JWT-cleared postgres because §10a immutability is the
-- first check in the trigger, firing before actor classification. The
-- absence of role setup is itself proof that the immutability gate is
-- actor-independent — if a future refactor moves immutability after the
-- actor branches, all 8 F cases would fail with 'Caller is not a party to
-- this booking' instead of the expected immutability messages. That failure
-- mode is the early warning: it means the gate stopped being unconditional.
--
-- 8 cases (sampling the 9-column list across its functional groups):
--   F1: owner_id   immutable   (party-FK identity)
--   F2: service_id immutable   (party-FK identity + snapshot source)
--   F3: starts_at  immutable   (I1 + EXCLUDE reinforcement — indexed bound)
--   F4: duration_minutes immutable (I1 + EXCLUDE reinforcement via ends_at)
--   F5: price_cents immutable  (financial snapshot lock)
--   F6: created_at immutable   (system / audit column)
--   F7: stripe_payment_intent_id immutable — NEW unique value (no collision)
--   F8: stripe_payment_intent_id immutable — COLLIDING value (gate ordering)
--
--   Sampled-out by symmetry: trainer_id (mirrors F1 owner_id) and dog_id
--   (mirrors F2 service_id). The nine guards share one uniform mechanism
--   (`is distinct from OLD` → bare raise); sampling one column per functional
--   group exercises the mechanism without redundant cases.
--
-- F7 vs F8 — isolating the immutability gate from the UNIQUE constraint:
--   §5 declares `unique (stripe_payment_intent_id)` (constraint
--   bookings_stripe_payment_intent_unique, SQLSTATE 23505). Two distinct
--   gates can reject a stripe_payment_intent_id UPDATE: the §10a immutability
--   trigger (P0001) and the UNIQUE constraint (23505).
--     - F7 rotates to a brand-new unique value → ONLY immutability can fire.
--       Proves the gate works absent any uniqueness conflict.
--     - F8 rotates to a value that already exists on another row → BOTH gates
--       would reject. Proves immutability WINS. BEFORE-UPDATE triggers run
--       before constraint validation, so P0001 must fire, not 23505. F8's
--       FAIL path traps 23505 explicitly as a gate-ordering regression.
--
-- Verification: SQLSTATE='P0001' + message substring '<col> is immutable'
-- (empty constraint_name — these are raised exceptions, not constraint
-- violations). This matches the Category B discriminator. The baseline INSERT
-- in each case runs with triggers ENABLED and must pass §9; only the UPDATE
-- is the unit under test.
--
-- Single-violation discipline: each UPDATE mutates exactly one immutable
-- column, so the captured message names exactly one gate. §10 does NOT
-- re-validate cross-table integrity on UPDATE (that is §9, INSERT-only), so
-- for F2/F4/F5 the immutability guard is the SOLE blocker — if it were
-- removed, the UPDATE would succeed. That is what makes these regression
-- tests rather than tautologies.
--
-- Acceptance: all 8 cases must PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- F1: owner_id immutable (party-FK identity)
-- Baseline PENDING booking, then UPDATE owner_id 1111 -> 2222 (a real
-- profile, so no FK noise — immutability is the only thing that can reject).
-- Status unchanged (PENDING -> PENDING): without the §10a guard the UPDATE
-- would return at the snapshot-unchanged early-out and commit.
-- ============================================================================
\echo
\echo === F1: owner_id is immutable ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_f1');
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      update public.bookings
         set owner_id = '22222222-2222-2222-2222-222222222222'
       where stripe_payment_intent_id = 'pi_test_f1';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'F1 FAIL: no exception (owner_id mutated — immutability gate missing)';
    elsif v_sqlstate = 'P0001' and v_message like '%owner_id is immutable%' then
      raise notice 'F1 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'F1 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- F2: service_id immutable (party-FK identity + snapshot source)
-- UPDATE service_id 5555 -> 6666 (service_b, a real service). §10 does not
-- re-validate service↔trainer offering on UPDATE (that is §9), so the §10a
-- guard is the sole blocker.
-- ============================================================================
\echo
\echo === F2: service_id is immutable ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_f2');
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      update public.bookings
         set service_id = '66666666-6666-6666-6666-666666666666'
       where stripe_payment_intent_id = 'pi_test_f2';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'F2 FAIL: no exception (service_id mutated — immutability gate missing)';
    elsif v_sqlstate = 'P0001' and v_message like '%service_id is immutable%' then
      raise notice 'F2 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'F2 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- F3: starts_at immutable (I1 + EXCLUDE reinforcement)
-- starts_at is the lower bound of the tstzrange indexed by the §6 EXCLUDE
-- constraint; freezing it is half of the "I1 + EXCLUDE mutual reinforcement"
-- invariant in the M6 header. ends_at is GENERATED from starts_at, so it is
-- not set directly. UPDATE shifts starts_at +24h -> +48h.
-- ============================================================================
\echo
\echo === F3: starts_at is immutable ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_f3');
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      update public.bookings
         set starts_at = now() + interval '48 hours'
       where stripe_payment_intent_id = 'pi_test_f3';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'F3 FAIL: no exception (starts_at mutated — immutability gate missing)';
    elsif v_sqlstate = 'P0001' and v_message like '%starts_at is immutable%' then
      raise notice 'F3 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'F3 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- F4: duration_minutes immutable (I1 + EXCLUDE reinforcement via ends_at)
-- duration_minutes drives ends_at (generated), the upper bound of the §6
-- EXCLUDE range. §10 does not re-validate duration against the service
-- snapshot on UPDATE, so the §10a guard is the sole blocker. UPDATE 60 -> 90.
-- ============================================================================
\echo
\echo === F4: duration_minutes is immutable ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_f4');
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      update public.bookings
         set duration_minutes = 90
       where stripe_payment_intent_id = 'pi_test_f4';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'F4 FAIL: no exception (duration_minutes mutated — immutability gate missing)';
    elsif v_sqlstate = 'P0001' and v_message like '%duration_minutes is immutable%' then
      raise notice 'F4 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'F4 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- F5: price_cents immutable (financial snapshot lock)
-- The denormalized price captured at INSERT is frozen — app code cannot
-- re-price an existing booking. §10 does not re-validate price equality on
-- UPDATE, so the §10a guard is the sole blocker. UPDATE 12000 -> 99999.
-- ============================================================================
\echo
\echo === F5: price_cents is immutable ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_f5');
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      update public.bookings
         set price_cents = 99999
       where stripe_payment_intent_id = 'pi_test_f5';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'F5 FAIL: no exception (price_cents mutated — immutability gate missing)';
    elsif v_sqlstate = 'P0001' and v_message like '%price_cents is immutable%' then
      raise notice 'F5 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'F5 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- F6: created_at immutable (system / audit column)
-- The audit timestamp cannot be rewritten. Trigger-ordering note: the
-- separate trg_bookings_updated_at fires before trg_bookings_validate_update
-- (alphabetical) but only touches updated_at, leaving the rewritten
-- created_at intact for the §10a guard to catch. UPDATE -> 10 days ago.
-- ============================================================================
\echo
\echo === F6: created_at is immutable ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_f6');
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      update public.bookings
         set created_at = now() - interval '10 days'
       where stripe_payment_intent_id = 'pi_test_f6';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'F6 FAIL: no exception (created_at mutated — immutability gate missing)';
    elsif v_sqlstate = 'P0001' and v_message like '%created_at is immutable%' then
      raise notice 'F6 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'F6 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- F7: stripe_payment_intent_id immutable — NEW unique value (no collision)
-- Rotating to a brand-new value that exists on no other row. The UNIQUE
-- constraint (23505) CANNOT fire here — there is nothing to collide with —
-- so a P0001 proves the §10a immutability guard is what rejects the rotation,
-- in isolation from the uniqueness gate. Pairs with F8.
-- ============================================================================
\echo
\echo === F7: stripe_payment_intent_id is immutable (no collision) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_f7');
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      update public.bookings
         set stripe_payment_intent_id = 'pi_test_f7_rotated'
       where stripe_payment_intent_id = 'pi_test_f7';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'F7 FAIL: no exception (stripe_payment_intent_id mutated — immutability gate missing)';
    elsif v_sqlstate = 'P0001' and v_message like '%stripe_payment_intent_id is immutable%' then
      raise notice 'F7 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'F7 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- F8: stripe_payment_intent_id immutable — COLLIDING value (GATE ORDERING)
-- Two PENDING bookings on the same trainer at non-overlapping slots (no §6
-- EXCLUDE conflict): 'pi_test_f8_subject' (+24h) and 'pi_test_f8_target'
-- (+48h). UPDATE the subject's stripe_payment_intent_id to the target's
-- existing value. BOTH gates would reject this:
--   - §10a immutability trigger -> P0001 (BEFORE UPDATE, runs first)
--   - bookings_stripe_payment_intent_unique -> 23505 (constraint check, later)
-- BEFORE-row triggers fire before constraint validation, so immutability MUST
-- win. A 23505 here means the immutability guard was bypassed or reordered —
-- trapped explicitly as a gate-ordering regression.
--
-- F8 verifies trigger-immutability fires before UNIQUE. If SQLSTATE comes
-- back as 23505 (UNIQUE collision) instead of P0001 (trigger immutability),
-- the gate ordering has regressed — UNIQUE is catching what immutability
-- should have.
-- ============================================================================
\echo
\echo === F8: stripe immutability fires before UNIQUE (gate ordering) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_f8_subject');
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '48 hours', 60, 12000, 'pi_test_f8_target');
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      update public.bookings
         set stripe_payment_intent_id = 'pi_test_f8_target'
       where stripe_payment_intent_id = 'pi_test_f8_subject';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'F8 FAIL: no exception (stripe_payment_intent_id mutated — both gates bypassed)';
    elsif v_sqlstate = '23505' then
      raise exception 'F8 FAIL (GATE ORDERING REGRESSION): UNIQUE (23505) fired before immutability (P0001). The §10a BEFORE-UPDATE guard must reject the rotation before constraint validation. MSG=%', v_message;
    elsif v_sqlstate = 'P0001' and v_message like '%stripe_payment_intent_id is immutable%' then
      raise notice 'F8 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'F8 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

\echo
\echo === Category F complete (8 cases) ===
