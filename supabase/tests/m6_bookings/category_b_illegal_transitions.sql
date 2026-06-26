-- ============================================================================
-- Category B — illegal transitions
-- ============================================================================
-- Covers: §10 state machine — every illegal-transition gate raises P0001 +
--         §10b snapshot-mutation guard.
--
-- 8 cases:
--   B1: Owner attempting CONFIRMED
--   B2: Owner attempting COMPLETED (from CONFIRMED)
--   B3: Trainer reversing CONFIRMED -> PENDING
--   B4: Trainer attempting transition FROM COMPLETED (terminal exit)
--   B5: Owner attempting transition FROM CANCELLED (terminal exit)
--   B6: System illegal whitelist exit (PENDING -> CONFIRMED)
--   B7: [BLOCKING] System CONFIRMED -> COMPLETED before starts_at
--       (verifies the §10 system-path time-gate amendment)
--   B8: Snapshot column mutation without status change
--
-- Verification: SQLSTATE='P0001' (all §10 trigger exceptions default to
-- raise_exception) + message substring identifying the specific §10 gate.
-- Substring matches use status names (ASCII) rather than the trigger's
-- Unicode '→' for portability.
--
-- Acceptance: all 8 cases must PASS. ON_ERROR_STOP=1 halts on first FAIL.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- B1: Owner attempting CONFIRMED (only trainer can confirm)
-- Expected gate: '%Owner: illegal transition%PENDING%CONFIRMED%'
-- ============================================================================
\echo
\echo === B1: Owner attempting CONFIRMED ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_b1');
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    set local role authenticated;
    set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
    begin
      update public.bookings set status='CONFIRMED'
        where stripe_payment_intent_id = 'pi_test_b1';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'B1 FAIL: no exception raised';
    elsif v_sqlstate = 'P0001' and v_message like '%Owner: illegal transition%PENDING%CONFIRMED%' then
      raise notice 'B1 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'B1 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- B2: Owner attempting COMPLETED (from CONFIRMED)
-- Expected gate: '%Owner: illegal transition%CONFIRMED%COMPLETED%'
-- ============================================================================
\echo
\echo === B2: Owner attempting COMPLETED ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_b2');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  update public.bookings set status='CONFIRMED'
    where stripe_payment_intent_id = 'pi_test_b2';
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
    begin
      update public.bookings set status='COMPLETED'
        where stripe_payment_intent_id = 'pi_test_b2';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'B2 FAIL: no exception raised';
    elsif v_sqlstate = 'P0001' and v_message like '%Owner: illegal transition%CONFIRMED%COMPLETED%' then
      raise notice 'B2 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'B2 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- B3: Trainer reversing CONFIRMED -> PENDING
-- Expected gate: '%Trainer: illegal transition%CONFIRMED%PENDING%'
-- ============================================================================
\echo
\echo === B3: Trainer reversing CONFIRMED -> PENDING ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_b3');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  update public.bookings set status='CONFIRMED'
    where stripe_payment_intent_id = 'pi_test_b3';
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      update public.bookings set status='PENDING'
        where stripe_payment_intent_id = 'pi_test_b3';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'B3 FAIL: no exception raised';
    elsif v_sqlstate = 'P0001' and v_message like '%Trainer: illegal transition%CONFIRMED%PENDING%' then
      raise notice 'B3 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'B3 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- B4: Trainer attempting transition FROM COMPLETED (terminal-state exit)
-- Setup uses trigger-disable to insert a COMPLETED row directly.
-- Expected gate: '%Trainer: illegal transition%COMPLETED%CANCELLED%'
-- ============================================================================
\echo
\echo === B4: Trainer attempting transition FROM COMPLETED ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  alter table public.bookings disable trigger trg_bookings_validate_update;
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id, status, completed_at)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() - interval '2 hours', 60, 12000, 'pi_test_b4', 'COMPLETED', now() - interval '1 hour');
  alter table public.bookings enable trigger trg_bookings_validate_insert;
  alter table public.bookings enable trigger trg_bookings_validate_update;
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    set local role authenticated;
    set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
    begin
      update public.bookings set status='CANCELLED', cancelled_by='trainer'
        where stripe_payment_intent_id = 'pi_test_b4';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'B4 FAIL: no exception raised';
    elsif v_sqlstate = 'P0001' and v_message like '%Trainer: illegal transition%COMPLETED%CANCELLED%' then
      raise notice 'B4 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'B4 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- B5: Owner attempting transition FROM CANCELLED (terminal-state exit)
