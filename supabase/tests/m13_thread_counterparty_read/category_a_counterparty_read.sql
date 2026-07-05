-- ============================================================================
-- Category A — the thread counterparty profile read (M13)
-- ============================================================================
-- A1 trainer reads the profile of an owner they share a THREAD with — no
--    booking anywhere in the fixture: the freestanding-inquiry shape this
--    migration exists for
-- A2 a NO-thread trainer cannot read that same owner (a thread with someone
--    else leaks nothing)
-- A3 owner side unchanged: own-profile read + public trainer read
-- A4 anon unchanged WITH a thread present — owner hidden, trainer public,
--    and the directory's exact production read (nearby_trainers INVOKER
--    join + trainer-profile name): the M11 B6-style detonation trap. TO
--    authenticated means anon never evaluates a qual that reads
--    message_threads (where anon holds zero grants).
-- A5 no-recursion trap: thread INSERT under the live policy (the WITH CHECK
--    chain plus the DEFINER owner-role trigger) — 42P17 would fire here if
--    a profiles<->message_threads policy cycle were ever introduced
-- A6 no-recursion trap: own display_name UPDATE — the exact shape M11's
--    PUBLIC-era recursion partner killed (the B8 mirror)
-- A7 catalog pin: policyname / cmd=SELECT / roles={authenticated} / qual
--    reads message_threads — the grant-context lesson, pinned where it
--    can't silently drift
--
-- 7 cases. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

\echo
\echo === A1: thread-party trainer reads the owner name (no booking exists) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.message_threads (owner_id, trainer_id)
  values ('d1111111-1111-1111-1111-111111111111','d2222222-2222-2222-2222-222222222222');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"d2222222-2222-2222-2222-222222222222"}';
  do $$
  declare v_name text;
  begin
    select display_name into v_name from public.profiles
    where id = 'd1111111-1111-1111-1111-111111111111';
    if v_name = 'Owner Dee' then
      raise notice 'A1 PASS | trainer reads thread counterparty (%) — booking-free', v_name;
    else
      raise exception 'A1 FAIL: got %', coalesce(v_name, '<no row>');
    end if;
  end $$;
rollback;

\echo
\echo === A2: no-thread trainer cannot see the owner (no leak via another thread) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.message_threads (owner_id, trainer_id)
  values ('d1111111-1111-1111-1111-111111111111','d2222222-2222-2222-2222-222222222222');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"d3333333-3333-3333-3333-333333333333"}';
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from public.profiles
    where id = 'd1111111-1111-1111-1111-111111111111';
    if v_count = 0 then
      raise notice 'A2 PASS | stranger trainer sees 0 rows despite the owner''s other thread';
    else
      raise exception 'A2 FAIL: stranger sees % row(s)', v_count;
    end if;
  end $$;
rollback;

\echo
\echo === A3: owner side unchanged — own read + public trainer read ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.message_threads (owner_id, trainer_id)
  values ('d1111111-1111-1111-1111-111111111111','d2222222-2222-2222-2222-222222222222');
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_own text; v_trainer text;
  begin
    select display_name into v_own from public.profiles
    where id = 'd1111111-1111-1111-1111-111111111111';
    select display_name into v_trainer from public.profiles
    where id = 'd3333333-3333-3333-3333-333333333333';
    if v_own = 'Owner Dee' and v_trainer = 'Trainer Ess' then
      raise notice 'A3 PASS | own read (%) and public trainer read (%) unchanged', v_own, v_trainer;
    else
      raise exception 'A3 FAIL: own=% trainer=%', coalesce(v_own,'<none>'), coalesce(v_trainer,'<none>');
    end if;
  end $$;
rollback;

\echo
\echo === A4: anon unchanged with a thread present — the B6-style detonation trap ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  -- A thread EXISTS (the qual has something to find) — then anon reads
  -- profiles directly AND through nearby_trainers' INVOKER join: the exact
  -- production shapes that would die with "permission denied for table
  -- message_threads" if this policy were PUBLIC-scoped.
  insert into public.message_threads (owner_id, trainer_id)
  values ('d1111111-1111-1111-1111-111111111111','d2222222-2222-2222-2222-222222222222');
  set local role anon;
  set local request.jwt.claims to '';
  do $$
  declare v_owner int; v_trainer int; v_rpc int;
  begin
    select count(*) into v_owner from public.profiles
    where id = 'd1111111-1111-1111-1111-111111111111';
    select count(*) into v_trainer from public.profiles
    where id = 'd2222222-2222-2222-2222-222222222222';
    -- Seattle: only the M13 anchor is within 250 miles (Denver fixtures and
    -- the east-coast seed are ~1,100+ mi away).
    select count(*) into v_rpc from public.nearby_trainers(47.6062, -122.3321, 250);
    if v_owner = 0 and v_trainer = 1 and v_rpc = 1 then
      raise notice 'A4 PASS | anon: owner hidden even WITH a thread, trainer public, RPC join survives (rows=%)', v_rpc;
    else
      raise exception 'A4 FAIL: owner=% trainer=% rpc=%', v_owner, v_trainer, v_rpc;
    end if;
  end $$;
rollback;

\echo
\echo === A5: thread INSERT under the live policy — no policy recursion ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_id uuid;
  begin
    -- profiles SELECT now subqueries message_threads; the thread INSERT's
    -- WITH CHECK is pure column comparisons and its owner-role check is a
    -- DEFINER trigger (not a policy). A recursive policy graph raises
    -- 42P17 here — this case is the standing trap against introducing one.
    insert into public.message_threads (owner_id, trainer_id)
    values ('d1111111-1111-1111-1111-111111111111','d3333333-3333-3333-3333-333333333333')
    returning id into v_id;
    if v_id is not null then
      raise notice 'A5 PASS | thread INSERT under the live policy — chain terminates';
    else
      raise exception 'A5 FAIL: no row';
    end if;
  end $$;
rollback;

\echo
\echo === A6: own display_name UPDATE survives the policy (the B8 mirror) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_name text;
  begin
    update public.profiles set display_name = 'Owner Dee Renamed'
    where id = 'd1111111-1111-1111-1111-111111111111';
    select display_name into v_name from public.profiles
    where id = 'd1111111-1111-1111-1111-111111111111';
    if v_name = 'Owner Dee Renamed' then
      raise notice 'A6 PASS | authenticated profile UPDATE survives the thread policy';
    else
      raise exception 'A6 FAIL: got %', coalesce(v_name, '<no row>');
    end if;
  end $$;
rollback;

\echo
\echo === A7: catalog pin — SELECT, TO authenticated, qual reads message_threads ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_cmd text; v_roles text; v_qual text;
  begin
    select cmd, roles::text, qual into v_cmd, v_roles, v_qual
    from pg_policies
    where tablename = 'profiles'
      and policyname = 'Trainers read profiles of owners they share a thread with';
    if v_cmd is null then
      raise exception 'A7 FAIL: policy not found in catalog';
    elsif v_cmd = 'SELECT' and v_roles = '{authenticated}' and v_qual like '%message_threads%' then
      raise notice 'A7 PASS | cmd=% roles=% qual reads message_threads', v_cmd, v_roles;
    else
      raise exception 'A7 FAIL: cmd=% roles=% qual=%', v_cmd, v_roles, v_qual;
    end if;
  end $$;
rollback;

\echo
\echo === Category A complete (7 cases) ===
