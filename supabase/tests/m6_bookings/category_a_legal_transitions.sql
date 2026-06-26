-- ============================================================================
-- Category A — legal transitions
-- ============================================================================
-- Covers: §10 state machine (every legal transition in the M6 9-transition
--         table) + §10d snapshot auto-write + §9 INSERT path for A1 +
--         §11 RLS owner-INSERT policy for A1.
--
-- 9 transitions tested:
--   A1: INSERT -> PENDING                       (owner JWT, full RLS path)
--   A2: PENDING -> CONFIRMED (trainer)
--   A3: PENDING -> CANCELLED (owner)
--   A4: PENDING -> CANCELLED (trainer)
--   A5: PENDING -> CANCELLED (system)
--   A6: CONFIRMED -> CANCELLED (owner)          (two-step setup)
--   A7: CONFIRMED -> CANCELLED (trainer)        (two-step setup)
--   A8: CONFIRMED -> COMPLETED (trainer)        (trigger-disable for past time)
--   A9: CONFIRMED -> COMPLETED (system)         (trigger-disable for past time)
--
-- Verification: row-state SELECT after action — tuple
--   (status, cancelled_at IS NULL, cancelled_by, completed_at IS NULL)
-- must equal expected. PASS via RAISE NOTICE, FAIL via RAISE EXCEPTION
-- (halts on ON_ERROR_STOP=1).
--
-- Acceptance: all 9 cases must PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- A1: INSERT -> PENDING (owner JWT, full RLS+trigger path)
-- ============================================================================
\echo
\echo === A1: INSERT -> PENDING (owner JWT) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';

  -- action: owner authenticates and INSERTs (RLS owner-create + §9 trigger)
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_a1');

  -- verify (back to postgres so RLS doesn't restrict the SELECT)
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_status text; v_ca_null boolean; v_cb text; v_co_null boolean;
  begin
    select status::text, cancelled_at is null, cancelled_by::text, completed_at is null
      into v_status, v_ca_null, v_cb, v_co_null
      from public.bookings where stripe_payment_intent_id = 'pi_test_a1';
    if v_status = 'PENDING' and v_ca_null and v_cb is null and v_co_null then
      raise notice 'A1 PASS | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    else
      raise exception 'A1 FAIL | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A2: PENDING -> CONFIRMED (trainer JWT)
-- ============================================================================
\echo
\echo === A2: PENDING -> CONFIRMED (trainer JWT) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';

  -- setup: superuser INSERT PENDING
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_a2');

  -- action: trainer JWT, UPDATE to CONFIRMED
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  update public.bookings set status='CONFIRMED'
    where stripe_payment_intent_id = 'pi_test_a2';

  -- verify
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_status text; v_ca_null boolean; v_cb text; v_co_null boolean;
  begin
    select status::text, cancelled_at is null, cancelled_by::text, completed_at is null
      into v_status, v_ca_null, v_cb, v_co_null
      from public.bookings where stripe_payment_intent_id = 'pi_test_a2';
    if v_status = 'CONFIRMED' and v_ca_null and v_cb is null and v_co_null then
      raise notice 'A2 PASS | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    else
      raise exception 'A2 FAIL | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A3: PENDING -> CANCELLED (owner)
-- ============================================================================
\echo
\echo === A3: PENDING -> CANCELLED (owner) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';

  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_a3');

  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  update public.bookings set status='CANCELLED', cancelled_by='owner'
    where stripe_payment_intent_id = 'pi_test_a3';

  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_status text; v_ca_null boolean; v_cb text; v_co_null boolean;
  begin
    select status::text, cancelled_at is null, cancelled_by::text, completed_at is null
      into v_status, v_ca_null, v_cb, v_co_null
      from public.bookings where stripe_payment_intent_id = 'pi_test_a3';
    if v_status = 'CANCELLED' and not v_ca_null and v_cb = 'owner' and v_co_null then
      raise notice 'A3 PASS | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    else
      raise exception 'A3 FAIL | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A4: PENDING -> CANCELLED (trainer)
-- ============================================================================
\echo
\echo === A4: PENDING -> CANCELLED (trainer) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';

  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_a4');

  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  update public.bookings set status='CANCELLED', cancelled_by='trainer'
    where stripe_payment_intent_id = 'pi_test_a4';

  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_status text; v_ca_null boolean; v_cb text; v_co_null boolean;
  begin
    select status::text, cancelled_at is null, cancelled_by::text, completed_at is null
      into v_status, v_ca_null, v_cb, v_co_null
      from public.bookings where stripe_payment_intent_id = 'pi_test_a4';
    if v_status = 'CANCELLED' and not v_ca_null and v_cb = 'trainer' and v_co_null then
      raise notice 'A4 PASS | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    else
      raise exception 'A4 FAIL | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A5: PENDING -> CANCELLED (system path; no JWT)
-- ============================================================================
\echo
\echo === A5: PENDING -> CANCELLED (system) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';

  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_a5');

  -- action: system path (postgres role, no JWT -> auth.uid() returns NULL)
  update public.bookings set status='CANCELLED', cancelled_by='system'
    where stripe_payment_intent_id = 'pi_test_a5';

  do $$
  declare v_status text; v_ca_null boolean; v_cb text; v_co_null boolean;
  begin
    select status::text, cancelled_at is null, cancelled_by::text, completed_at is null
      into v_status, v_ca_null, v_cb, v_co_null
      from public.bookings where stripe_payment_intent_id = 'pi_test_a5';
    if v_status = 'CANCELLED' and not v_ca_null and v_cb = 'system' and v_co_null then
      raise notice 'A5 PASS | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    else
      raise exception 'A5 FAIL | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A6: CONFIRMED -> CANCELLED (owner) — two-step setup
-- ============================================================================
\echo
\echo === A6: CONFIRMED -> CANCELLED (owner) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';

  -- setup step 1: superuser INSERT PENDING
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_a6');

  -- setup step 2: trainer JWT CONFIRM
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  update public.bookings set status='CONFIRMED'
    where stripe_payment_intent_id = 'pi_test_a6';

  -- action: owner JWT CANCEL
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  update public.bookings set status='CANCELLED', cancelled_by='owner'
    where stripe_payment_intent_id = 'pi_test_a6';

  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_status text; v_ca_null boolean; v_cb text; v_co_null boolean;
  begin
    select status::text, cancelled_at is null, cancelled_by::text, completed_at is null
      into v_status, v_ca_null, v_cb, v_co_null
      from public.bookings where stripe_payment_intent_id = 'pi_test_a6';
    if v_status = 'CANCELLED' and not v_ca_null and v_cb = 'owner' and v_co_null then
      raise notice 'A6 PASS | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    else
      raise exception 'A6 FAIL | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A7: CONFIRMED -> CANCELLED (trainer) — two-step setup
-- ============================================================================
\echo
\echo === A7: CONFIRMED -> CANCELLED (trainer) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';

  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_a7');

  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  update public.bookings set status='CONFIRMED'
    where stripe_payment_intent_id = 'pi_test_a7';
  update public.bookings set status='CANCELLED', cancelled_by='trainer'
    where stripe_payment_intent_id = 'pi_test_a7';

  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_status text; v_ca_null boolean; v_cb text; v_co_null boolean;
  begin
    select status::text, cancelled_at is null, cancelled_by::text, completed_at is null
      into v_status, v_ca_null, v_cb, v_co_null
      from public.bookings where stripe_payment_intent_id = 'pi_test_a7';
    if v_status = 'CANCELLED' and not v_ca_null and v_cb = 'trainer' and v_co_null then
      raise notice 'A7 PASS | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    else
      raise exception 'A7 FAIL | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A8: CONFIRMED -> COMPLETED (trainer) — trigger-disable for past-time setup
-- ============================================================================
-- §9 INSERT trigger rejects past starts_at; §10 trainer-COMPLETE requires
-- now() >= starts_at. We disable both triggers to insert a past-time
-- CONFIRMED row, then re-enable so the §10 trainer-COMPLETE gate fires
-- correctly on the UPDATE under test.
-- ============================================================================
\echo
\echo === A8: CONFIRMED -> COMPLETED (trainer) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';

  alter table public.bookings disable trigger trg_bookings_validate_insert;
  alter table public.bookings disable trigger trg_bookings_validate_update;
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id, status)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() - interval '30 minutes', 60, 12000, 'pi_test_a8', 'CONFIRMED');
  alter table public.bookings enable trigger trg_bookings_validate_insert;
  alter table public.bookings enable trigger trg_bookings_validate_update;

  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  update public.bookings set status='COMPLETED'
    where stripe_payment_intent_id = 'pi_test_a8';

  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_status text; v_ca_null boolean; v_cb text; v_co_null boolean;
  begin
    select status::text, cancelled_at is null, cancelled_by::text, completed_at is null
      into v_status, v_ca_null, v_cb, v_co_null
      from public.bookings where stripe_payment_intent_id = 'pi_test_a8';
    if v_status = 'COMPLETED' and v_ca_null and v_cb is null and not v_co_null then
      raise notice 'A8 PASS | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    else
      raise exception 'A8 FAIL | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A9: CONFIRMED -> COMPLETED (system) — trigger-disable for past-time setup
