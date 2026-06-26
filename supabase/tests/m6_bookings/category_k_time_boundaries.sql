-- ============================================================================
-- Category K — time-gate boundaries (exact-second behavior)
-- ============================================================================
-- The final M6 category. Prior categories tested the time gates with
-- comfortable margins (24h future, 2h past). K tests the EXACT instant where
-- each gate flips — off-by-one and inclusive/exclusive bugs live precisely at
-- the threshold and nowhere else.
--
-- THE FOUR TIME GATES (operators confirmed against the migration):
--   1. §9 INSERT grace (line 335):  starts_at <= now() + '15 min'  -> reject
--        => accept iff starts_at  >  now() + 15 min   (STRICTLY greater)
--        => exactly +15 min is REJECTED (exclusive boundary)
--   2. §10 trainer CONFIRM (line 424): starts_at <= now()  -> reject
--        => confirm iff starts_at  >  now()  (must still be in the future)
--        => exactly at start is REJECTED
--   3. §10 trainer COMPLETE (line 436): now() <  starts_at  -> reject
--        => complete iff now()  >=  starts_at  (INCLUSIVE floor)
--        => exactly at start is ALLOWED
--   4. §10 system COMPLETE (line 405): now() <  starts_at  -> reject
--        => mirrors gate 3 on the system (cron) path
--
-- DETERMINISM — why exact-second boundaries are NOT flaky here:
--   now() is transaction_timestamp() — it returns the SAME instant for the
--   entire transaction, no matter how many statements run. Both the seeded
--   starts_at (built with now()) and the gate's own now() resolve to that one
--   instant. So "starts_at = now()" is an EXACT boundary with zero skew, and
--   "starts_at = now() + 1 second" is exactly one tick past it. This is only
--   flaky when the two now()s evaluate at different real times (separate
--   transactions, or clock_timestamp()). Inside one BEGIN/ROLLBACK they cannot.
--   K therefore tests the true operator boundary, not an approximation.
--
-- SETUP APPROACH per case (flagged inline):
--   - K1/K2 exercise §9 itself, so the §9 trigger stays ENABLED; the row is
--     inserted as postgres (RLS bypass) and §9 fires on the boundary value.
--   - K3-K6 need a CONFIRMED/PENDING row whose starts_at is at/near now() —
--     a state §9 would reject at INSERT (grace gate + PENDING-entry gate). So
--     they DISABLE trg_bookings_validate_insert to seed the row, leaving
--     trg_bookings_validate_update ENABLED for the action under test. Same
--     trigger-disable pattern as categories A8/A9, B4/B5, E (reverted by
--     ROLLBACK — safe by transaction scope).
--
-- 6 cases (all four gates, both sides where meaningful):
--   K1  §9 grace, starts_at = now()+15min exactly      -> REJECTED (23514)
--   K2  §9 grace, starts_at = now()+15min+1s           -> ACCEPTED
--   K3  §10 trainer COMPLETE, starts_at = now() exactly -> ALLOWED (inclusive)
--   K4  §10 trainer COMPLETE, starts_at = now()+1s      -> REJECTED (P0001)
--   K5  §10 system COMPLETE, starts_at = now()+1s       -> REJECTED (P0001)
--   K6  §10 trainer CONFIRM, starts_at = now() exactly  -> REJECTED (P0001)
--
-- Acceptance: all 6 cases must PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- K1: §9 grace boundary — starts_at exactly now()+15min -> REJECTED (exclusive)
-- Gate is `starts_at <= now()+15min -> reject`. Since both now()s are the same
-- transaction instant, starts_at = now()+15min makes the comparison
-- (now()+15min <= now()+15min) TRUE -> rejected. Proves the boundary is
-- exclusive: exactly-15-minutes is NOT far enough out. §9 ENABLED; postgres
-- actor (RLS bypass) so §9 is the only gate in play.
-- Discriminator: 23514 + empty constraint_name + message (matches D's §9 style).
-- ============================================================================
\echo
\echo === K1: 15-min grace, exactly +15min is rejected ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_sqlstate text; v_message text; v_constraint text;
          v_no_exception boolean := false;
  begin
    begin
      insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                    starts_at, duration_minutes, price_cents,
                                    stripe_payment_intent_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '15 minutes', 60, 12000, 'pi_test_k1');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'K1 FAIL: insert accepted at exactly +15min (boundary should be exclusive)';
    elsif v_sqlstate = '23514' and v_constraint = '' and v_message like '%at least 15 minutes%' then
      raise notice 'K1 PASS | exactly +15min rejected | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'K1 FAIL: wrong exception. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- K2: §9 grace boundary — starts_at = now()+15min+1s -> ACCEPTED (just past)
-- One transaction-tick past the gate: (now()+15min+1s <= now()+15min) is
-- FALSE -> accepted. The "just over the line" pass. §9 ENABLED; postgres actor.
-- Verify: no exception AND the row exists.
-- ============================================================================
\echo
\echo === K2: 15-min grace, +15min+1s is accepted ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_sqlstate text; v_message text; v_raised boolean := false; v_count int;
  begin
    begin
      insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                    starts_at, duration_minutes, price_cents,
                                    stripe_payment_intent_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '15 minutes' + interval '1 second', 60, 12000, 'pi_test_k2');
    exception when others then
      v_raised := true;
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_raised then
      raise exception 'K2 FAIL: insert rejected at +15min+1s (should be just past the gate). SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
    select count(*) into v_count from public.bookings where stripe_payment_intent_id = 'pi_test_k2';
    if v_count = 1 then
      raise notice 'K2 PASS | +15min+1s accepted | row present';
    else
      raise exception 'K2 FAIL: no exception but row missing, count=%', v_count;
    end if;
  end $$;
