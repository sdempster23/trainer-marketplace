-- ============================================================================
-- Category B — sender authenticity (§6, decision 4b)
-- ============================================================================
-- The §6 trigger forces sender_id = auth.uid(): you may only author a message
-- as yourself. This is the anti-forgery gate. The rejected weaker design was
-- "sender ∈ thread participants", which would let one participant post a
-- message attributed to the OTHER participant (B1 is exactly that case).
--
-- 2 cases. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- B1: participant forges a message as the OTHER participant -> rejected
-- owner_a (the caller) inserts a message with sender_id = trainer_a. Under the
-- rejected "sender ∈ participants" design this would PASS (trainer_a is a
-- participant). Under sender_id = auth.uid() it is rejected: the conversation
-- record cannot be forged by either party.
-- ============================================================================
\echo
\echo === B1: forge as the other participant (sender=trainer, caller=owner) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_thread uuid; v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    insert into public.message_threads (owner_id, trainer_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
      returning id into v_thread;
    begin
      insert into public.messages (thread_id, sender_id, body)
        values (v_thread, '22222222-2222-2222-2222-222222222222', 'forged as the trainer');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'B1 FAIL: forgery allowed (owner posted a message as the trainer)';
    elsif v_sqlstate = 'P0001' and v_message like '%sender_id must be the authenticated user%' then
      raise notice 'B1 PASS | forge-as-other-participant blocked | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'B1 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- B2: participant forges a message as an outsider -> rejected
-- owner_a inserts with sender_id = owner_c (a non-participant). Also rejected
-- by sender_id = auth.uid(). Completes the forgery surface.
-- ============================================================================
\echo
\echo === B2: forge as an outsider (sender=owner_c, caller=owner) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_thread uuid; v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    insert into public.message_threads (owner_id, trainer_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
      returning id into v_thread;
    begin
      insert into public.messages (thread_id, sender_id, body)
        values (v_thread, '88888888-8888-8888-8888-888888888888', 'forged as an outsider');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'B2 FAIL: forgery allowed (owner posted a message as owner_c)';
    elsif v_sqlstate = 'P0001' and v_message like '%sender_id must be the authenticated user%' then
      raise notice 'B2 PASS | forge-as-outsider blocked | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'B2 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

\echo
\echo === Category B complete (2 cases) ===
