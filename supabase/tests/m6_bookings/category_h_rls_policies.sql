-- ============================================================================
-- Category H — §11 RLS policies on bookings (Category 4 dual-party)
-- ============================================================================
-- Covers the three §11 policies, all `to authenticated`:
--
--   SELECT "Parties read their own bookings"
--     using (auth.uid() in (owner_id, trainer_id))
--   INSERT "Owners create their own bookings"
--     with check (auth.uid() = owner_id
--                 and exists (select 1 from profiles
--                             where id = auth.uid() and role = 'owner'))
--   UPDATE "Parties update their own bookings"
--     using (auth.uid() in (owner_id, trainer_id))
--     with check (auth.uid() in (owner_id, trainer_id))
--
-- ACTOR MODEL — why H differs from A–F:
--   A–F ran as `postgres`, which BYPASSES RLS (superuser). H must exercise
--   RLS, so every case acts as `authenticated` with a real auth.uid():
--     set local role authenticated;
--     set local request.jwt.claims to '{"sub":"<uuid>"}';
--   auth.uid() reads `sub` from the JWT claims. The JWT-clearing prelude
--   (postgres + empty claims) still opens each case — seeding and transient-
--   user creation happen as postgres before the role switch to the test actor.
--
-- TWO VERIFICATION MECHANISMS (RLS has two failure modes):
--   • Silent filtering (USING on SELECT/UPDATE): RLS hides rows, it does NOT
--     raise. A blocked SELECT returns count(*) = 0; a blocked UPDATE reports
--     ROW_COUNT = 0. Verified by count assertion / GET DIAGNOSTICS row_count.
--   • WITH CHECK denial (INSERT/UPDATE): raises SQLSTATE 42501
--     (insufficient_privilege), 'new row violates row-level security policy'.
--     Verified by the familiar DO-block + SQLSTATE pattern.
--
-- TWO GATE-ORDERING FINDINGS (surfaced in H6a/H6b and H8):
--   Postgres fires BEFORE-row triggers BEFORE evaluating RLS WITH CHECK, on
--   both INSERT and UPDATE. So the §9/§10 triggers PRE-EMPT the RLS WITH CHECK
--   whenever both would reject the same row:
--     - H6a/H6b: a non-owner inserting owner_id=self is rejected by the §9
--       BEFORE INSERT trigger (23503 'is not a profile with role=owner')
--       BEFORE the RLS role-gate EXISTS clause is ever reached. The RLS EXISTS
--       clause is therefore a defense-in-depth backstop, unreachable as a SOLE
--       failure while §9 is enabled. H6a tests production ordering (§9 wins);
--       H6b disables §9 to test the RLS EXISTS clause in isolation (42501).
--     - H8: an owner mutating owner_id is rejected by the §10 immutability
--       guard (P0001) BEFORE the RLS WITH CHECK identity clause. Parallel to
--       F8 — H8 traps 42501 explicitly as a gate-ordering regression.
--
-- Postgres execution order observation: BEFORE-row triggers fire before RLS
-- WITH CHECK on both INSERT and UPDATE. This means production rejections come
-- from the trigger layer first; RLS WITH CHECK only fires for inputs that pass
-- the trigger. In M6's case, this makes the §9 owner-role gate the production
-- rejection path, with §11's RLS EXISTS clause as defense-in-depth. The
-- H6a/H6b pair (and H8) tests both the production ordering AND the deeper
-- layer in isolation. Same pattern as F7/F8 for the §10a-vs-UNIQUE pair.
--
-- SECURITY INVOKER interaction (the H5 redesign finding):
--
--   bookings_validate_insert() is SECURITY INVOKER (default), so its EXISTS
--   subquery against public.profiles runs under the CALLER's RLS context.
--   M1's profiles RLS restricts visibility to (a) your own profile and (b)
--   trainer profiles. So §9's owner-role check on an INSERT by a trainer
--   effectively asks 'can I see a profile with this id and role=owner?' — and
--   the answer is NO for any other-owner-id, because trainers cannot see
--   other owners' profiles.
--
--   This means §9's owner-role gate is doing double duty in production: it
--   checks role AND, as a side effect of SECURITY INVOKER semantics, enforces
--   cross-owner INSERT isolation. A trainer attempting to INSERT a booking
--   for any other owner_id (including a real owner's id) is rejected by §9
--   with 23503 before bookings RLS WITH CHECK is reached.
--
--   Consequence: the bookings RLS INSERT WITH CHECK is PURE BACKSTOP in
--   production. Both its clauses (identity check AND role-gate EXISTS) become
--   observable only when §9 is disabled. H5 and H6b isolate the two clauses;
--   H6a documents the production ordering.
--
--   This is a STRONGER security guarantee than M6's design documentation
--   originally captured — surfaced during test drafting, lodged here for
--   posterity.
--
-- TRANSIENT THIRD PARTY:
--   owner_c (88888888-…, role=owner, NO bookings) is created per-case inside
--   the relevant BEGIN/ROLLBACK via an auth.users insert (the M1
--   handle_new_user trigger mints the matching profiles row). The ROLLBACK
--   cascades it away — no permanent fixture state. H3 and H7 use it.
--
-- 9 cases:
--   H1  Owner SELECT      — sees own booking            (count = 1)
--   H2  Trainer SELECT    — sees own booking            (count = 1)
--   H3  Third-party SELECT— sees zero rows (RLS hides)  (count = 0)
--   H4  Owner INSERT      — succeeds (§9 + RLS pass)    (no exception, count = 1)
--   H5  Owner INSERT owner_id=other-owner, §9 DISABLED — RLS identity clause (42501)
--   H6a Trainer INSERT owner_id=self, §9 ENABLED  — §9 pre-empts RLS (23503)
--   H6b Trainer INSERT owner_id=self, §9 DISABLED — RLS EXISTS clause (42501)
--   H7  Third-party UPDATE— 0 rows affected (RLS hides) (ROW_COUNT = 0)
--   H8  Owner UPDATE owner_id→other — §10 immutability pre-empts RLS (P0001)
--
-- Acceptance: all 9 cases must PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- H1: Owner SELECT sees own booking
-- Seed one booking (owner 1111 / trainer 2222) as postgres, then read it back
-- as authenticated owner 1111. RLS USING (auth.uid() in (owner,trainer)):
-- 1111 ∈ (1111,2222) -> visible -> count = 1.
-- ============================================================================
\echo
\echo === H1: owner SELECT sees own booking ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_h1');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_count integer;
  begin
    select count(*) into v_count from public.bookings
      where stripe_payment_intent_id = 'pi_test_h1';
    if v_count = 1 then
      raise notice 'H1 PASS | owner sees own booking | count=%', v_count;
    else
      raise exception 'H1 FAIL: owner should see 1 booking, saw %', v_count;
    end if;
  end $$;
rollback;

-- ============================================================================
-- H2: Trainer SELECT sees own booking
-- Same seed, read back as authenticated trainer 2222. 2222 ∈ (1111,2222)
-- -> visible -> count = 1. Confirms the policy is symmetric across both
-- non-symmetric parties (owner AND trainer), not owner-only.
-- ============================================================================
\echo
\echo === H2: trainer SELECT sees own booking ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_h2');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_count integer;
  begin
    select count(*) into v_count from public.bookings
      where stripe_payment_intent_id = 'pi_test_h2';
    if v_count = 1 then
      raise notice 'H2 PASS | trainer sees own booking | count=%', v_count;
    else
      raise exception 'H2 FAIL: trainer should see 1 booking, saw %', v_count;
    end if;
  end $$;
rollback;

-- ============================================================================
-- H3: Third-party SELECT sees zero rows (RLS silently hides)
-- The seeded booking EXISTS (a postgres count would return 1), but
-- authenticated owner_c 8888 is neither owner (1111) nor trainer (2222):
-- 8888 ∉ (1111,2222) -> RLS USING filters it -> count = 0, NO exception.
-- Transient owner_c created via auth.users (M1 trigger mints the profile).
-- ============================================================================
\echo
\echo === H3: third-party SELECT sees zero rows ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  -- transient owner_c (role=owner, no bookings); cascades away on rollback
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data,
                          is_super_admin, confirmation_token, email_change,
                          email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000','88888888-8888-8888-8888-888888888888',
          'authenticated','authenticated','owner-c@test.local','',
          now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,
          false,'','','','');
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_h3');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"88888888-8888-8888-8888-888888888888"}';
  do $$
  declare v_count integer;
  begin
    select count(*) into v_count from public.bookings
      where stripe_payment_intent_id = 'pi_test_h3';
    if v_count = 0 then
      raise notice 'H3 PASS | third party sees zero rows (RLS hides) | count=%', v_count;
    else
      raise exception 'H3 FAIL: third party should see 0 bookings, saw % (RLS not filtering)', v_count;
    end if;
  end $$;