rollback;

-- ============================================================================
-- K3: §10 trainer COMPLETE inclusive floor — starts_at = now() -> ALLOWED
-- Gate is `now() < starts_at -> reject`. At starts_at = now() exactly, the
-- comparison (now() < now()) is FALSE -> NOT rejected -> completion ALLOWED.
-- Proves the floor is inclusive: completing exactly at session start is legal.
-- Seed a CONFIRMED booking at starts_at = now() with §9 INSERT trigger
-- disabled (§9 would reject both the past-grace and non-PENDING entry); the
-- §10 UPDATE trigger stays ENABLED for the COMPLETE action. completed_at is
-- auto-set by §10 section (d).
-- ============================================================================
\echo
\echo === K3: COMPLETE exactly at starts_at is allowed (inclusive) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id, status)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now(), 60, 12000, 'pi_test_k3', 'CONFIRMED');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_sqlstate text; v_message text; v_raised boolean := false;
          v_status public.booking_status; v_completed timestamptz;
  begin
    begin
      update public.bookings set status = 'COMPLETED'
       where stripe_payment_intent_id = 'pi_test_k3';
    exception when others then
      v_raised := true;
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_raised then
      raise exception 'K3 FAIL: COMPLETE rejected at exactly starts_at (floor should be inclusive). SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
    select status, completed_at into v_status, v_completed from public.bookings
      where stripe_payment_intent_id = 'pi_test_k3';
    if v_status = 'COMPLETED' and v_completed is not null then
      raise notice 'K3 PASS | COMPLETE allowed at exactly starts_at | status=% completed_at set', v_status;
    else
      raise exception 'K3 FAIL: unexpected row state status=% completed_at=%', v_status, v_completed;
    end if;
  end $$;
rollback;

-- ============================================================================
-- K4: §10 trainer COMPLETE just-before — starts_at = now()+1s -> REJECTED
-- One transaction-tick before start: (now() < now()+1s) is TRUE -> rejected.
-- The "early completion blocked" case at the tightest boundary. Seed CONFIRMED
-- at now()+1s with §9 disabled; trainer attempts COMPLETE; §10 ENABLED.
-- ============================================================================
\echo
\echo === K4: COMPLETE one second before starts_at is rejected (trainer) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id, status)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '1 second', 60, 12000, 'pi_test_k4', 'CONFIRMED');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      update public.bookings set status = 'COMPLETED'
       where stripe_payment_intent_id = 'pi_test_k4';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'K4 FAIL: COMPLETE accepted 1s before starts_at (should be rejected)';
    elsif v_sqlstate = 'P0001' and v_message like '%Cannot complete before session start%' then
      raise notice 'K4 PASS | early COMPLETE rejected (trainer) | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'K4 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- K5: §10 system COMPLETE just-before — starts_at = now()+1s -> REJECTED
-- The B7 amendment's boundary on the system path (auth.uid() IS NULL). Same
-- now()+1s construction as K4, but the actor is system (postgres, cleared JWT)
-- and the message comes from the system branch (line 405). Together K4+K5 show
-- both COMPLETE paths share the inclusive floor. Seed CONFIRMED at now()+1s
-- with §9 disabled; the system UPDATE runs as postgres with no JWT (§10 still
-- fires for postgres — triggers are not bypassed).
-- ============================================================================
\echo
\echo === K5: COMPLETE one second before starts_at is rejected (system) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id, status)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '1 second', 60, 12000, 'pi_test_k5', 'CONFIRMED');
  -- system actor: postgres role, no JWT -> auth.uid() returns NULL
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      update public.bookings set status = 'COMPLETED'
       where stripe_payment_intent_id = 'pi_test_k5';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'K5 FAIL: system COMPLETE accepted 1s before starts_at (should be rejected)';
    elsif v_sqlstate = 'P0001' and v_message like '%System: cannot complete before session start%' then
      raise notice 'K5 PASS | early COMPLETE rejected (system) | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'K5 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- K6: §10 trainer CONFIRM boundary — starts_at = now() exactly -> REJECTED
-- The fourth gate, otherwise unpinned by K1-K5. Gate is `starts_at <= now()
-- -> reject confirm`. At starts_at = now() exactly, (now() <= now()) is TRUE
-- -> rejected: a trainer cannot confirm a booking whose start instant has
-- arrived. Seed a PENDING booking at starts_at = now() with §9 disabled;
-- trainer attempts CONFIRM; §10 ENABLED.
-- ============================================================================
\echo
\echo === K6: CONFIRM exactly at starts_at is rejected ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id, status)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now(), 60, 12000, 'pi_test_k6', 'PENDING');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      update public.bookings set status = 'CONFIRMED'
       where stripe_payment_intent_id = 'pi_test_k6';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'K6 FAIL: CONFIRM accepted at exactly starts_at (should be rejected)';
    elsif v_sqlstate = 'P0001' and v_message like '%Cannot confirm a booking whose start time has passed%' then
      raise notice 'K6 PASS | CONFIRM rejected at exactly starts_at | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'K6 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

\echo
\echo === Category K complete (6 cases) ===
