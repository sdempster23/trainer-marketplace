-- ============================================================================
-- Category F — messages are an immutable permanent record
-- ============================================================================
-- messages has no UPDATE or DELETE policy AND no UPDATE/DELETE grant to
-- authenticated. A participant attempting either is stopped at the grant layer
-- (42501 permission denied) — before RLS is even consulted. This is the M7
-- grant-layer convention doing real work: the absent grant is the gate.
--
-- 2 cases. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- F1: participant attempts to UPDATE a message -> denied (no UPDATE grant)
-- ============================================================================
\echo
\echo === F1: message UPDATE denied ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.message_threads (id, owner_id, trainer_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into public.messages (thread_id, sender_id, body)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','original');
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      update public.messages set body = 'edited' where thread_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'F1 FAIL: message UPDATE succeeded — messages are supposed to be immutable';
    elsif v_sqlstate = '42501' and v_message like '%permission denied%' then
      raise notice 'F1 PASS | message UPDATE denied at grant layer | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'F1 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- F2: participant attempts to DELETE a message -> denied (no DELETE grant)
-- ============================================================================
\echo
\echo === F2: message DELETE denied ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.message_threads (id, owner_id, trainer_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into public.messages (thread_id, sender_id, body)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','permanent');
  do $$
  declare v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    begin
      delete from public.messages where thread_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'F2 FAIL: message DELETE succeeded — messages are supposed to be immutable';
    elsif v_sqlstate = '42501' and v_message like '%permission denied%' then
      raise notice 'F2 PASS | message DELETE denied at grant layer | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'F2 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

\echo
\echo === Category F complete (2 cases) ===
