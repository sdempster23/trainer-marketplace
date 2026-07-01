-- ============================================================================
-- Category B — updated_at interaction (M9 design item 4)
-- ============================================================================
-- updated_at is "last activity" for thread-list ordering; reading is NOT
-- activity and must not reorder the list. So a mark-as-read UPDATE sets only
-- *_last_read_at and leaves updated_at alone. The amended §5 trigger ALLOWS
-- updated_at to change but never REQUIRES it (denylist semantics), so this is
-- consistent — nothing forces updated_at forward on a read.
--
-- B2 is the composition regression: the M8 §7 AFTER-INSERT bump must still work
-- through the amended trigger. A message insert bumps updated_at AND must not
-- trip the new author-as-self clauses (the bump touches neither last_read col).
--
-- 2 cases. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- B1: marking read does NOT bump updated_at (reading is not activity)
-- ============================================================================
\echo
\echo === B1: mark-as-read leaves updated_at unchanged ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_thread uuid; v_before timestamptz; v_after timestamptz;
  begin
    -- Seed updated_at to a distinct past value so any bump would be visible.
    insert into public.message_threads (owner_id, trainer_id, updated_at)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              now() - interval '2 hours')
      returning id into v_thread;
    select updated_at into v_before from public.message_threads where id = v_thread;

    update public.message_threads set owner_last_read_at = now() where id = v_thread;

    select updated_at into v_after from public.message_threads where id = v_thread;
    if v_after = v_before then
      raise notice 'B1 PASS | updated_at unchanged by mark-as-read (thread order preserved)';
    else
      raise exception 'B1 FAIL: updated_at moved on read (before=% after=%) — reading reordered the list', v_before, v_after;
    end if;
  end $$;
rollback;

-- ============================================================================
-- B2: message insert still bumps updated_at through the amended trigger, and
-- the bump does NOT trip author-as-self (the §5↔§7 composition, M9-regressed)
-- ============================================================================
\echo
\echo === B2: message-insert bump still composes with amended §5 ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_thread uuid; v_before timestamptz; v_after timestamptz;
          v_sqlstate text; v_message text; v_raised boolean := false;
  begin
    insert into public.message_threads (owner_id, trainer_id, updated_at)
      values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
              now() - interval '2 hours')
      returning id into v_thread;
    select updated_at into v_before from public.message_threads where id = v_thread;

    begin
      insert into public.messages (thread_id, sender_id, body)
        values (v_thread, '11111111-1111-1111-1111-111111111111', 'Hello — does the bump still fire?');
    exception when others then
      v_raised := true; get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text;
    end;
    if v_raised then
      raise exception 'B2 FAIL: message insert rejected by amended trigger. SQLSTATE=% MSG=%', v_sqlstate, v_message;
    end if;

    select updated_at into v_after from public.message_threads where id = v_thread;
    if v_after > v_before then
      raise notice 'B2 PASS | message-insert bump advanced updated_at through amended §5 (before=% after=%)', v_before, v_after;
    else
      raise exception 'B2 FAIL: updated_at not bumped (before=% after=%)', v_before, v_after;
    end if;
  end $$;
rollback;

\echo
\echo === Category B complete (2 cases) ===