rollback;

-- ============================================================================
-- H4: Owner INSERT succeeds (§9 trigger + RLS WITH CHECK both pass)
-- Reasserts A1 inside the §11 coverage block. authenticated owner 1111:
--   §9 -> all gates pass (owner role, dog owned, service offered, price/dur
--         match, future time)
--   RLS WITH CHECK -> auth.uid()=owner_id (1111=1111) AND exists(profile
--         1111 role=owner) -> TRUE
-- Verify by: no exception, then count=1 visible to the same owner.
-- ============================================================================
\echo
\echo === H4: owner INSERT succeeds ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_count integer; v_sqlstate text; v_message text;
          v_raised boolean := false;
  begin
    begin
      insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                    starts_at, duration_minutes, price_cents,
                                    stripe_payment_intent_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '24 hours', 60, 12000, 'pi_test_h4');
    exception when others then
      v_raised := true;
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_raised then
      raise exception 'H4 FAIL: owner INSERT was rejected. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
    select count(*) into v_count from public.bookings
      where stripe_payment_intent_id = 'pi_test_h4';
    if v_count = 1 then
      raise notice 'H4 PASS | owner INSERT succeeded and is visible | count=%', v_count;
    else
      raise exception 'H4 FAIL: inserted booking not visible to owner, count=%', v_count;
    end if;
  end $$;
