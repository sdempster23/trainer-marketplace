-- ============================================================================
-- Category E — RLS (§8): participants in, non-parties out
-- ============================================================================
-- Threads are participants-only (auth.uid() IN (owner_id, trainer_id)).
-- Messages derive visibility from the parent thread via an EXISTS — the one
-- SECURITY INVOKER-style interaction left in M8, in the working direction
-- (participant sees the thread -> EXISTS resolves; non-party can't -> hidden;
-- the M6 category-I direction).
--
-- Each case seeds a thread (id = aaaaaaaa-…) as postgres (RLS bypass), then
-- acts as the test principal. Messages are seeded as authenticated owner_a
-- (the §6 sender=auth.uid() gate forbids a postgres/no-JWT message insert).
--
-- Outsiders are REAL non-participants from the fixture: owner_c (an owner not
-- in the thread) and trainer_b (a trainer not in the thread).
--
-- 7 cases. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- E1: owner (participant) SELECTs the thread -> visible
-- ============================================================================
\echo
\echo === E1: owner sees own thread ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.message_threads (id, owner_id, trainer_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v int;
  begin
    select count(*) into v from public.message_threads where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    if v = 1 then raise notice 'E1 PASS | owner sees own thread | count=%', v;
    else raise exception 'E1 FAIL: owner should see thread, count=%', v; end if;
  end $$;
rollback;

-- ============================================================================
-- E2: trainer (participant) SELECTs the thread -> visible
-- ============================================================================
\echo
\echo === E2: trainer sees own thread ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.message_threads (id, owner_id, trainer_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$
  declare v int;
  begin
    select count(*) into v from public.message_threads where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    if v = 1 then raise notice 'E2 PASS | trainer sees own thread | count=%', v;
    else raise exception 'E2 FAIL: trainer should see thread, count=%', v; end if;
  end $$;
rollback;

-- ============================================================================
-- E3: outsider owner (owner_c) SELECTs the thread -> hidden
-- ============================================================================
\echo
\echo === E3: outsider owner sees zero threads ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.message_threads (id, owner_id, trainer_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"88888888-8888-8888-8888-888888888888"}';
  do $$
  declare v int;
  begin
    select count(*) into v from public.message_threads where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    if v = 0 then raise notice 'E3 PASS | outsider owner sees nothing | count=%', v;
    else raise exception 'E3 FAIL: outsider should see 0, count=%', v; end if;
  end $$;
rollback;

-- ============================================================================
-- E4: outsider trainer (trainer_b) SELECTs the thread -> hidden
-- ============================================================================
\echo
\echo === E4: outsider trainer sees zero threads ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.message_threads (id, owner_id, trainer_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333"}';
  do $$
  declare v int;
  begin
    select count(*) into v from public.message_threads where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    if v = 0 then raise notice 'E4 PASS | outsider trainer sees nothing | count=%', v;
    else raise exception 'E4 FAIL: outsider should see 0, count=%', v; end if;
  end $$;
rollback;

-- ============================================================================
-- E5: participant SELECTs messages -> visible (EXISTS resolves for participant)
-- ============================================================================
\echo
\echo === E5: participant sees thread messages ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.message_threads (id, owner_id, trainer_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v int;
  begin
    insert into public.messages (thread_id, sender_id, body)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','hi');
    select count(*) into v from public.messages where thread_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    if v = 1 then raise notice 'E5 PASS | participant sees messages | count=%', v;
    else raise exception 'E5 FAIL: participant should see 1 message, count=%', v; end if;
  end $$;
rollback;

-- ============================================================================
-- E6: outsider SELECTs messages -> hidden (EXISTS false for non-participant)
-- Seed a message as authenticated owner_a, then read as owner_c: owner_c can't
-- see the parent thread, so the messages EXISTS returns false -> count 0.
-- ============================================================================
\echo
\echo === E6: outsider sees zero messages (EXISTS hides the thread) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.message_threads (id, owner_id, trainer_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into public.messages (thread_id, sender_id, body)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','hi');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"88888888-8888-8888-8888-888888888888"}';
  do $$
  declare v int;
  begin
    select count(*) into v from public.messages where thread_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    if v = 0 then raise notice 'E6 PASS | outsider sees no messages (EXISTS hid parent thread) | count=%', v;
    else raise exception 'E6 FAIL: outsider should see 0 messages, count=%', v; end if;
  end $$;
rollback;

-- ============================================================================
-- E7: outsider INSERTs a message -> denied by RLS WITH CHECK (42501)
-- owner_c sets sender_id = self (passes §6), but is not a participant of the
-- parent thread, so the messages INSERT WITH CHECK EXISTS is false -> 42501.
-- ============================================================================
\echo
\echo === E7: outsider message INSERT denied ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.message_threads (id, owner_id, trainer_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"88888888-8888-8888-8888-888888888888"}';
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      insert into public.messages (thread_id, sender_id, body)
        values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','88888888-8888-8888-8888-888888888888','intruding');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'E7 FAIL: outsider inserted a message into a thread they are not part of';
    elsif v_sqlstate = '42501' and v_message like '%row-level security policy%' then
      raise notice 'E7 PASS | outsider message INSERT denied by RLS | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'E7 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

\echo
\echo === Category E complete (7 cases) ===
