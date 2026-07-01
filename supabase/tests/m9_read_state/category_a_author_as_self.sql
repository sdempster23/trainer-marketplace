-- ============================================================================
-- Category A — read-state author-as-self (M9, amended §5 trigger)
-- ============================================================================
-- The amended message_threads_validate_update() gains two clauses BELOW the M8
-- identity freeze: a participant may update ONLY their own last_read column.
-- An owner may write owner_last_read_at but NOT trainer_last_read_at, and vice
-- versa. This is the read-state analog of the M8 messages sender=auth.uid()
-- anti-forgery rule — it stops one participant marking the OTHER party's
-- messages as read. Trigger business rule -> SQLSTATE P0001 (NOT 42501, which
-- is reserved for grant/RLS privilege denial — see category C).
--
-- GATE ORDERING (the paired test the M9 design calls out):
--   A3 exercises the author-as-self layer IN ISOLATION (identity columns
--      untouched, only the wrong last_read column changes) -> author-as-self
--      rejects.
--   A6 exercises PRODUCTION ORDERING (identity + wrong last_read changed in one
--      UPDATE) -> the identity freeze, which sits ABOVE author-as-self, rejects
--      FIRST with 'owner_id is immutable'. Proves the freeze is the precondition
--      that makes OLD.owner_id/OLD.trainer_id trustworthy in the author checks.
--
-- 6 cases. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- A1: owner writes owner_last_read_at -> allowed; trainer_last_read_at untouched
-- ============================================================================
\echo
\echo === A1: owner marks own read-state ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_thread uuid; v_owner_read timestamptz; v_trainer_read timestamptz;
          v_sqlstate text; v_message text; v_raised boolean := false;
  begin
    insert into public.message_threads (owner_id, trainer_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
      returning id into v_thread;
    begin
      update public.message_threads set owner_last_read_at = now() where id = v_thread;
    exception when others then
      v_raised := true; get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_raised then
      raise exception 'A1 FAIL: owner marking own read-state rejected. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
    select owner_last_read_at, trainer_last_read_at into v_owner_read, v_trainer_read
      from public.message_threads where id = v_thread;
    if v_owner_read is not null and v_trainer_read is null then
      raise notice 'A1 PASS | owner_last_read_at set, trainer_last_read_at untouched (NULL)';
    else
      raise exception 'A1 FAIL: owner_read=% trainer_read=% (expected set / NULL)', v_owner_read, v_trainer_read;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A2: trainer writes trainer_last_read_at -> allowed; owner_last_read_at untouched
-- ============================================================================
\echo
\echo === A2: trainer marks own read-state ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_thread uuid; v_owner_read timestamptz; v_trainer_read timestamptz;
          v_sqlstate text; v_message text; v_raised boolean := false;
  begin
    insert into public.message_threads (owner_id, trainer_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
      returning id into v_thread;
    begin
      update public.message_threads set trainer_last_read_at = now() where id = v_thread;
    exception when others then
      v_raised := true; get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_raised then
      raise exception 'A2 FAIL: trainer marking own read-state rejected. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
    select owner_last_read_at, trainer_last_read_at into v_owner_read, v_trainer_read
      from public.message_threads where id = v_thread;
    if v_trainer_read is not null and v_owner_read is null then
      raise notice 'A2 PASS | trainer_last_read_at set, owner_last_read_at untouched (NULL)';
    else
      raise exception 'A2 FAIL: owner_read=% trainer_read=% (expected NULL / set)', v_owner_read, v_trainer_read;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A3: owner writes trainer_last_read_at -> REJECTED (author-as-self, isolated)
-- Identity columns untouched, so the identity freeze passes and the
-- author-as-self clause is the SOLE gate. P0001, not 42501.
-- ============================================================================
\echo
\echo === A3: owner cannot mark trainer read-state ===
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
      update public.message_threads set trainer_last_read_at = now() where id = v_thread;
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'A3 FAIL: owner marked TRAINER read-state (can mark someone else''s messages read)';
    elsif v_sqlstate = 'P0001' and v_message like '%owner may not modify trainer_last_read_at%' then
      raise notice 'A3 PASS | owner blocked from trainer_last_read_at | MSG=%', v_message;
    else
      raise exception 'A3 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A4: trainer writes owner_last_read_at -> REJECTED (author-as-self, isolated)
-- ============================================================================
\echo
\echo === A4: trainer cannot mark owner read-state ===
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
      update public.message_threads set owner_last_read_at = now() where id = v_thread;
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'A4 FAIL: trainer marked OWNER read-state';
    elsif v_sqlstate = 'P0001' and v_message like '%trainer may not modify owner_last_read_at%' then
      raise notice 'A4 PASS | trainer blocked from owner_last_read_at | MSG=%', v_message;
    else
      raise exception 'A4 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A5: per-participant independence — owner writing own column does NOT disturb
-- a value the trainer already wrote. JWT switches mid-transaction via
-- set_config (transaction-local), mirroring two real requests on one thread.
-- ============================================================================
\echo
\echo === A5: owner write preserves trainer's existing read-state ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_thread uuid; v_trainer_set timestamptz := now() - interval '30 minutes';
          v_trainer_after timestamptz; v_owner_after timestamptz;
  begin
    -- trainer_a creates the thread and marks their own read-state.
    insert into public.message_threads (owner_id, trainer_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
      returning id into v_thread;
    update public.message_threads set trainer_last_read_at = v_trainer_set where id = v_thread;

    -- Switch to owner_a; owner marks their own read-state.
    perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
    update public.message_threads set owner_last_read_at = now() where id = v_thread;

    select owner_last_read_at, trainer_last_read_at into v_owner_after, v_trainer_after
      from public.message_threads where id = v_thread;
    if v_owner_after is not null and v_trainer_after = v_trainer_set then
      raise notice 'A5 PASS | owner write set owner column; trainer column preserved unchanged';
    else
      raise exception 'A5 FAIL: owner_after=% trainer_after=% (expected set / % unchanged)',
        v_owner_after, v_trainer_after, v_trainer_set;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A6: GATE ORDERING — identity freeze fires BEFORE author-as-self.
-- Owner attempts owner_id reassignment AND a trainer_last_read_at change in one
-- UPDATE. Two clauses could reject it; the freeze sits above, so 'owner_id is
-- immutable' (P0001) is what surfaces — NOT the author-as-self message. This is
-- why the author checks can trust OLD.owner_id as the true participant identity.
-- ============================================================================
\echo
\echo === A6: identity freeze precedes author-as-self (production ordering) ===
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
      update public.message_threads
        set owner_id = '88888888-8888-8888-8888-888888888888',
            trainer_last_read_at = now()
        where id = v_thread;
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_no_exception then
      raise exception 'A6 FAIL: combined identity+read-state UPDATE allowed';
    elsif v_sqlstate = 'P0001' and v_message like '%owner_id is immutable%' then
      raise notice 'A6 PASS | identity freeze rejected first (ordering holds) | MSG=%', v_message;
    elsif v_sqlstate = 'P0001' and v_message like '%trainer_last_read_at%' then
      raise exception 'A6 FAIL: author-as-self fired before the freeze — ordering inverted (MSG=%)', v_message;
    else
      raise exception 'A6 FAIL: wrong exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;
  end $$;
rollback;

\echo
\echo === Category A complete (6 cases) ===
