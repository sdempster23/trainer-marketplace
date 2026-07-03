-- ============================================================================
-- Category A — nullable payment intent + the one-shot system-path attach (§1)
-- ============================================================================
-- A1 NULL-intent booking INSERT succeeds (owner path, RLS + triggers live)
-- A2 two NULL-intent bookings coexist (UNIQUE is NULLS DISTINCT, pinned live)
-- A3 system NULL -> value attach succeeds, once
-- A4 value -> different rejected: P0001 "immutable once set"
-- A5 value -> NULL rejected: same guard
-- A6 an authenticated PARTY cannot attach: P0001 "Only the system path"
--    (the squat scenario: a party-written value would be protected by
--    immutable-once-set and block the real Phase-8 attach)
-- A7 UNIQUE still fires on duplicate non-NULL values (23505)
--
-- 7 cases. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

\echo
\echo === A1: owner INSERTs a booking with NULL payment intent ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"b1111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_id uuid;
  begin
    insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                 starts_at, duration_minutes, price_cents,
                                 stripe_payment_intent_id)
    values ('b1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222',
            'b4444444-4444-4444-4444-444444444444','b5555555-5555-5555-5555-555555555555',
            now() + interval '24 hours', 60, 5000, null)
    returning id into v_id;
    if v_id is not null then
      raise notice 'A1 PASS | NULL-intent booking created (%)', v_id;
    else
      raise exception 'A1 FAIL: no row returned';
    end if;
  end $$;
rollback;

\echo
\echo === A2: two NULL-intent bookings coexist (NULLS DISTINCT) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                               starts_at, duration_minutes, price_cents, stripe_payment_intent_id)
  values ('b1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222',
          'b4444444-4444-4444-4444-444444444444','b5555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 5000, null),
         ('b1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222',
          'b4444444-4444-4444-4444-444444444444','b5555555-5555-5555-5555-555555555555',
          now() + interval '48 hours', 60, 5000, null);
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from public.bookings
    where owner_id = 'b1111111-1111-1111-1111-111111111111' and stripe_payment_intent_id is null;
    if v_count = 2 then
      raise notice 'A2 PASS | two NULL-intent rows coexist — UNIQUE is NULLS DISTINCT';
    else
      raise exception 'A2 FAIL: expected 2 NULL-intent rows, found %', v_count;
    end if;
  end $$;
rollback;

\echo
\echo === A3: system path attaches the intent, once ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_id uuid; v_pi text;
  begin
    insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                 starts_at, duration_minutes, price_cents, stripe_payment_intent_id)
    values ('b1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222',
            'b4444444-4444-4444-4444-444444444444','b5555555-5555-5555-5555-555555555555',
            now() + interval '24 hours', 60, 5000, null)
    returning id into v_id;

    update public.bookings set stripe_payment_intent_id = 'pi_m11_a3' where id = v_id;
    select stripe_payment_intent_id into v_pi from public.bookings where id = v_id;
    if v_pi = 'pi_m11_a3' then
      raise notice 'A3 PASS | system NULL -> value attach succeeded';
    else
      raise exception 'A3 FAIL: intent is % after attach', v_pi;
    end if;
  end $$;
rollback;

\echo
\echo === A4: value -> different rejected (immutable once set) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_id uuid; v_state text; v_msg text; v_none boolean := false;
  begin
    insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                 starts_at, duration_minutes, price_cents, stripe_payment_intent_id)
    values ('b1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222',
            'b4444444-4444-4444-4444-444444444444','b5555555-5555-5555-5555-555555555555',
            now() + interval '24 hours', 60, 5000, null)
    returning id into v_id;
    update public.bookings set stripe_payment_intent_id = 'pi_m11_a4' where id = v_id;

    begin
      update public.bookings set stripe_payment_intent_id = 'pi_m11_a4_rotated' where id = v_id;
      v_none := true;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    end;
    if v_none then
      raise exception 'A4 FAIL: rotation succeeded — immutable-once-set missing';
    elsif v_state = 'P0001' and v_msg like '%immutable once set%' then
      raise notice 'A4 PASS | SQLSTATE=% MSG=%', v_state, v_msg;
    else
      raise exception 'A4 FAIL: wrong exception SQLSTATE=% MSG=%', v_state, v_msg;
    end if;
  end $$;
rollback;

\echo
\echo === A5: value -> NULL rejected (same guard) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_id uuid; v_state text; v_msg text; v_none boolean := false;
  begin
    insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                 starts_at, duration_minutes, price_cents, stripe_payment_intent_id)
    values ('b1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222',
            'b4444444-4444-4444-4444-444444444444','b5555555-5555-5555-5555-555555555555',
            now() + interval '24 hours', 60, 5000, 'pi_m11_a5')
    returning id into v_id;

    begin
      update public.bookings set stripe_payment_intent_id = null where id = v_id;
      v_none := true;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    end;
    if v_none then
      raise exception 'A5 FAIL: value -> NULL succeeded';
    elsif v_state = 'P0001' and v_msg like '%immutable once set%' then
      raise notice 'A5 PASS | SQLSTATE=% MSG=%', v_state, v_msg;
    else
      raise exception 'A5 FAIL: wrong exception SQLSTATE=% MSG=%', v_state, v_msg;
    end if;
  end $$;
rollback;

\echo
\echo === A6: authenticated parties cannot attach (system path only) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_id uuid; v_state text; v_msg text; v_none boolean := false;
  begin
    insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                 starts_at, duration_minutes, price_cents, stripe_payment_intent_id)
    values ('b1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222',
            'b4444444-4444-4444-4444-444444444444','b5555555-5555-5555-5555-555555555555',
            now() + interval '24 hours', 60, 5000, null)
    returning id into v_id;

    -- the OWNER (a party, RLS-visible row) attempts the squat
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"sub":"b1111111-1111-1111-1111-111111111111"}', true);
    begin
      update public.bookings set stripe_payment_intent_id = 'pi_m11_squat' where id = v_id;
      v_none := true;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    end;
    if v_none then
      raise exception 'A6 FAIL: a party attached an intent — squat possible';
    elsif v_state = 'P0001' and v_msg like '%Only the system path%' then
      raise notice 'A6 PASS | SQLSTATE=% MSG=%', v_state, v_msg;
    else
      raise exception 'A6 FAIL: wrong exception SQLSTATE=% MSG=%', v_state, v_msg;
    end if;
  end $$;
rollback;

\echo
\echo === A7: UNIQUE still fires on duplicate non-NULL values ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_state text; v_none boolean := false;
  begin
    insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                 starts_at, duration_minutes, price_cents, stripe_payment_intent_id)
    values ('b1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222',
            'b4444444-4444-4444-4444-444444444444','b5555555-5555-5555-5555-555555555555',
            now() + interval '24 hours', 60, 5000, 'pi_m11_a7');
    begin
      insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                   starts_at, duration_minutes, price_cents, stripe_payment_intent_id)
      values ('b1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222',
              'b4444444-4444-4444-4444-444444444444','b5555555-5555-5555-5555-555555555555',
              now() + interval '72 hours', 60, 5000, 'pi_m11_a7');
      v_none := true;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_none then
      raise exception 'A7 FAIL: duplicate non-NULL intent accepted';
    elsif v_state = '23505' then
      raise notice 'A7 PASS | duplicate non-NULL intent rejected (23505)';
    else
      raise exception 'A7 FAIL: wrong SQLSTATE %', v_state;
    end if;
  end $$;
rollback;

\echo
\echo === Category A complete (7 cases) ===
