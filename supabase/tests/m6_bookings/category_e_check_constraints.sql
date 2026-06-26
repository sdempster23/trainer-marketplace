-- ============================================================================
-- Category E — CHECK constraints (backstop)
-- ============================================================================
-- Covers: §7 snapshot ⇔ status iff-CHECKs (3 named constraints, tested
--         bidirectionally) + §5 column-level bounds CHECKs on price_cents
--         and duration_minutes.
--
-- All E cases require trigger-disable setup: §9 INSERT and §10 UPDATE
-- triggers normally catch most of these inputs before the CHECK sees them.
-- E tests the CHECK as a backstop against direct DB writes that bypass
-- triggers (admin tools, Studio queries, migration backfills).
--
-- 10 cases (Wide — named-constraint regression detection):
--   E1: status=CANCELLED, cancelled_at=NULL          (iff-required missing)
--   E2: status=CANCELLED, cancelled_by=NULL          (iff-required missing)
--   E3: status=COMPLETED, completed_at=NULL          (iff-required missing)
--   E4: status=PENDING, cancelled_at NOT NULL        (iff-forbidden present)
--   E5: status=PENDING, cancelled_by NOT NULL        (iff-forbidden present)
--   E6: status=PENDING, completed_at NOT NULL        (iff-forbidden present)
--   E7: duration_minutes=5                           (below 15 floor)
--   E8: duration_minutes=500                         (above 480 ceiling)
--   E9: price_cents=0                                (below positive floor)
--   E10: price_cents=200000000                       (above $1M ceiling)
--
-- Verification: SQLSTATE='23514' + constraint_name = expected literal.
-- The named-constraint discriminator is what makes Wide valuable — Tight
-- (one case per invariant shape) would pass even if someone consolidated
-- the three §7 iff-CHECKs into one combined CHECK.
--
-- Single-violation discipline: each case is designed via predicate trace
-- to violate exactly one constraint (other CHECKs evaluated and pass).
-- Multi-violation rows are out of scope.
--
-- Acceptance: all 10 cases must PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- E1: status=CANCELLED, cancelled_at=NULL, cancelled_by='owner'
-- Expected constraint: bookings_cancelled_at_iff_cancelled
-- Trace: cancelled_at_iff (FALSE=TRUE -> fails); cancelled_by_iff (TRUE=TRUE -> passes); completed_at_iff (FALSE=FALSE -> passes)
-- ============================================================================
\echo
\echo === E1: status=CANCELLED but cancelled_at=NULL ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  alter table public.bookings disable trigger trg_bookings_validate_update;
  do $$
  declare v_sqlstate text; v_message text; v_constraint text;
          v_no_exception boolean := false;
  begin
    begin
      insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                    starts_at, duration_minutes, price_cents,
                                    stripe_payment_intent_id, status,
                                    cancelled_at, cancelled_by)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '24 hours', 60, 12000, 'pi_test_e1',
              'CANCELLED', NULL, 'owner');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'E1 FAIL: no exception raised';
    elsif v_sqlstate = '23514' and v_constraint = 'bookings_cancelled_at_iff_cancelled' then
      raise notice 'E1 PASS | SQLSTATE=% | CONSTRAINT=%', v_sqlstate, v_constraint;
    else
      raise exception 'E1 FAIL: wrong constraint. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- E2: status=CANCELLED, cancelled_at=now(), cancelled_by=NULL
