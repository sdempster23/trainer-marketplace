-- ============================================================================
-- Category D — §9 INSERT trigger gates
-- ============================================================================
-- Covers: §9 BEFORE INSERT trigger — entry-state + owner role + G1 dog
--         ownership + G2 service-trainer alignment + G3 denorm fidelity +
--         time gate. The R1 amendment's soft-delete filters in G1 and
--         G2/G3 are verified by D5 and D7.
--
-- 10 cases:
--   D1:  status != PENDING at INSERT             (entry-state status)
--   D2:  snapshot column populated at INSERT     (entry-state snapshots)
--   D3:  owner_id is a trainer profile           (owner role gate)
--   D4:  dog belongs to different owner          (G1 — leaked-UUID threat)
--   D5:  dog soft-deleted                        (G1 — R1 amendment verification)
--   D6:  service offered by different trainer    (G2 — cross-trainer)
--   D7:  service soft-deleted                    (G2 — R1 amendment verification)
--   D8:  price_cents mismatch                    (G3 — denorm fidelity)
--   D9:  duration_minutes mismatch               (G3 — denorm fidelity)
--   D10: starts_at within 15-min buffer          (time gate)
--
-- Verification: §9 uses `RAISE EXCEPTION ... USING ERRCODE = 'foreign_key_violation'`
-- (23503) and `'check_violation'` (23514) — same codes as real FK/CHECK
-- violations. Discriminator is `constraint_name IS NULL OR ''` — §9 raises
-- don't set USING CONSTRAINT, so constraint_name is empty for trigger-raised
-- exceptions. A real FK/CHECK violation would populate constraint_name.
--
-- §9 gate ordering is load-bearing for D3: owner-role fires before G1, so
-- D3 (which violates both) tests the right gate. A future refactor that
-- reorders gates will surface as "wrong exception" failures.
--
-- Acceptance: all 10 cases must PASS. ON_ERROR_STOP=1 halts on first FAIL.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- D1: status != PENDING at INSERT
-- Expected: 23514 + '%Bookings must enter at status=PENDING%'
-- ============================================================================
\echo
\echo === D1: status != PENDING at INSERT ===
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
                                    stripe_payment_intent_id, status)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '24 hours', 60, 12000, 'pi_test_d1', 'CONFIRMED');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'D1 FAIL: no exception raised';
    elsif v_sqlstate = '23514' and (v_constraint is null or v_constraint = '')
      and v_message like '%Bookings must enter at status=PENDING%' then
      raise notice 'D1 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'D1 FAIL: wrong exception. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- D2: snapshot column set at INSERT (cancelled_at populated, status=PENDING)
-- Expected: 23514 + '%cancelled_at/cancelled_by/completed_at must be NULL at INSERT%'
-- ============================================================================
\echo
\echo === D2: snapshot column set at INSERT ===
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
                                    stripe_payment_intent_id, cancelled_at)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '24 hours', 60, 12000, 'pi_test_d2', now());
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'D2 FAIL: no exception raised';
    elsif v_sqlstate = '23514' and (v_constraint is null or v_constraint = '')
      and v_message like '%cancelled_at/cancelled_by/completed_at must be NULL at INSERT%' then
      raise notice 'D2 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'D2 FAIL: wrong exception. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- D3: owner_id is a non-owner profile (trainer_a)
