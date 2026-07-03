-- ============================================================================
-- M12 trainer_busy_ranges — verification
-- ============================================================================
-- M12-1 the DEFINER contract: a non-party authenticated caller sees ZERO
--       bookings directly (parties-only RLS intact) but gets the ranges via
--       the function — live positive proof of the bypass
-- M12-2 status filter: exactly PENDING + CONFIRMED appear (CANCELLED and
--       COMPLETED seeded alongside, absent) — the EXCLUDE-list parity
-- M12-3 time bound: past-ended absent; an IN-PROGRESS session present (its
--       tail still blocks)
-- M12-4 exact ranges, ordered — function output equals the table rows
-- M12-5 catalog pins: prosecdef = TRUE (the DELIBERATE inversion of the
--       M10-D2 INVOKER pin — this is the codebase's one access-side DEFINER,
--       and a flip to INVOKER would break it silently for non-parties),
--       STABLE, pinned empty search_path
-- M12-6 grant matrix, CATALOG-ONLY: authenticated + service_role hold
--       EXECUTE, anon does not, no PUBLIC aclitem. Denial is asserted via
--       has_function_privilege and NEVER by a live call: the local stack
--       (CLI v2.90 / PG 17.6) SIGSEGVs on any permission-denied function
--       CALL (environment finding, M12 journal entry) — and the grant
--       STATE is the thing under test anyway; the granted path is
--       live-proven by M12-1.
--
-- 6 checks. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

\echo
\echo === M12-1: parties-only RLS intact; the function bypasses it (ranges only) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                               starts_at, duration_minutes, price_cents, stripe_payment_intent_id)
  values ('cc111111-1111-4111-8111-111111111111','cc222222-2222-4222-8222-222222222222',
          'cc333333-3333-4333-8333-333333333333','cc555555-5555-4555-8555-555555555555',
          now() + interval '24 hours', 60, 5000, null);
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"cc999999-9999-4999-8999-999999999999"}';
  do $$
  declare v_direct int; v_ranges int;
  begin
    select count(*) into v_direct from public.bookings
      where trainer_id = 'cc222222-2222-4222-8222-222222222222';
    select count(*) into v_ranges
      from public.trainer_busy_ranges('cc222222-2222-4222-8222-222222222222');
    if v_direct = 0 and v_ranges = 1 then
      raise notice 'M12-1 PASS | direct read 0 rows (RLS intact), function 1 range (DEFINER answer)';
    else
      raise exception 'M12-1 FAIL: direct=% ranges=%', v_direct, v_ranges;
    end if;
  end $$;
rollback;

\echo
\echo === M12-2: exactly PENDING + CONFIRMED block (EXCLUDE-list parity) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  -- Non-PENDING entry states need the M6 trigger-disable convention (the
  -- insert gate requires PENDING entry; the update gate restricts paths).
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id, starts_at,
                               duration_minutes, price_cents, stripe_payment_intent_id,
                               status, cancelled_at, cancelled_by, completed_at)
  values
   ('cc111111-1111-4111-8111-111111111111','cc222222-2222-4222-8222-222222222222',
    'cc333333-3333-4333-8333-333333333333','cc555555-5555-4555-8555-555555555555',
    now() + interval '24 hours', 60, 5000, null, 'PENDING', null, null, null),
   ('cc111111-1111-4111-8111-111111111111','cc222222-2222-4222-8222-222222222222',
    'cc333333-3333-4333-8333-333333333333','cc555555-5555-4555-8555-555555555555',
    now() + interval '26 hours', 60, 5000, null, 'CONFIRMED', null, null, null),
   ('cc111111-1111-4111-8111-111111111111','cc222222-2222-4222-8222-222222222222',
    'cc333333-3333-4333-8333-333333333333','cc555555-5555-4555-8555-555555555555',
    now() + interval '28 hours', 60, 5000, null, 'CANCELLED', now(), 'owner', null),
   ('cc111111-1111-4111-8111-111111111111','cc222222-2222-4222-8222-222222222222',
    'cc333333-3333-4333-8333-333333333333','cc555555-5555-4555-8555-555555555555',
    now() + interval '30 hours', 60, 5000, null, 'COMPLETED', null, null, now());
  alter table public.bookings enable trigger trg_bookings_validate_insert;

  set local role authenticated;
  set local request.jwt.claims to '{"sub":"cc999999-9999-4999-8999-999999999999"}';
  do $$
  declare v_ranges int; v_statuses int;
  begin
    select count(*) into v_ranges
      from public.trainer_busy_ranges('cc222222-2222-4222-8222-222222222222');
    if v_ranges = 2 then
      raise notice 'M12-2 PASS | 4 rows seeded across all statuses; exactly 2 (PENDING+CONFIRMED) block';
    else
      raise exception 'M12-2 FAIL: expected 2 blocking ranges, got %', v_ranges;
    end if;
  end $$;
rollback;

