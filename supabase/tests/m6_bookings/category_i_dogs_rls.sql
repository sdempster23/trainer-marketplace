-- ============================================================================
-- Category I — §12 dogs RLS forward-fix (trainer dog visibility via bookings)
-- ============================================================================
-- Covers the §12 policy added to public.dogs by M6:
--
--   "Trainers read dogs they have any booking for"
--     for select to authenticated
--     using (exists (select 1 from public.bookings b
--                    where b.dog_id = dogs.id and b.trainer_id = auth.uid()))
--
-- plus the M2 owner self-read regression guard and the non-party-caller
-- UPDATE case deferred from category B.
--
-- WHY §12 EXISTS — dog-level, not owner-level, visibility:
--   M2 originally committed to owner-level trainer visibility ("a trainer can
--   see their client's dogs"). §12 REFINES that to dog-level: a trainer sees
--   only the specific dog(s) they have a booking for, NOT every dog in that
--   owner's household. This matters for the working-dog community privacy fit
--   (a trainer engaged for one dog should not enumerate the rest of a kennel).
--
-- PRE-INVESTIGATION (SECURITY INVOKER nested-RLS — verified before drafting):
--   §12's EXISTS subquery hits public.bookings. Because RLS policy expressions
--   run under the CALLER's context (see the SECURITY INVOKER finding in
--   category_h_rls_policies.sql), the question was whether a trainer can see
--   their OWN booking inside that subquery. The §11 bookings SELECT policy is
--   auth.uid() in (owner_id, trainer_id) — the trainer's auth.uid() matches
--   trainer_id, so yes. Empirical probe confirmed:
--     trainer sees own bookings = 1, dogs total = 1 (only Rex), Rex via §12 = 1.
--   §12 resolves correctly; no fourth architectural surprise. Unlike the H
--   INSERT path (where profiles RLS hid other owners from a trainer), here the
--   nested policy is SATISFIED because the trainer is a party to their own
--   booking — the caller-scoped RLS works FOR the policy, not against it.
--
-- VERIFICATION MECHANISMS (all silent RLS — no exceptions expected):
--   I1, I4   positive visibility   -> SELECT count(*) = 1
--   I2, I3   silent hide (USING)   -> SELECT count(*) = 0
--   I5       silent hide + gate order -> ROW_COUNT = 0 AND no P0001 (RLS hides
--            the row before the §10 trigger evaluates the transition)
--
-- 5 cases:
--   I1  Trainer SELECTs a dog they HAVE a booking for      -> sees it (1)
--   I2  Trainer SELECTs a household SIBLING (no booking)    -> hidden (0)  [dog-level]
--   I3  Trainer SELECTs an unrelated owner's dog            -> hidden (0)  [leak guard]
--   I4  Owner SELECTs own dog (M2 Policy 1 regression)      -> sees it (1)
--   I5  Non-party UPDATE (B-deferred) — RLS USING hides before §10 (ROW_COUNT
--       0, no 'not a party' P0001; RLS-before-trigger ordering on UPDATE)
--
-- TRANSIENT FIXTURES (created per-case inside BEGIN/ROLLBACK; _fixture.sql
-- stays stable across I/J/K):
--   Bella  = 4b4b4b4b-…  household sibling, owner_a's 2nd dog  (I2)
--   Max    = 99999999-…  owner_c's dog                         (I3)
--   owner_c= 88888888-…  role=owner, no relationship to trainer_a (I3, I5)
--
-- Acceptance: all 5 cases must PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- I1: Trainer SELECTs a dog they have a booking for — sees it (count = 1)
-- Seed a booking (trainer_a 2222 / Rex 4444), then read dogs as trainer_a.
-- §12 EXISTS: a booking with dog_id=Rex AND trainer_id=2222 exists -> Rex
-- visible. Basic policy correctness.
-- ============================================================================
\echo
\echo === I1: trainer sees dog they have a booking for ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_i1');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_rex int;
  begin
    select count(*) into v_rex from public.dogs
      where id = '44444444-4444-4444-4444-444444444444';
    if v_rex = 1 then
      raise notice 'I1 PASS | trainer sees booked dog (Rex) | count=%', v_rex;
    else
      raise exception 'I1 FAIL: trainer should see Rex via §12, saw %', v_rex;
    end if;
  end $$;
rollback;

-- ============================================================================
-- I2: Trainer SELECTs a household sibling they have NO booking for — hidden
-- Bella is owner_a's second dog. Trainer_a has a booking for Rex (so the
-- owner_a relationship exists) but NOT for Bella. §12 is dog-level:
--   Rex   -> EXISTS(booking dog=Rex, trainer=2222)   TRUE  -> visible (1)
--   Bella -> EXISTS(booking dog=Bella, trainer=2222) FALSE -> hidden  (0)
-- Owner self-read does not apply (auth.uid()=2222 ≠ owner_id=1111). Asserting
-- BOTH counts makes the dog-level (not owner-level) refinement explicit.
-- ============================================================================
\echo
\echo === I2: trainer does NOT see household sibling (dog-level) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.dogs (id, owner_id, name) values
    ('4b4b4b4b-4b4b-4b4b-4b4b-4b4b4b4b4b4b',
     '11111111-1111-1111-1111-111111111111', 'Bella');
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_i2');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_rex int; v_bella int;
  begin
    select count(*) into v_rex   from public.dogs where id = '44444444-4444-4444-4444-444444444444';
    select count(*) into v_bella from public.dogs where id = '4b4b4b4b-4b4b-4b4b-4b4b-4b4b4b4b4b4b';
    if v_bella = 0 and v_rex = 1 then
      raise notice 'I2 PASS | dog-level visibility: Rex=% visible, Bella=% hidden', v_rex, v_bella;
    else
      raise exception 'I2 FAIL: expected Rex=1 Bella=0 (dog-level), got Rex=% Bella=%', v_rex, v_bella;
    end if;
  end $$;