rollback;

-- ============================================================================
-- H5: Owner INSERT owner_id=other-owner, §9 DISABLED — RLS identity clause (42501)
-- Isolates the RLS WITH CHECK `auth.uid() = owner_id` identity clause. §9 is
-- disabled (it would otherwise pre-empt: owner 1111 cannot see owner_c 8888's
-- profile, so §9's owner-role EXISTS would raise 23503 first — see the
-- SECURITY INVOKER header note). With §9 off, the row reaches RLS WITH CHECK:
--   identity   -> auth.uid()=1111 = owner_id=8888 ? FALSE  -> clause fails
--   role-gate  -> exists(profile 1111 role='owner')? TRUE  -> clause passes
-- Identity is the SOLE failing predicate -> 42501. owner_c 8888 created as a
-- transient real owner so owner_id=8888 represents another owner's id.
-- Trigger-disable reverted by ROLLBACK (safe by transaction scope).
-- ============================================================================
\echo
\echo === H5: RLS identity clause isolated (§9 disabled, owner→other owner) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data,
                          is_super_admin, confirmation_token, email_change,
                          email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000','88888888-8888-8888-8888-888888888888',
          'authenticated','authenticated','owner-c@test.local','',
          now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,
          false,'','','','');
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                    starts_at, duration_minutes, price_cents,
                                    stripe_payment_intent_id)
      values ('88888888-8888-8888-8888-888888888888','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '24 hours', 60, 12000, 'pi_test_h5');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'H5 FAIL: INSERT succeeded — RLS WITH CHECK identity clause did not deny';
    elsif v_sqlstate = '42501' and v_message like '%row-level security policy%' then
      raise notice 'H5 PASS | RLS identity clause denies cross-owner | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'H5 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- H6a: Trainer INSERT owner_id=self, §9 ENABLED — §9 PRE-EMPTS the RLS role-gate
-- Production ordering. authenticated trainer 2222 inserts owner_id=2222
-- (self). The intent was to isolate the RLS WITH CHECK role-gate EXISTS clause
-- (exists profile role=owner), which 2222 (role=trainer) fails. BUT the §9
-- BEFORE INSERT trigger fires FIRST and rejects owner_id=2222 as 'is not a
-- profile with role=owner' (23503, empty constraint_name) before RLS WITH
-- CHECK is ever evaluated.
--
-- Why the RLS EXISTS clause is unreachable as a SOLE failure while §9 is on:
--   - RLS EXISTS only adds value when auth.uid()=owner_id (identity passes)
--     AND auth.uid() is NOT role=owner.
--   - That requires owner_id = a non-owner uid — exactly what §9's owner-role
--     gate rejects first.
--   So the RLS EXISTS clause is a defense-in-depth BACKSTOP (matters only if
--   §9 is dropped). H6b tests it in isolation by disabling §9.
--
-- This case asserts the PRODUCTION reality: §9 (23503) wins.
-- ============================================================================
\echo
\echo === H6a: §9 pre-empts RLS role-gate (§9 enabled) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
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
              now() + interval '24 hours', 60, 12000, 'pi_test_h6a');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'H6a FAIL: insert succeeded — neither §9 nor RLS rejected';
    elsif v_sqlstate = '42501' then
      raise exception 'H6a FAIL (GATE ORDERING REGRESSION): RLS WITH CHECK (42501) fired before the §9 owner-role trigger (23503). §9 BEFORE INSERT must pre-empt RLS WITH CHECK. MSG=%', v_message;
    elsif v_sqlstate = '23503' and v_constraint = '' and v_message like '%is not a profile with role=owner%' then
      raise notice 'H6a PASS | §9 pre-empts RLS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'H6a FAIL: wrong exception. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- H6b: Trainer INSERT owner_id=self, §9 DISABLED — RLS EXISTS clause isolated
