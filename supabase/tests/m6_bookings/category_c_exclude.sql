-- ============================================================================
-- Category C — EXCLUDE constraint
-- ============================================================================
-- Covers: §6 EXCLUDE USING gist on (trainer_id, tstzrange) WHERE
--         status IN ('PENDING', 'CONFIRMED'). Tests race-safety guarantees
--         and the partial WHERE's scope semantics.
--
-- 3 cases:
--   C1: Two PENDING overlap at INSERT     -> 23P01 (no dueling soft-holds)
--   C2: PENDING + CONFIRMED overlap       -> 23P01 (no booking over committed)
--   C3: CANCELLED row + new PENDING same slot -> succeeds (partial WHERE drops CANCELLED)
--
-- Note: "Two CONFIRMED overlap" is structurally impossible — starts_at is
-- immutable post-INSERT and the EXCLUDE catches PENDING+anything at the
-- second INSERT. Documented in M6 post-merge journal.
--
-- Verification: SQLSTATE='23P01' (exclusion_violation) + constraint_name =
-- literal 'bookings_no_trainer_double_booking' (named-constraint convention
-- from M6 §6 header — auto-generation would change the captured name).
--
-- Acceptance: all 3 cases must PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- C1: PENDING + PENDING overlap at INSERT (two dueling soft-holds)
-- Expected: 23P01 + constraint=bookings_no_trainer_double_booking
-- ============================================================================
\echo
\echo === C1: PENDING + PENDING overlap at INSERT ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  -- setup: booking 1 PENDING (in scope: PENDING is in the EXCLUDE WHERE)
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_c1_a');
  do $$
  declare v_sqlstate text; v_message text; v_constraint text;
          v_no_exception boolean := false;
  begin
    -- action: booking 2 PENDING, overlapping by 30 minutes
    begin
      insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                    starts_at, duration_minutes, price_cents,
                                    stripe_payment_intent_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '24 hours 30 minutes', 60, 12000, 'pi_test_c1_b');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics
        v_sqlstate   = returned_sqlstate,
        v_message    = message_text,
        v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'C1 FAIL: no exception raised (PENDING+PENDING overlap was allowed)';
    elsif v_sqlstate = '23P01' and v_constraint = 'bookings_no_trainer_double_booking' then
      raise notice 'C1 PASS | SQLSTATE=% | CONSTRAINT=% | MSG=%', v_sqlstate, v_constraint, v_message;
    else
      raise exception 'C1 FAIL: wrong exception. SQLSTATE=% CONSTRAINT=% MSG=%',
        v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- C2: PENDING + CONFIRMED overlap at INSERT (no booking over committed slot)
-- Expected: 23P01 + constraint=bookings_no_trainer_double_booking
-- ============================================================================
\echo
\echo === C2: PENDING + CONFIRMED overlap at INSERT ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  -- setup step 1: booking 1 PENDING
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_c2_a');
  -- setup step 2: trainer CONFIRM booking 1
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  update public.bookings set status='CONFIRMED'
    where stripe_payment_intent_id = 'pi_test_c2_a';
  -- revert to superuser for the action INSERT
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_sqlstate text; v_message text; v_constraint text;
          v_no_exception boolean := false;
  begin
    -- action: booking 2 PENDING, overlapping the CONFIRMED row
    begin
      insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                    starts_at, duration_minutes, price_cents,
                                    stripe_payment_intent_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '24 hours 30 minutes', 60, 12000, 'pi_test_c2_b');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics
        v_sqlstate   = returned_sqlstate,
        v_message    = message_text,
        v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'C2 FAIL: no exception raised (PENDING+CONFIRMED overlap was allowed)';
    elsif v_sqlstate = '23P01' and v_constraint = 'bookings_no_trainer_double_booking' then
      raise notice 'C2 PASS | SQLSTATE=% | CONSTRAINT=% | MSG=%', v_sqlstate, v_constraint, v_message;
    else
      raise exception 'C2 FAIL: wrong exception. SQLSTATE=% CONSTRAINT=% MSG=%',
        v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- C3: Re-booking after CANCELLED — succeeds (partial WHERE drops CANCELLED)
-- Setup: booking 1 PENDING -> legal owner-CANCEL.
-- Action: booking 2 PENDING at BIT-IDENTICAL slot (INSERT ... SELECT).
-- Expected: NO exception. count=2, b1.status=CANCELLED, b2.status=PENDING.
-- ============================================================================
\echo
\echo === C3: Re-booking same slot after CANCELLED ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  -- setup: PENDING booking 1
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_c3_a');
  -- legal owner CANCEL
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  update public.bookings set status='CANCELLED', cancelled_by='owner'
    where stripe_payment_intent_id = 'pi_test_c3_a';
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_count int; v_sqlstate text; v_message text; v_constraint text;
          v_unexpected_exception boolean := false;
          v_b1_status text; v_b2_status text;
  begin
    -- action: INSERT booking 2 at EXACT SAME starts_at (via INSERT...SELECT
    -- to ensure bit-identical timestamp, eliminating microsecond drift)
    begin
      insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                    starts_at, duration_minutes, price_cents,
                                    stripe_payment_intent_id)
      select owner_id, trainer_id, dog_id, service_id,
             starts_at, duration_minutes, price_cents,
             'pi_test_c3_b'
        from public.bookings
        where stripe_payment_intent_id = 'pi_test_c3_a';
    exception when others then
      get stacked diagnostics
        v_sqlstate   = returned_sqlstate,
        v_message    = message_text,
        v_constraint = constraint_name;
      v_unexpected_exception := true;
    end;
    if v_unexpected_exception then
      raise exception 'C3 FAIL: unexpected exception on second INSERT. SQLSTATE=% CONSTRAINT=% MSG=%',
        v_sqlstate, v_constraint, v_message;
    end if;
    select count(*) into v_count from public.bookings
      where stripe_payment_intent_id in ('pi_test_c3_a','pi_test_c3_b');
    select status::text into v_b1_status from public.bookings
      where stripe_payment_intent_id = 'pi_test_c3_a';
    select status::text into v_b2_status from public.bookings
      where stripe_payment_intent_id = 'pi_test_c3_b';
    if v_count = 2 and v_b1_status = 'CANCELLED' and v_b2_status = 'PENDING' then
      raise notice 'C3 PASS | count=% | b1.status=% | b2.status=%', v_count, v_b1_status, v_b2_status;
    else
      raise exception 'C3 FAIL: expected count=2, b1=CANCELLED, b2=PENDING. Got count=%, b1=%, b2=%',
        v_count, v_b1_status, v_b2_status;
    end if;
  end $$;
rollback;

\echo
\echo === Category C complete (3 cases) ===
