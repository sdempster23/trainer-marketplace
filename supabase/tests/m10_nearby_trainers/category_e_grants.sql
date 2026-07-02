-- ============================================================================
-- Category E — the grant layer (M6 category J / M7 style: catalog assertions
-- isolated from RLS, plus rolled-back probes)
-- ============================================================================
-- Asserts the §2-§4 grant state from 20260701160000_nearby_trainers.sql:
--
--   E1 — nearby_trainers exact EXECUTE matrix (anon YES, authenticated YES,
--        service_role YES, and NO PUBLIC aclitem — the anon/authenticated
--        access must come from the explicit §2 grant, not the pseudo-role)
--   E2 — the §4 sweep: all 8 trigger functions hold NO API-role EXECUTE and
--        no PUBLIC aclitem; _bookings_ends_at is policy-matched
--        (authenticated YES, anon NO, no PUBLIC)
--   E3 — §3 default-privileges capstone: a new function created as postgres
--        auto-grants EXECUTE to nobody (PUBLIC/anon/authenticated), probe
--        rolled back — the M7-3 pattern for functions
--   E4 — over-revoke guard: service_role retains EXECUTE on _bookings_ends_at
--        and nearby_trainers (the M7-2 pattern; a REVOKE typo naming
--        service_role would break server-side bookings writes silently)
--   E5 — trigger-firing survival: an authenticated UPDATE to their own
--        profile fires update_updated_at_column — a function that now has
--        ZERO API-role EXECUTE grants — and succeeds. Proves in-suite what
--        the full M6-M9 regression proves at scale: trigger firing checks the
--        trigger creator, never the DML caller. (Contrast: GENERATED-column
--        evaluation DOES check the caller, which is exactly why
--        _bookings_ends_at kept its authenticated grant in §4.)
--
-- 5 checks. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- E1: nearby_trainers exact EXECUTE matrix + no PUBLIC grant
-- ============================================================================
\echo
\echo === E1: nearby_trainers EXECUTE = {anon, authenticated, service_role}, no PUBLIC ===
do $$
declare
  v_sig constant text := 'public.nearby_trainers(double precision, double precision, double precision)';
  v_public_grant boolean;
begin
  select exists (
    select 1 from unnest((select proacl from pg_proc where oid = v_sig::regprocedure)) a
    where a::text like '=X/%'
  ) into v_public_grant;

  if has_function_privilege('anon', v_sig, 'execute')
     and has_function_privilege('authenticated', v_sig, 'execute')
     and has_function_privilege('service_role', v_sig, 'execute')
     and not v_public_grant then
    raise notice 'E1 PASS | anon + authenticated + service_role hold EXECUTE explicitly; PUBLIC absent';
  else
    raise exception 'E1 FAIL: anon=% auth=% service=% public_aclitem=%',
      has_function_privilege('anon', v_sig, 'execute'),
      has_function_privilege('authenticated', v_sig, 'execute'),
      has_function_privilege('service_role', v_sig, 'execute'),
      v_public_grant;
  end if;
end $$;

-- ============================================================================
-- E2: the §4 sweep — trigger functions hold nothing; _bookings_ends_at
--     policy-matched
-- ============================================================================
\echo
\echo === E2: swept functions — 8 trigger fns bare; _bookings_ends_at authenticated-only ===
do $$
declare
  fn text;
  trigger_fns text[] := array[
    'public.update_updated_at_column()',
    'public.handle_new_user()',
    'public.bookings_validate_insert()',
    'public.bookings_validate_update()',
    'public.message_threads_validate_insert()',
    'public.message_threads_validate_update()',
    'public.messages_validate_insert()',
    'public.messages_bump_thread()'];
  v_ends_at constant text := 'public._bookings_ends_at(timestamp with time zone, integer)';
  fails int := 0;