-- Expected constraint: bookings_cancelled_by_iff_cancelled
-- Trace: cancelled_at_iff (TRUE=TRUE -> passes); cancelled_by_iff (FALSE=TRUE -> fails); completed_at_iff (FALSE=FALSE -> passes)
-- ============================================================================
\echo
\echo === E2: status=CANCELLED but cancelled_by=NULL ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  alter table public.bookings disable trigger trg_bookings_validate_update;
  do $$
  declare v_sqlstate text; v_message text; v_constraint text;
          v_no_exception boolean := false;
  begin
    begin
      insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                    starts_at, duration_minutes, price_cents,
                                    stripe_payment_intent_id, status,
                                    cancelled_at, cancelled_by)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '24 hours', 60, 12000, 'pi_test_e2',
              'CANCELLED', now(), NULL);
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'E2 FAIL: no exception raised';
    elsif v_sqlstate = '23514' and v_constraint = 'bookings_cancelled_by_iff_cancelled' then
      raise notice 'E2 PASS | SQLSTATE=% | CONSTRAINT=%', v_sqlstate, v_constraint;
    else
      raise exception 'E2 FAIL: wrong constraint. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- E3: status=COMPLETED, completed_at=NULL, cancelled_*=NULL
-- Expected constraint: bookings_completed_at_iff_completed
-- Trace: cancelled_at_iff (FALSE=FALSE -> passes); cancelled_by_iff (FALSE=FALSE -> passes); completed_at_iff (FALSE=TRUE -> fails)
-- ============================================================================
\echo
\echo === E3: status=COMPLETED but completed_at=NULL ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  alter table public.bookings disable trigger trg_bookings_validate_update;
  do $$
  declare v_sqlstate text; v_message text; v_constraint text;
          v_no_exception boolean := false;
  begin
    begin
      insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                    starts_at, duration_minutes, price_cents,
                                    stripe_payment_intent_id, status, completed_at)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '24 hours', 60, 12000, 'pi_test_e3',
              'COMPLETED', NULL);
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'E3 FAIL: no exception raised';
    elsif v_sqlstate = '23514' and v_constraint = 'bookings_completed_at_iff_completed' then
      raise notice 'E3 PASS | SQLSTATE=% | CONSTRAINT=%', v_sqlstate, v_constraint;
    else
      raise exception 'E3 FAIL: wrong constraint. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- E4: status=PENDING, cancelled_at=now() (forbidden-present)
-- Expected constraint: bookings_cancelled_at_iff_cancelled
-- Trace: cancelled_at_iff (TRUE=FALSE -> fails); others pass
-- ============================================================================
\echo
\echo === E4: status=PENDING but cancelled_at NOT NULL ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  alter table public.bookings disable trigger trg_bookings_validate_update;
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
              now() + interval '24 hours', 60, 12000, 'pi_test_e4',
              now());
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'E4 FAIL: no exception raised';
    elsif v_sqlstate = '23514' and v_constraint = 'bookings_cancelled_at_iff_cancelled' then
      raise notice 'E4 PASS | SQLSTATE=% | CONSTRAINT=%', v_sqlstate, v_constraint;
    else
      raise exception 'E4 FAIL: wrong constraint. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- E5: status=PENDING, cancelled_by='owner' (forbidden-present)
-- Expected constraint: bookings_cancelled_by_iff_cancelled
-- Trace: cancelled_by_iff (TRUE=FALSE -> fails); others pass
-- ============================================================================
\echo
\echo === E5: status=PENDING but cancelled_by NOT NULL ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  alter table public.bookings disable trigger trg_bookings_validate_update;
  do $$
  declare v_sqlstate text; v_message text; v_constraint text;
          v_no_exception boolean := false;
  begin
    begin
      insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                    starts_at, duration_minutes, price_cents,
                                    stripe_payment_intent_id, cancelled_by)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '24 hours', 60, 12000, 'pi_test_e5',
              'owner');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'E5 FAIL: no exception raised';
    elsif v_sqlstate = '23514' and v_constraint = 'bookings_cancelled_by_iff_cancelled' then
      raise notice 'E5 PASS | SQLSTATE=% | CONSTRAINT=%', v_sqlstate, v_constraint;
    else
      raise exception 'E5 FAIL: wrong constraint. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- E6: status=PENDING, completed_at=now() (forbidden-present)