\echo
\echo === M12-3: time bound — past-ended absent, in-progress present ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  alter table public.bookings disable trigger trg_bookings_validate_insert;
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id, starts_at,
                               duration_minutes, price_cents, stripe_payment_intent_id, status)
  values
   -- past-ended: yesterday
   ('cc111111-1111-4111-8111-111111111111','cc222222-2222-4222-8222-222222222222',
    'cc333333-3333-4333-8333-333333333333','cc555555-5555-4555-8555-555555555555',
    now() - interval '24 hours', 60, 5000, null, 'CONFIRMED'),
   -- in-progress: started 30 min ago, 60-min session -> ends in 30 min
   ('cc111111-1111-4111-8111-111111111111','cc222222-2222-4222-8222-222222222222',
    'cc333333-3333-4333-8333-333333333333','cc555555-5555-4555-8555-555555555555',
    now() - interval '30 minutes', 60, 5000, null, 'CONFIRMED');
  alter table public.bookings enable trigger trg_bookings_validate_insert;

  set local role authenticated;
  set local request.jwt.claims to '{"sub":"cc999999-9999-4999-8999-999999999999"}';
  do $$
  declare v_ranges int; v_past int;
  begin
    select count(*) into v_ranges
      from public.trainer_busy_ranges('cc222222-2222-4222-8222-222222222222');
    select count(*) into v_past
      from public.trainer_busy_ranges('cc222222-2222-4222-8222-222222222222')
      where ends_at <= now();
    if v_ranges = 1 and v_past = 0 then
      raise notice 'M12-3 PASS | past-ended absent; in-progress present (its tail still blocks)';
    else
      raise exception 'M12-3 FAIL: ranges=% past=%', v_ranges, v_past;
    end if;
  end $$;
rollback;

\echo
\echo === M12-4: ranges match the table rows exactly, ordered ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  insert into public.bookings (owner_id, trainer_id, dog_id, service_id,
                               starts_at, duration_minutes, price_cents, stripe_payment_intent_id)
  values
   ('cc111111-1111-4111-8111-111111111111','cc222222-2222-4222-8222-222222222222',
    'cc333333-3333-4333-8333-333333333333','cc555555-5555-4555-8555-555555555555',
    now() + interval '48 hours', 60, 5000, null),
   ('cc111111-1111-4111-8111-111111111111','cc222222-2222-4222-8222-222222222222',
    'cc333333-3333-4333-8333-333333333333','cc555555-5555-4555-8555-555555555555',
    now() + interval '24 hours', 60, 5000, null);
  do $$
  declare v_expected timestamptz[]; v_got timestamptz[];
  begin
    -- expected, from the table as postgres (starts then ends, ordered)
    select array_agg(x order by x) into v_expected from (
      select starts_at as x from public.bookings where trainer_id='cc222222-2222-4222-8222-222222222222'
      union all
      select ends_at from public.bookings where trainer_id='cc222222-2222-4222-8222-222222222222') s;

    set local role authenticated;
    perform set_config('request.jwt.claims', '{"sub":"cc999999-9999-4999-8999-999999999999"}', true);
    select array_agg(x order by x) into v_got from (
      select starts_at as x from public.trainer_busy_ranges('cc222222-2222-4222-8222-222222222222')
      union all
      select ends_at from public.trainer_busy_ranges('cc222222-2222-4222-8222-222222222222')) s;

    if v_got = v_expected and array_length(v_got, 1) = 4 then
      raise notice 'M12-4 PASS | function ranges equal the table rows (4 boundary instants)';
    else
      raise exception 'M12-4 FAIL: expected=% got=%', v_expected, v_got;
    end if;
  end $$;
rollback;

\echo
\echo === M12-5: catalog pins — DEFINER (deliberate), STABLE, pinned search_path ===
do $$
declare v_secdef boolean; v_vol "char"; v_sp text;
begin
  select p.prosecdef, p.provolatile,
         (select cfg from unnest(p.proconfig) cfg where cfg like 'search_path=%')
    into v_secdef, v_vol, v_sp
    from pg_proc p where p.oid = 'public.trainer_busy_ranges(uuid)'::regprocedure;
  -- prosecdef = TRUE is the point: the inversion of M10-D2's INVOKER pin.
  -- A flip to INVOKER would silently return zero ranges to every non-party.
  if v_secdef = true and v_vol = 's' and v_sp in ('search_path=', 'search_path=""') then
    raise notice 'M12-5 PASS | SECURITY DEFINER (deliberate), STABLE, search_path pinned empty';
  else
    raise exception 'M12-5 FAIL: secdef=% volatile=% search_path=%', v_secdef, v_vol, v_sp;
  end if;
end $$;

\echo
\echo === M12-6: grant matrix (catalog-only — see header) ===
do $$
declare
  v_sig constant text := 'public.trainer_busy_ranges(uuid)';
  v_public boolean;
begin
  select exists (
    select 1 from unnest((select proacl from pg_proc where oid = v_sig::regprocedure)) a
    where a::text like '=X/%'
  ) into v_public;
  if has_function_privilege('authenticated', v_sig, 'execute')
     and has_function_privilege('service_role', v_sig, 'execute')
     and not has_function_privilege('anon', v_sig, 'execute')
     and not v_public then
    raise notice 'M12-6 PASS | authenticated + service_role only; anon and PUBLIC hold nothing';
  else
    raise exception 'M12-6 FAIL: anon=% auth=% service=% public=%',
      has_function_privilege('anon', v_sig, 'execute'),
      has_function_privilege('authenticated', v_sig, 'execute'),
      has_function_privilege('service_role', v_sig, 'execute'), v_public;
  end if;
end $$;

\echo
\echo === M12 suite complete (6 checks) ===