begin
  foreach fn in array trigger_fns loop
    if has_function_privilege('anon', fn, 'execute')
       or has_function_privilege('authenticated', fn, 'execute')
       or exists (select 1 from unnest((select proacl from pg_proc where oid = fn::regprocedure)) a
                  where a::text like '=X/%') then
      raise warning 'E2 LEFTOVER | % still executable by an API role or PUBLIC', fn;
      fails := fails + 1;
    end if;
  end loop;

  if has_function_privilege('anon', v_ends_at, 'execute')
     or not has_function_privilege('authenticated', v_ends_at, 'execute')
     or exists (select 1 from unnest((select proacl from pg_proc where oid = v_ends_at::regprocedure)) a
                where a::text like '=X/%') then
    raise warning 'E2 MISMATCH | _bookings_ends_at not policy-matched (want: authenticated only)';
    fails := fails + 1;
  end if;

  if fails = 0 then
    raise notice 'E2 PASS | 8 trigger functions swept bare; _bookings_ends_at = authenticated only';
  else
    raise exception 'E2 FAIL | % function(s) off-matrix (see warnings)', fails;
  end if;
end $$;

-- ============================================================================
-- E3: default-privileges capstone — new functions auto-grant nothing
-- (Pre-M10, the platform default ACL + built-in PUBLIC default would have
-- handed this probe EXECUTE for anon, authenticated, AND PUBLIC.)
-- ============================================================================
\echo
\echo === E3: new function auto-grants no EXECUTE to PUBLIC/anon/authenticated ===
begin;
  create function public._m10_defpriv_probe() returns int
    language sql immutable as 'select 1';
  do $$
  declare v_public boolean;
  begin
    select exists (
      select 1 from unnest((select proacl from pg_proc
                            where oid = 'public._m10_defpriv_probe()'::regprocedure)) a
      where a::text like '=X/%'
    ) into v_public;

    if not has_function_privilege('anon', 'public._m10_defpriv_probe()', 'execute')
       and not has_function_privilege('authenticated', 'public._m10_defpriv_probe()', 'execute')
       and not v_public then
      raise notice 'E3 PASS | probe function born with no PUBLIC/anon/authenticated EXECUTE (default privileges hardened)';
    else
      raise exception 'E3 FAIL: anon=% auth=% public=% — section 3 ALTER DEFAULT PRIVILEGES did not take',
        has_function_privilege('anon', 'public._m10_defpriv_probe()', 'execute'),
        has_function_privilege('authenticated', 'public._m10_defpriv_probe()', 'execute'),
        v_public;
    end if;
  end $$;
rollback;  -- drops the probe; the default-privilege change itself is schema-level and persists

-- ============================================================================
-- E4: over-revoke guard — service_role kept EXECUTE where the platform
--     default granted it
-- ============================================================================
\echo
\echo === E4: service_role retains EXECUTE (REVOKE scope was correct) ===
do $$
begin
  if has_function_privilege('service_role',
       'public._bookings_ends_at(timestamp with time zone, integer)', 'execute')
     and has_function_privilege('service_role',
       'public.nearby_trainers(double precision, double precision, double precision)', 'execute') then
    raise notice 'E4 PASS | service_role EXECUTE intact on _bookings_ends_at and nearby_trainers';
  else
    raise exception 'E4 FAIL: service_role lost EXECUTE — over-revoke (server-side bookings writes would break)';
  end if;
end $$;

-- ============================================================================
-- E5: trigger-firing survival — the sweep does not break DML-fired triggers
-- ============================================================================
\echo
\echo === E5: authenticated UPDATE fires update_updated_at_column despite zero grants ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"a1111111-1111-1111-1111-111111111111"}';
  do $$
  declare v_before timestamptz; v_after timestamptz;
  begin
    select updated_at into v_before from public.profiles
      where id = 'a1111111-1111-1111-1111-111111111111';

    update public.profiles set display_name = 'Dana D. Downtown'
      where id = 'a1111111-1111-1111-1111-111111111111';

    select updated_at into v_after from public.profiles
      where id = 'a1111111-1111-1111-1111-111111111111';

    if v_after > v_before then
      raise notice 'E5 PASS | UPDATE succeeded and updated_at bumped — trigger fired with no API-role EXECUTE';
    else
      raise exception 'E5 FAIL: updated_at % -> % (trigger did not fire or UPDATE rejected)', v_before, v_after;
    end if;
  end $$;
rollback;

\echo
\echo === Category E complete (5 checks) ===