-- Expected constraint: bookings_completed_at_iff_completed
-- Trace: completed_at_iff (TRUE=FALSE -> fails); others pass
-- ============================================================================
\echo
\echo === E6: status=PENDING but completed_at NOT NULL ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  alter table public.bookings disable trigger trg_bookings_validate_update;
  do $$
  declare v_sqlstate text; v_message text; v_constraint text;
          v_no_exception boolean := false;
  begin
    begin
      insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                    starts_at, duration_minutes, price_cents,
                                    stripe_payment_intent_id, completed_at)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '24 hours', 60, 12000, 'pi_test_e6',
              now());
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'E6 FAIL: no exception raised';
    elsif v_sqlstate = '23514' and v_constraint = 'bookings_completed_at_iff_completed' then
      raise notice 'E6 PASS | SQLSTATE=% | CONSTRAINT=%', v_sqlstate, v_constraint;
    else
      raise exception 'E6 FAIL: wrong constraint. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- E7: duration_minutes=5 (below 15 floor)
-- Expected constraint: bookings_duration_minutes_check
-- Trace: 5 >= 15 (FALSE) AND 5 <= 480 (TRUE) -> overall FALSE -> fails
-- ============================================================================
\echo
\echo === E7: duration_minutes below floor (5) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  alter table public.bookings disable trigger trg_bookings_validate_update;
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
              now() + interval '24 hours', 5, 12000, 'pi_test_e7');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'E7 FAIL: no exception raised';
    elsif v_sqlstate = '23514' and v_constraint = 'bookings_duration_minutes_check' then
      raise notice 'E7 PASS | SQLSTATE=% | CONSTRAINT=%', v_sqlstate, v_constraint;
    else
      raise exception 'E7 FAIL: wrong constraint. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- E8: duration_minutes=500 (above 480 ceiling)
-- Expected constraint: bookings_duration_minutes_check
-- Trace: 500 >= 15 (TRUE) AND 500 <= 480 (FALSE) -> overall FALSE -> fails
-- ============================================================================
\echo
\echo === E8: duration_minutes above ceiling (500) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  alter table public.bookings disable trigger trg_bookings_validate_update;
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
              now() + interval '24 hours', 500, 12000, 'pi_test_e8');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'E8 FAIL: no exception raised';
    elsif v_sqlstate = '23514' and v_constraint = 'bookings_duration_minutes_check' then
      raise notice 'E8 PASS | SQLSTATE=% | CONSTRAINT=%', v_sqlstate, v_constraint;
    else
      raise exception 'E8 FAIL: wrong constraint. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- E9: price_cents=0 (at/below positive floor)
-- Expected constraint: bookings_price_cents_check
-- Trace: 0 > 0 (FALSE) AND 0 <= 100000000 (TRUE) -> overall FALSE -> fails
-- ============================================================================
\echo
\echo === E9: price_cents zero ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  alter table public.bookings disable trigger trg_bookings_validate_update;
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
              now() + interval '24 hours', 60, 0, 'pi_test_e9');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'E9 FAIL: no exception raised';
    elsif v_sqlstate = '23514' and v_constraint = 'bookings_price_cents_check' then
      raise notice 'E9 PASS | SQLSTATE=% | CONSTRAINT=%', v_sqlstate, v_constraint;
    else
      raise exception 'E9 FAIL: wrong constraint. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- E10: price_cents=200000000 ($2M, above $1M ceiling)
-- Expected constraint: bookings_price_cents_check
-- Trace: 200000000 > 0 (TRUE) AND 200000000 <= 100000000 (FALSE) -> overall FALSE -> fails
-- ============================================================================
\echo
\echo === E10: price_cents above ceiling (200000000) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  alter table public.bookings disable trigger trg_bookings_validate_update;
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
              now() + interval '24 hours', 60, 200000000, 'pi_test_e10');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'E10 FAIL: no exception raised';
    elsif v_sqlstate = '23514' and v_constraint = 'bookings_price_cents_check' then
      raise notice 'E10 PASS | SQLSTATE=% | CONSTRAINT=%', v_sqlstate, v_constraint;
    else
      raise exception 'E10 FAIL: wrong constraint. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

\echo
\echo === Category E complete (10 cases) ===
