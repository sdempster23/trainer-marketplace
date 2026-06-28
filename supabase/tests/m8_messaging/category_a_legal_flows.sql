-- ============================================================================
-- Category A — legal messaging flows
-- ============================================================================
-- Happy paths: thread creation, both parties sending messages, the updated_at
-- bump, one-thread-per-pair uniqueness, and the optional booking association.
-- Trainer-initiated creation is exercised here too, but the DEFINER contract
-- that makes it work is pinned explicitly in category C.
--
-- 6 cases. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- A1: owner creates a freestanding thread (no booking) -> succeeds
-- ============================================================================
\echo
\echo === A1: owner creates a thread ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_count int; v_sqlstate text; v_message text; v_raised boolean := false;
  begin
    begin
      insert into public.message_threads (owner_id, trainer_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
    exception when others then
      v_raised := true; get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_raised then
      raise exception 'A1 FAIL: owner thread create rejected. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
    select count(*) into v_count from public.message_threads
      where owner_id = '11111111-1111-1111-1111-111111111111'
        and trainer_id = '22222222-2222-2222-2222-222222222222';
    if v_count = 1 then
      raise notice 'A1 PASS | owner created thread | count=%', v_count;
    else
      raise exception 'A1 FAIL: thread not present, count=%', v_count;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A2: owner sends a message in the thread -> succeeds
-- ============================================================================
\echo
\echo === A2: owner sends a message ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_thread uuid; v_count int;
  begin
    insert into public.message_threads (owner_id, trainer_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
      returning id into v_thread;
    insert into public.messages (thread_id, sender_id, body)
      values (v_thread, '11111111-1111-1111-1111-111111111111', 'Hello from the owner');
    select count(*) into v_count from public.messages where thread_id = v_thread;
    if v_count = 1 then
      raise notice 'A2 PASS | owner sent message | count=%', v_count;
    else
      raise exception 'A2 FAIL: message count=%', v_count;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A3: trainer sends a message in the thread -> succeeds (both parties post)
-- Thread is trainer-initiated here (valid via the DEFINER gate, pinned in C).
-- ============================================================================
\echo
\echo === A3: trainer sends a message ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_thread uuid; v_count int;
  begin
    insert into public.message_threads (owner_id, trainer_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
      returning id into v_thread;
    insert into public.messages (thread_id, sender_id, body)
      values (v_thread, '22222222-2222-2222-2222-222222222222', 'Hello from the trainer');
    select count(*) into v_count from public.messages
      where thread_id = v_thread and sender_id = '22222222-2222-2222-2222-222222222222';
    if v_count = 1 then
      raise notice 'A3 PASS | trainer sent message | count=%', v_count;
    else
      raise exception 'A3 FAIL: message count=%', v_count;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A4: a new message bumps the parent thread's updated_at
-- Seed the thread with updated_at one hour in the past; the bump sets it to
-- now() (transaction start). Within one transaction now() is constant, so the
-- seeded value (now() - 1h) is strictly less than the bumped value (now()) —
-- deterministic, zero skew.
-- ============================================================================
\echo
\echo === A4: message insert bumps thread updated_at ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_thread uuid; v_before timestamptz; v_after timestamptz;
  begin
    insert into public.message_threads (owner_id, trainer_id, created_at, updated_at)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              now() - interval '1 hour', now() - interval '1 hour')
      returning id, updated_at into v_thread, v_before;
    insert into public.messages (thread_id, sender_id, body)
      values (v_thread, '11111111-1111-1111-1111-111111111111', 'bump');
    select updated_at into v_after from public.message_threads where id = v_thread;
    if v_after > v_before then
      raise notice 'A4 PASS | updated_at advanced by message insert | before=% after=%', v_before, v_after;
    else
      raise exception 'A4 FAIL: updated_at not advanced (before=% after=%)', v_before, v_after;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A5: one canonical thread per (owner, trainer) pair -> UNIQUE violation
-- ============================================================================
\echo
\echo === A5: duplicate thread for a pair is rejected ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_sqlstate text; v_message text; v_constraint text; v_no_exception boolean := false;
  begin
    insert into public.message_threads (owner_id, trainer_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
    begin
      insert into public.message_threads (owner_id, trainer_id)
        values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'A5 FAIL: duplicate thread for the same pair was allowed';
    elsif v_sqlstate = '23505' then
      raise notice 'A5 PASS | one thread per pair | SQLSTATE=% | CONSTRAINT=%', v_sqlstate, v_constraint;
    else
      raise exception 'A5 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A6: optional booking association -> thread created with booking_id set
-- ============================================================================
\echo
\echo === A6: thread linked to a booking (optional association) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_booking uuid;
  begin
    insert into public.message_threads (owner_id, trainer_id, booking_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
      returning booking_id into v_booking;
    if v_booking = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' then
      raise notice 'A6 PASS | thread linked to booking | booking_id=%', v_booking;
    else
      raise exception 'A6 FAIL: booking_id not set, got %', v_booking;
    end if;
  end $$;
rollback;

\echo
\echo === Category A complete (6 cases) ===