-- ============================================================================
-- System path also gates `now() >= starts_at` per the §10 amendment.
-- ============================================================================
\echo
\echo === A9: CONFIRMED -> COMPLETED (system) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';

  alter table public.bookings disable trigger trg_bookings_validate_insert;
  alter table public.bookings disable trigger trg_bookings_validate_update;
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id, status)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() - interval '30 minutes', 60, 12000, 'pi_test_a9', 'CONFIRMED');
  alter table public.bookings enable trigger trg_bookings_validate_insert;
  alter table public.bookings enable trigger trg_bookings_validate_update;

  -- action: system path (no JWT)
  update public.bookings set status='COMPLETED'
    where stripe_payment_intent_id = 'pi_test_a9';

  do $$
  declare v_status text; v_ca_null boolean; v_cb text; v_co_null boolean;
  begin
    select status::text, cancelled_at is null, cancelled_by::text, completed_at is null
      into v_status, v_ca_null, v_cb, v_co_null
      from public.bookings where stripe_payment_intent_id = 'pi_test_a9';
    if v_status = 'COMPLETED' and v_ca_null and v_cb is null and not v_co_null then
      raise notice 'A9 PASS | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    else
      raise exception 'A9 FAIL | (status=%, ca_null=%, cb=%, co_null=%)',
        v_status, v_ca_null, v_cb, v_co_null;
    end if;
  end $$;
rollback;

\echo
\echo === Category A complete (9 cases) ===
