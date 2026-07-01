-- ============================================================================
-- Category C — RLS still gates read-state writes (M9 added no hole)
-- ============================================================================
-- M9 reused the M8 UPDATE policy + grant unchanged. Confirm an OUTSIDER (a real
-- authenticated user who is not a participant) cannot mark a thread read. The
-- M8 UPDATE policy USING clause (auth.uid() in (owner_id, trainer_id)) filters
-- the row out entirely, so the UPDATE matches ZERO rows — silent, no error
-- (the participant filter, not the trigger, is the gate here). Distinct from
-- category A's P0001: RLS invisibility yields 0 rows, not an exception.
--
-- 1 case. Acceptance: PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- C1: outsider cannot mark a non-participant thread read (0 rows, value intact)
-- ============================================================================
\echo
\echo === C1: outsider mark-as-read is a silent no-op (RLS USING) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_thread uuid; v_rows int; v_owner_read timestamptz;
  begin
    -- owner_a creates the thread (they are a participant).
    insert into public.message_threads (owner_id, trainer_id)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
      returning id into v_thread;

    -- Switch to owner_c (8888) — a real owner, NOT a participant of this thread.
    perform set_config('request.jwt.claims', '{"sub":"88888888-8888-8888-8888-888888888888"}', true);
    update public.message_threads set owner_last_read_at = now() where id = v_thread;
    get diagnostics v_rows = row_count;

    -- Verify from a privileged context that nothing was written.
    perform set_config('request.jwt.claims', '', true);
    set local role 'postgres';
    select owner_last_read_at into v_owner_read from public.message_threads where id = v_thread;

    if v_rows = 0 and v_owner_read is null then
      raise notice 'C1 PASS | outsider UPDATE hit 0 rows (RLS USING); owner_last_read_at still NULL';
    else
      raise exception 'C1 FAIL: outsider affected % row(s); owner_last_read_at=% (expected 0 / NULL)', v_rows, v_owner_read;
    end if;
  end $$;
rollback;

\echo
\echo === Category C complete (1 case) ===
