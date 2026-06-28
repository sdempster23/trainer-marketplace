-- ============================================================================
-- Category D — thread identity immutability (§5, decision 4d)
-- ============================================================================
-- The §5 BEFORE UPDATE trigger freezes owner_id/trainer_id/booking_id/
-- created_at; only updated_at may change (the bump). Without this, a
-- participant could reassign owner_id (RLS WITH CHECK only keeps the mutator a
-- participant) and expose the entire message history to a new party.
--
-- D1 uses trainer_a as the mutator precisely because trainer_a STAYS a
-- participant after the reassignment — so RLS WITH CHECK would pass and §5 is
-- the SOLE gate (it fires BEFORE WITH CHECK, raising P0001).
--
-- 5 cases. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- D1: owner_id is immutable (the thread-hijack exploit, blocked)
-- ============================================================================
\echo
\echo === D1: owner_id reassignment rejected ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_thread uuid; v_sqlstate text; v_message text; v_no_exception boolean := false;
  begin
    insert into public.message_threads (owner_id, trainer_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
      returning id into v_thread;
    begin
      update public.message_threads set owner_id = '88888888-8888-8888-8888-888888888888' where id = v_thread;
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'D1 FAIL: owner_id reassignment allowed (thread hijack / message-history exposure)';
    elsif v_sqlstate = 'P0001' and v_message like '%owner_id is immutable%' then
      raise notice 'D1 PASS | owner_id immutable | MSG=%', v_message;
    else
      raise exception 'D1 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- D2: trainer_id is immutable
-- ============================================================================
\echo
\echo === D2: trainer_id reassignment rejected ===
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
      update public.message_threads set trainer_id = '33333333-3333-3333-3333-333333333333' where id = v_thread;
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'D2 FAIL: trainer_id reassignment allowed';
    elsif v_sqlstate = 'P0001' and v_message like '%trainer_id is immutable%' then
      raise notice 'D2 PASS | trainer_id immutable | MSG=%', v_message;
    else
      raise exception 'D2 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- D3: booking_id is immutable
-- Thread starts with booking_id NULL; attempting to set it (to any value)
-- raises in §5 BEFORE the FK is even checked.
-- ============================================================================
\echo
\echo === D3: booking_id change rejected ===
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
      update public.message_threads set booking_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where id = v_thread;
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'D3 FAIL: booking_id change allowed';
    elsif v_sqlstate = 'P0001' and v_message like '%booking_id is immutable%' then
      raise notice 'D3 PASS | booking_id immutable | MSG=%', v_message;
    else
      raise exception 'D3 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- D4: created_at is immutable
-- ============================================================================
\echo
\echo === D4: created_at change rejected ===
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
      update public.message_threads set created_at = now() - interval '10 days' where id = v_thread;
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'D4 FAIL: created_at change allowed';
    elsif v_sqlstate = 'P0001' and v_message like '%created_at is immutable%' then
      raise notice 'D4 PASS | created_at immutable | MSG=%', v_message;
    else
      raise exception 'D4 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- D5: updated_at-only UPDATE is ALLOWED (the §5↔§7 composition)
-- Confirms §5 freezes identity columns but permits updated_at — so the bump
-- path is not blocked by its own immutability guard.
-- ============================================================================
\echo
\echo === D5: updated_at-only update allowed ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_thread uuid; v_sqlstate text; v_message text; v_raised boolean := false;
  begin
    insert into public.message_threads (owner_id, trainer_id, updated_at)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              now() - interval '1 hour')
      returning id into v_thread;
    begin
      update public.message_threads set updated_at = now() where id = v_thread;
    exception when others then
      v_raised := true; get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_raised then
      raise exception 'D5 FAIL: updated_at-only update was rejected (would deadlock the bump). SQLSTATE=% MSG=%', v_sqlstate, v_message;
    else
      raise notice 'D5 PASS | updated_at-only update allowed (bump composes with immutability guard)';
    end if;
  end $$;
rollback;

\echo
\echo === Category D complete (5 cases) ===
