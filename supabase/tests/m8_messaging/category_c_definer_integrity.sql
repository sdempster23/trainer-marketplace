-- ============================================================================
-- Category C — owner-role DEFINER integrity gate (§4, decision 4c)
-- ============================================================================
-- The architecturally load-bearing category. message_threads_validate_insert
-- is SECURITY DEFINER so its "owner_id is role=owner" check sees TRUE GLOBAL
-- STATE, not the caller's RLS-filtered view. This is the M8 mirror of M6
-- category I's SECURITY INVOKER probe — proving the OPPOSITE resolution:
-- DEFINER bypasses caller RLS where INVOKER would fail.
--
-- C1 pins the contract: a trainer can create a thread even though the trainer
--    CANNOT see the owner's profile under their own RLS. This succeeds ONLY
--    because the gate is DEFINER. (F8/H8-style contract: the test names the
--    security-context decision and traps its regression.)
-- C2 proves DEFINER did not WEAKEN the integrity check — a non-owner owner_id
--    is still rejected. DEFINER freed the check from caller-RLS; it did not
--    make it permissive.
--
-- 2 cases. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- C1: trainer-initiated thread succeeds via DEFINER (the global-state proof)
-- Run as trainer_a. First demonstrate the INVOKER-would-fail precondition: the
-- owner's profile is invisible to the trainer under their own RLS. Then the
-- thread INSERT succeeds anyway — because the owner-role trigger is DEFINER.
--
-- CONTRACT: this INSERT would FAIL with "owner_id is not a profile with
-- role=owner" if the function regressed from DEFINER to INVOKER (the trigger's
-- EXISTS would then run under the trainer's RLS, see zero owners, and wrongly
-- reject). The FAIL branch traps that regression explicitly.
-- ============================================================================
\echo
\echo === C1: trainer-initiated thread created via DEFINER (owner invisible to trainer) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_owner_visible int; v_thread uuid; v_count int; v_sqlstate text; v_message text;
  begin
    -- Precondition: under trainer_a's RLS the owner's profile is NOT visible.
    select count(*) into v_owner_visible from public.profiles
      where id = '11111111-1111-1111-1111-111111111111' and role = 'owner';
    if v_owner_visible <> 0 then
      raise exception 'C1 PREMISE BROKEN: trainer can see owner profile (count=%) — the INVOKER-would-fail premise no longer holds', v_owner_visible;
    end if;

    -- The INSERT: succeeds only under DEFINER (global state).
    begin
      insert into public.message_threads (owner_id, trainer_id)
        values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
        returning id into v_thread;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
      if v_message like '%is not a profile with role=owner%' then
        raise exception 'C1 FAIL (DEFINER REGRESSION): trainer-initiated thread rejected with "%". The owner-role function has regressed from DEFINER to INVOKER — it now sees only caller-visible profiles, where the owner is hidden.', v_message;
      else
        raise exception 'C1 FAIL: unexpected exception. SQLSTATE=% MSG=%', v_sqlstate, v_message;
      end if;
    end;

    select count(*) into v_count from public.message_threads where id = v_thread;
    if v_count = 1 then
      raise notice 'C1 PASS | DEFINER saw global state: owner invisible to trainer (count=%), thread created anyway', v_owner_visible;
    else
      raise exception 'C1 FAIL: thread not created, count=%', v_count;
    end if;
  end $$;
rollback;

-- ============================================================================
-- C2: non-owner owner_id rejected -> DEFINER did not weaken integrity
-- Run as trainer_a, creating a thread with owner_id = trainer_b (a trainer,
-- NOT an owner) and trainer_id = trainer_a. RLS WITH CHECK would PASS
-- (auth.uid()=trainer_a is the trainer_id), so the DEFINER trigger is the sole
-- gate — and it still rejects, because trainer_b is not role=owner. 23503 with
-- empty constraint_name proves the trigger fired (not a real FK: trainer_b's
-- profile row exists).
-- ============================================================================
\echo
\echo === C2: non-owner owner_id rejected by DEFINER (integrity intact) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_sqlstate text; v_message text; v_constraint text; v_no_exception boolean := false;
  begin
    begin
      insert into public.message_threads (owner_id, trainer_id)
        values ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222');
      v_no_exception := true;
    exception when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_constraint = constraint_name;
    end;
    if v_no_exception then
      raise exception 'C2 FAIL: non-owner owner_id accepted (DEFINER weakened the integrity check)';
    elsif v_sqlstate = '23503' and v_constraint = '' and v_message like '%is not a profile with role=owner%' then
      raise notice 'C2 PASS | DEFINER rejects non-owner owner_id | SQLSTATE=% | MSG=%', v_sqlstate, v_message;
    else
      raise exception 'C2 FAIL: wrong exception. SQLSTATE=% CONSTRAINT=% MSG=%', v_sqlstate, v_constraint, v_message;
    end if;
  end $$;
rollback;

\echo
\echo === Category C complete (2 cases) ===