-- Deeper-layer isolation (mirrors F8 / category-E backstop pattern). With
-- trg_bookings_validate_insert DISABLED, §9 no longer pre-empts, so the row
-- reaches RLS WITH CHECK. authenticated trainer 2222 inserts owner_id=2222:
--   identity clause   -> auth.uid()=2222 = owner_id=2222 -> TRUE (passes)
--   role-gate EXISTS  -> exists(profile 2222 role='owner') -> 2222 is
--                        role=trainer -> FALSE -> WITH CHECK fails -> 42501
-- Proves the §11 INSERT role-gate EXISTS clause independently rejects a
-- non-owner even if §9 were ever removed. Trigger-disable is reverted by
-- ROLLBACK (safe by transaction scope, same as category E).
-- ============================================================================
\echo
\echo === H6b: RLS EXISTS clause isolated (§9 disabled) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                    starts_at, duration_minutes, price_cents,
                                    stripe_payment_intent_id)
      values ('22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222',
              '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
              now() + interval '24 hours', 60, 12000, 'pi_test_h6b');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'H6b FAIL: insert succeeded — RLS EXISTS role-gate did not reject a non-owner';
    elsif v_sqlstate = '42501' and v_message like '%row-level security policy%' then
      raise notice 'H6b PASS | RLS EXISTS clause denies non-owner | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'H6b FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- H7: Third-party UPDATE — 0 rows affected (RLS silently hides the row)
-- Seed a booking, then as authenticated owner_c 8888 attempt to cancel it.
-- RLS USING (auth.uid() in (owner,trainer)) filters the row out of the
-- UPDATE's scan: 8888 ∉ (1111,2222) -> 0 rows match -> ROW_COUNT = 0, NO
-- exception. The §10 trigger never fires because no row is targeted. This is
-- the canonical RLS-silent-failure mode: the attacker cannot even tell the
-- row exists.
-- ============================================================================
\echo
\echo === H7: third-party UPDATE affects zero rows ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data,
                          is_super_admin, confirmation_token, email_change,
                          email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000','88888888-8888-8888-8888-888888888888',
          'authenticated','authenticated','owner-c@test.local','',
          now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,
          false,'','','','');
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_h7');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"88888888-8888-8888-8888-888888888888"}';
  do $$
  declare v_rowcount integer;
  begin
    update public.bookings
       set status = 'CANCELLED', cancelled_at = now(), cancelled_by = 'owner'
     where stripe_payment_intent_id = 'pi_test_h7';
    get diagnostics v_rowcount = row_count;
    if v_rowcount = 0 then
      raise notice 'H7 PASS | third-party UPDATE hidden by RLS | ROW_COUNT=%', v_rowcount;
    else
      raise exception 'H7 FAIL: third-party UPDATE affected % rows (RLS not filtering)', v_rowcount;
    end if;
  end $$;
rollback;

-- ============================================================================
-- H8: Owner UPDATE owner_id→other — §10 immutability PRE-EMPTS RLS WITH CHECK
-- GATE-ORDERING (parallel to F8). authenticated owner 1111 (a party, so the
-- row is visible via RLS USING) attempts to change owner_id to 3333. BOTH
-- gates would reject:
--   §10 immutability  -> 'owner_id is immutable' (P0001), BEFORE UPDATE trigger
--   RLS WITH CHECK    -> auth.uid()=1111 ∈ (3333,2222)? FALSE -> 42501
-- BEFORE-row triggers run before RLS WITH CHECK, so §10 MUST win (P0001).
-- A 42501 here means immutability was bypassed/reordered — trapped as a
-- gate-ordering regression.
-- ============================================================================
\echo
\echo === H8: §10 immutability fires before RLS WITH CHECK (gate ordering) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_h8');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      update public.bookings
         set owner_id = '33333333-3333-3333-3333-333333333333'
       where stripe_payment_intent_id = 'pi_test_h8';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'H8 FAIL: owner_id UPDATE succeeded — both gates bypassed';
    elsif v_sqlstate = '42501' then
      raise exception 'H8 FAIL (GATE ORDERING REGRESSION): RLS WITH CHECK (42501) fired before §10 immutability (P0001). The §10 BEFORE UPDATE trigger must reject the mutation before RLS WITH CHECK. MSG=%', v_message;
    elsif v_sqlstate = 'P0001' and v_message like '%owner_id is immutable%' then
      raise notice 'H8 PASS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'H8 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

\echo
\echo === Category H complete (9 cases) ===
