-- ============================================================================
-- Category B — the counterparty profile read (§2)
-- ============================================================================
-- B1 trainer reads the profile of an owner WITH a booking against them
-- B2 a stranger owner (no booking) stays invisible to that trainer
-- B3 the owner's own-profile read is unchanged
-- B4 anon is unchanged: owner profiles invisible, trainer profiles public
-- B5 the P3 no-recursion probe, pinned: an owner INSERTs a booking while the
--    policy is live — the WITH CHECK -> profiles -> bookings chain must not
--    recurse (Postgres would raise 42P17 on policy recursion)
--
-- B6 anon directory read (RPC join + trainer profile) survives with a
--    booking present — the standing trap for the PUBLIC-default detonation
--
-- B7 role change rejected by the trigger-ized freeze (P0001)
-- B8 own display_name UPDATE succeeds — the exact shape the PUBLIC-era
--    42P17 recursion killed; the standing trap against its return
--
-- 8 cases. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

\echo
\echo === B1: trainer sees the counterparty owner profile ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                               starts_at, duration_minutes, price_cents, stripe_payment_intent_id)
  values ('b1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222',
          'b4444444-4444-4444-4444-444444444444','b5555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 5000, null);
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"b2222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_name text;
  begin
    select display_name into v_name from public.profiles
    where id = 'b1111111-1111-1111-1111-111111111111';
    if v_name = 'Owner Bee' then
      raise notice 'B1 PASS | trainer reads counterparty profile (%)', v_name;
    else
      raise exception 'B1 FAIL: got %', coalesce(v_name, '<no row>');
    end if;
  end $$;
rollback;

\echo
\echo === B2: stranger owner (no booking) invisible to the trainer ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                               starts_at, duration_minutes, price_cents, stripe_payment_intent_id)
  values ('b1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222',
          'b4444444-4444-4444-4444-444444444444','b5555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 5000, null);
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"b2222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from public.profiles
    where id = 'b3333333-3333-3333-3333-333333333333';
    if v_count = 0 then
      raise notice 'B2 PASS | stranger owner invisible (0 rows)';
    else
      raise exception 'B2 FAIL: stranger visible (% rows)', v_count;
    end if;
  end $$;
rollback;

\echo
\echo === B3: owner still reads their own profile ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"b1111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_name text;
  begin
    select display_name into v_name from public.profiles
    where id = 'b1111111-1111-1111-1111-111111111111';
    if v_name = 'Owner Bee' then
      raise notice 'B3 PASS | own-profile read unchanged';
    else
      raise exception 'B3 FAIL: got %', coalesce(v_name, '<no row>');
    end if;
  end $$;
rollback;

\echo
\echo === B4: anon unchanged — owner profiles hidden, trainer profiles public ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                               starts_at, duration_minutes, price_cents, stripe_payment_intent_id)
  values ('b1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222',
          'b4444444-4444-4444-4444-444444444444','b5555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 5000, null);
  set local role anon;
  set local request.jwt.claims to '';
  do $$
  declare v_owner int; v_trainer int;
  begin
    select count(*) into v_owner from public.profiles
    where id = 'b1111111-1111-1111-1111-111111111111';
    select count(*) into v_trainer from public.profiles
    where id = 'b2222222-2222-2222-2222-222222222222';
    if v_owner = 0 and v_trainer = 1 then
      raise notice 'B4 PASS | anon: owner hidden even WITH a booking, trainer public';
    else
      raise exception 'B4 FAIL: owner=% trainer=%', v_owner, v_trainer;
    end if;
  end $$;
rollback;

\echo
\echo === B5: owner INSERT with the policy live — no policy recursion ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"b1111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_id uuid;
  begin
    -- The INSERT WITH CHECK subqueries profiles; profiles SELECT now
    -- subqueries bookings. A recursive policy graph raises 42P17 here —
    -- this case is the standing trap against reintroducing one.
    insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                                 starts_at, duration_minutes, price_cents, stripe_payment_intent_id)
    values ('b1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222',
            'b4444444-4444-4444-4444-444444444444','b5555555-5555-5555-5555-555555555555',
            now() + interval '24 hours', 60, 5000, null)
    returning id into v_id;
    if v_id is not null then
      raise notice 'B5 PASS | booking INSERT under the live policy — chain terminates';
    else
      raise exception 'B5 FAIL: no row';
    end if;
  end $$;
rollback;

\echo
\echo === B6: anon directory read survives the policy (the B4/D1 regression trap) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  -- A booking EXISTS (the qual has something to find) — then anon reads
  -- profiles through nearby_trainers' INVOKER join: the exact production
  -- shape that died under the PUBLIC-defaulted draft ("permission denied for
  -- table bookings"). TO authenticated means anon never evaluates the qual.
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                               starts_at, duration_minutes, price_cents, stripe_payment_intent_id)
  values ('b1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222',
          'b4444444-4444-4444-4444-444444444444','b5555555-5555-5555-5555-555555555555',
          now() + interval '24 hours', 60, 5000, null);
  set local role anon;
  set local request.jwt.claims to '';
  do $$
  declare v_count int; v_names int;
  begin
    select count(*) into v_count from public.nearby_trainers(39.7392, -104.9903, 250);
    select count(*) into v_names from public.profiles where display_name = 'Trainer Bee';
    if v_count = 3 and v_names = 1 then
      raise notice 'B6 PASS | anon RPC join + trainer-profile read both survive with a booking present';
    else
      raise exception 'B6 FAIL: rpc_rows=% trainer_visible=%', v_count, v_names;
    end if;
  end $$;
rollback;

\echo
\echo === B7: role change rejected by the trigger-ized freeze ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"b1111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_state text; v_msg text; v_none boolean := false;
  begin
    begin
      update public.profiles set role = 'trainer'
      where id = 'b1111111-1111-1111-1111-111111111111';
      v_none := true;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    end;
    if v_none then
      raise exception 'B7 FAIL: role change succeeded — freeze missing';
    elsif v_state = 'P0001' and v_msg like '%role is immutable%' then
      raise notice 'B7 PASS | SQLSTATE=% MSG=%', v_state, v_msg;
    else
      raise exception 'B7 FAIL: wrong exception SQLSTATE=% MSG=%', v_state, v_msg;
    end if;
  end $$;
rollback;

\echo
\echo === B8: own display_name UPDATE works (the shape 42P17 killed pre-fix) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"b1111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_name text;
  begin
    update public.profiles set display_name = 'Owner Bee Renamed'
    where id = 'b1111111-1111-1111-1111-111111111111';
    select display_name into v_name from public.profiles
    where id = 'b1111111-1111-1111-1111-111111111111';
    if v_name = 'Owner Bee Renamed' then
      raise notice 'B8 PASS | authenticated profile UPDATE survives the counterparty policy';
    else
      raise exception 'B8 FAIL: got %', coalesce(v_name, '<no row>');
    end if;
  end $$;
rollback;

\echo
\echo === Category B complete (8 cases) ===