rollback;

-- ============================================================================
-- I3: Trainer SELECTs an unrelated owner's dog — hidden (the leak guard)
-- Max belongs to owner_c (8888), an owner trainer_a has no relationship with.
-- Trainer_a does have a (separate) booking for Rex, proving the hide is not
-- merely "trainer has no bookings at all". For Max:
--   §12 EXISTS -> no booking dog=Max, trainer=2222 -> FALSE -> hidden
--   owner read -> 2222 ≠ 8888                        -> no
-- This is the cross-owner enumeration guard: a trainer cannot read arbitrary
-- dogs, only those tied to their own bookings.
-- ============================================================================
\echo
\echo === I3: trainer does NOT see a non-client dog (leak guard) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  -- transient owner_c (role=owner) + their dog Max; cascade away on rollback
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data,
                          is_super_admin, confirmation_token, email_change,
                          email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000','88888888-8888-8888-8888-888888888888',
          'authenticated','authenticated','owner-c@test.local','',
          now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,
          false,'','','','');
  insert into public.dogs (id, owner_id, name) values
    ('99999999-9999-9999-9999-999999999999',
     '88888888-8888-8888-8888-888888888888', 'Max');
  -- trainer_a's unrelated booking (for Rex) — proves the hide is owner-scoped
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                starts_at, duration_minutes, price_cents,
                                stripe_payment_intent_id)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 12000, 'pi_test_i3');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_max int;
  begin
    select count(*) into v_max from public.dogs
      where id = '99999999-9999-9999-9999-999999999999';
    if v_max = 0 then
      raise notice 'I3 PASS | unrelated owner''s dog (Max) hidden | count=%', v_max;
    else
      raise exception 'I3 FAIL: trainer should NOT see Max (no booking, different owner), saw %', v_max;
    end if;
  end $$;
rollback;

-- ============================================================================
-- I4: Owner SELECTs own dog — M2 Policy 1 regression guard
-- The §12 addition is a NEW permissive policy on dogs; it must not disturb
-- M2's "Owners read their own dogs" (auth.uid() = owner_id). owner_a 1111
-- reads Rex with no booking in play -> still visible via the owner policy.
-- ============================================================================
\echo
\echo === I4: owner still sees own dog (M2 Policy 1 regression) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_rex int;
  begin
    select count(*) into v_rex from public.dogs
      where id = '44444444-4444-4444-4444-444444444444';
    if v_rex = 1 then
      raise notice 'I4 PASS | owner sees own dog (Rex) via M2 Policy 1 | count=%', v_rex;
    else
      raise exception 'I4 FAIL: owner should see own dog Rex, saw % (§12 may have disturbed M2)', v_rex;
    end if;
  end $$;
rollback;

-- ============================================================================
-- I5: Non-party UPDATE — RLS USING hides the row BEFORE §10 (B-deferred)
-- Closes the B-deferred "non-party caller" item with gate-ordering coverage
-- (parallel to F8/H8, which test trigger-before-RLS-WITH-CHECK; I5 tests the
-- complementary RLS-USING-before-trigger ordering on UPDATE).
--
-- owner_c 8888 (role=owner, NOT a party) attempts a legal-LOOKING transition
-- PENDING -> CONFIRMED on the seeded booking. Two layers would reject this row:
--   §11 UPDATE USING -> auth.uid()=8888 ∉ (1111,2222) -> row filtered from scan
--   §10 trigger      -> would raise 'Caller is not a party to this booking'
--                       (P0001) IF the row reached it
-- RLS USING is applied to the UPDATE's target scan, so the row is filtered
-- out FIRST: 0 rows match -> §10 never fires -> ROW_COUNT=0 and NO exception.
--
-- PASS requires BOTH conditions (same trap discipline as H6a/H8):
--   - no exception raised by the UPDATE, AND
--   - ROW_COUNT = 0
-- If the 'not a party' P0001 fires, RLS did NOT hide the row first -> gate
-- ordering regressed, trapped explicitly.
--
-- Coverage gain vs H7: H7 verified silent-hide on UPDATE in isolation. I5
-- proves the ORDERING — production rejection of a non-party UPDATE comes from
-- RLS USING, and §10 is never reached.
-- ============================================================================
\echo
\echo === I5: RLS USING hides non-party UPDATE before §10 (B-deferred) ===
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
          now() + interval '24 hours', 60, 12000, 'pi_test_i5');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"88888888-8888-8888-8888-888888888888"}';
  do $$
  declare v_rowcount int; v_sqlstate text; v_message text; v_raised boolean := false;
  begin
    begin
      update public.bookings
         set status = 'CONFIRMED'
       where stripe_payment_intent_id = 'pi_test_i5';
      get diagnostics v_rowcount = row_count;
    exception when others then
      v_raised := true;
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_raised then
      if v_sqlstate = 'P0001' and v_message like '%not a party to this booking%' then
        raise exception 'I5 FAIL (GATE ORDERING REGRESSION): §10 ran before RLS hid the row. Got P0001 "%"', v_message;
      else
        raise exception 'I5 FAIL: unexpected exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
      end if;
    elsif v_rowcount = 0 then
      raise notice 'I5 PASS | RLS USING hid row before §10 | ROW_COUNT=0, no exception';
    else
      raise exception 'I5 FAIL: non-party UPDATE affected % rows (RLS not filtering)', v_rowcount;
    end if;
  end $$;
rollback;

\echo
\echo === Category I complete (5 cases) ===