-- Setup uses trigger-disable to insert a CANCELLED row directly.
-- Expected gate: '%Owner: illegal transition%CANCELLED%PENDING%'
-- ============================================================================
\echo
\echo === B5: Owner attempting transition FROM CANCELLED ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  alter table public.bookings disable trigger trg_bookings_validate_update;
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id, status, cancelled_at, cancelled_by)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_b5', 'CANCELLED', now(), 'owner');
  alter table public.bookings enable trigger trg_bookings_validate_insert;
  alter table public.bookings enable trigger trg_bookings_validate_update;
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    set local role authenticated;
    set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
    begin
      update public.bookings set status='PENDING'
        where stripe_payment_intent_id = 'pi_test_b5';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'B5 FAIL: no exception raised';
    elsif v_sqlstate = 'P0001' and v_message like '%Owner: illegal transition%CANCELLED%PENDING%' then
      raise notice 'B5 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'B5 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- B6: System illegal whitelist exit (PENDING -> CONFIRMED)
-- System path whitelist allows only PENDING->CANCELLED and CONFIRMED->COMPLETED.
-- Expected gate: '%System path: illegal transition%PENDING%CONFIRMED%'
-- ============================================================================
\echo
\echo === B6: System attempting PENDING -> CONFIRMED ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_b6');
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    -- no role/claims set: superuser, auth.uid() = NULL, system path
    begin
      update public.bookings set status='CONFIRMED'
        where stripe_payment_intent_id = 'pi_test_b6';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'B6 FAIL: no exception raised';
    elsif v_sqlstate = 'P0001' and v_message like '%System path: illegal transition%PENDING%CONFIRMED%' then
      raise notice 'B6 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'B6 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- B7 [BLOCKING]: System CONFIRMED -> COMPLETED before session start
-- Verifies the §10 system-path time-gate amendment fires.
-- Setup: future starts_at, trainer CONFIRM (legal), then system COMPLETE attempt.
-- Expected gate: '%System: cannot complete before session start%'
-- ============================================================================
\echo
\echo === B7 [BLOCKING]: System COMPLETE before session start ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_b7');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  update public.bookings set status='CONFIRMED'
    where stripe_payment_intent_id = 'pi_test_b7';
  -- revert to system path: clear role + claims so auth.uid() returns NULL
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
          v_auth_uid uuid;
  begin
    -- sanity: confirm we're on the system path before attempting
    v_auth_uid := auth.uid();
    if v_auth_uid is not null then
      raise exception 'B7 SETUP ERROR: auth.uid() should be NULL but is %', v_auth_uid;
    end if;
    begin
      update public.bookings set status='COMPLETED'
        where stripe_payment_intent_id = 'pi_test_b7';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'B7 FAIL: no exception raised (amendment may not be firing)';
    elsif v_sqlstate = 'P0001' and v_message like '%System: cannot complete before session start%' then
      raise notice 'B7 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'B7 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- B8: Snapshot column mutation without status change
-- Setup walks legal path to CANCELLED (PENDING -> CONFIRM -> CANCEL),
-- then attempts to mutate cancelled_at while status stays CANCELLED.
-- Expected gate: '%Snapshot columns only mutate via status transitions%'
-- ============================================================================
\echo
\echo === B8: Snapshot mutation without status change ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_b8');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  update public.bookings set status='CONFIRMED'
    where stripe_payment_intent_id = 'pi_test_b8';
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  update public.bookings set status='CANCELLED', cancelled_by='owner'
    where stripe_payment_intent_id = 'pi_test_b8';
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    -- attempt snapshot mutation as owner (status stays CANCELLED)
    begin
      update public.bookings set cancelled_at = now() + interval '1 hour'
        where stripe_payment_intent_id = 'pi_test_b8';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'B8 FAIL: no exception raised';
    elsif v_sqlstate = 'P0001' and v_message like '%Snapshot columns only mutate via status transitions%' then
      raise notice 'B8 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'B8 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

\echo
\echo === Category B complete (8 cases) ===