-- Note: dog_id is owner_a's Rex, so G1 would ALSO fail — but owner-role
-- gate fires first per §9 ordering. Testing this case verifies the order.
-- Expected: 23503 + '%owner_id%is not a profile with role=owner%'
-- ============================================================================
\echo
\echo === D3: owner_id is a trainer profile ===
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
      values ('22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '24 hours', 60, 12000, 'pi_test_d3');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'D3 FAIL: no exception raised';
    elsif v_sqlstate = '23503' and (v_constraint is null or v_constraint = '')
      and v_message like '%owner_id%is not a profile with role=owner%' then
      raise notice 'D3 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'D3 FAIL: wrong exception. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- D4: G1 dog belongs to different owner (leaked-UUID threat model)
-- Transient fixture: second owner profile (owner_b, UUID 7777...).
-- Expected: 23503 + '%does not belong to owner_id%or dog is not active%'
-- ============================================================================
\echo
\echo === D4: G1 wrong owner (leaked-UUID threat) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  -- transient: second owner profile
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data,
                          is_super_admin, confirmation_token, email_change,
                          email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000','77777777-7777-7777-7777-777777777777',
          'authenticated','authenticated','owner-b@test.local','',
          now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,
          false,'','','','');
  do $$
  declare v_sqlstate text; v_message text; v_constraint text;
          v_no_exception boolean := false;
  begin
    -- owner_b attempts to book Rex (owned by owner_a)
    begin
      insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                    starts_at, duration_minutes, price_cents,
                                    stripe_payment_intent_id)
      values ('77777777-7777-7777-7777-777777777777','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '24 hours', 60, 12000, 'pi_test_d4');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'D4 FAIL: no exception raised (leaked-UUID attack succeeded)';
    elsif v_sqlstate = '23503' and (v_constraint is null or v_constraint = '')
      and v_message like '%does not belong to owner_id%or dog is not active%' then
      raise notice 'D4 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'D4 FAIL: wrong exception. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- D5: G1 dog soft-deleted (R1 amendment verification)
-- If this case fails, the §9 G1 query is missing `and deleted_at is null`.
-- Expected: 23503 + '%does not belong to owner_id%or dog is not active%'
-- ============================================================================
\echo
\echo === D5: G1 soft-deleted dog (R1 verification) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  -- transient: soft-delete Rex
  update public.dogs set deleted_at = now()
    where id = '44444444-4444-4444-4444-444444444444';
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
              now() + interval '24 hours', 60, 12000, 'pi_test_d5');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'D5 FAIL: no exception raised (soft-deleted dog accepted)';
    elsif v_sqlstate = '23503' and (v_constraint is null or v_constraint = '')
      and v_message like '%does not belong to owner_id%or dog is not active%' then
      raise notice 'D5 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'D5 FAIL: wrong exception. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- D6: G2 service offered by different trainer
-- trainer_a books, but service_b belongs to trainer_b.
-- Expected: 23503 + '%service_id%is not offered by trainer_id%'
-- ============================================================================
\echo
\echo === D6: G2 service-trainer cross ===
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
              '44444444-4444-4444-4444-444444444444','66666666-6666-6666-6666-666666666666',
              now() + interval '24 hours', 60, 12000, 'pi_test_d6');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'D6 FAIL: no exception raised (cross-trainer service accepted)';
    elsif v_sqlstate = '23503' and (v_constraint is null or v_constraint = '')
      and v_message like '%service_id%is not offered by trainer_id%' then
      raise notice 'D6 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'D6 FAIL: wrong exception. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- D7: G2 service soft-deleted (R1 amendment verification)
-- If this case fails, the §9 G2 query is missing `and deleted_at is null`.
-- Expected: 23503 + '%service_id%not found or not active%'
-- ============================================================================
\echo
\echo === D7: G2 soft-deleted service (R1 verification) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  -- transient: soft-delete service_a
  update public.trainer_services set deleted_at = now()
    where id = '55555555-5555-5555-5555-555555555555';
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
              now() + interval '24 hours', 60, 12000, 'pi_test_d7');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'D7 FAIL: no exception raised (soft-deleted service accepted)';
    elsif v_sqlstate = '23503' and (v_constraint is null or v_constraint = '')
      and v_message like '%service_id%not found or not active%' then
      raise notice 'D7 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'D7 FAIL: wrong exception. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- D8: G3 price_cents mismatch
-- Expected: 23514 + '%price_cents%does not match service price%'
-- ============================================================================
\echo
\echo === D8: G3 price mismatch ===
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
              now() + interval '24 hours', 60, 99999, 'pi_test_d8');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'D8 FAIL: no exception raised (price mismatch accepted)';
    elsif v_sqlstate = '23514' and (v_constraint is null or v_constraint = '')
      and v_message like '%price_cents%does not match service price%' then
      raise notice 'D8 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'D8 FAIL: wrong exception. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- D9: G3 duration_minutes mismatch
-- Expected: 23514 + '%duration_minutes%does not match service duration%'
-- ============================================================================
\echo
\echo === D9: G3 duration mismatch ===
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
              now() + interval '24 hours', 30, 12000, 'pi_test_d9');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'D9 FAIL: no exception raised (duration mismatch accepted)';
    elsif v_sqlstate = '23514' and (v_constraint is null or v_constraint = '')
      and v_message like '%duration_minutes%does not match service duration%' then
      raise notice 'D9 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'D9 FAIL: wrong exception. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- D10: Time gate — starts_at within 15-min buffer
-- Expected: 23514 + '%starts_at must be at least 15 minutes in the future%'
-- ============================================================================
\echo
\echo === D10: time gate (starts_at too soon) ===
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
              now() + interval '10 minutes', 60, 12000, 'pi_test_d10');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'D10 FAIL: no exception raised (within-buffer starts_at accepted)';
    elsif v_sqlstate = '23514' and (v_constraint is null or v_constraint = '')
      and v_message like '%starts_at must be at least 15 minutes in the future%' then
      raise notice 'D10 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'D10 FAIL: wrong exception. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

\echo
\echo === Category D complete (10 cases) ===
