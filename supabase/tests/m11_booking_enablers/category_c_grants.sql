-- ============================================================================
-- Category C — the grant layer (§3 + §4's re-issue), M7/M10-E style
-- ============================================================================
-- C1 _bookings_ends_at EXECUTE = {authenticated, service_role} explicitly,
--    anon NO, no PUBLIC aclitem (the M10 drift remedy made deliberate)
-- C2 nearby_trainers (5-arg) EXECUTE = {anon, authenticated, service_role},
--    no PUBLIC aclitem (the §4 re-issue took)
-- C3 the 3-arg signature is GONE — DROP+CREATE left no overload behind
--
-- C4 the new profiles_validate_update trigger function is swept bare
--
-- 4 checks. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

\echo
\echo === C1: _bookings_ends_at matrix (authenticated + service_role, no anon/PUBLIC) ===
do $$
declare
  v_sig constant text := 'public._bookings_ends_at(timestamp with time zone, integer)';
  v_public boolean;
begin
  select exists (
    select 1 from unnest((select proacl from pg_proc where oid = v_sig::regprocedure)) a
    where a::text like '=X/%'
  ) into v_public;
  if not has_function_privilege('anon', v_sig, 'execute')
     and has_function_privilege('authenticated', v_sig, 'execute')
     and has_function_privilege('service_role', v_sig, 'execute')
     and not v_public then
    raise notice 'C1 PASS | authenticated + service_role hold EXECUTE; anon/PUBLIC do not';
  else
    raise exception 'C1 FAIL: anon=% auth=% service=% public=%',
      has_function_privilege('anon', v_sig, 'execute'),
      has_function_privilege('authenticated', v_sig, 'execute'),
      has_function_privilege('service_role', v_sig, 'execute'), v_public;
  end if;
end $$;

\echo
\echo === C2: nearby_trainers 5-arg matrix (anon + authenticated + service_role, no PUBLIC) ===
do $$
declare
  v_sig constant text := 'public.nearby_trainers(double precision, double precision, double precision, integer, integer)';
  v_public boolean;
begin
  select exists (
    select 1 from unnest((select proacl from pg_proc where oid = v_sig::regprocedure)) a
    where a::text like '=X/%'
  ) into v_public;
  if has_function_privilege('anon', v_sig, 'execute')
     and has_function_privilege('authenticated', v_sig, 'execute')
     and has_function_privilege('service_role', v_sig, 'execute')
     and not v_public then
    raise notice 'C2 PASS | re-issued grants took on the new signature';
  else
    raise exception 'C2 FAIL: anon=% auth=% service=% public=%',
      has_function_privilege('anon', v_sig, 'execute'),
      has_function_privilege('authenticated', v_sig, 'execute'),
      has_function_privilege('service_role', v_sig, 'execute'), v_public;
  end if;
end $$;

\echo
\echo === C3: the 3-arg signature is gone (no overload left behind) ===
do $$
declare v_old regprocedure; v_count int;
begin
  v_old := to_regprocedure('public.nearby_trainers(double precision, double precision, double precision)');
  select count(*) into v_count from pg_proc where proname = 'nearby_trainers';
  if v_old is null and v_count = 1 then
    raise notice 'C3 PASS | exactly one nearby_trainers; the old signature resolves to nothing';
  else
    raise exception 'C3 FAIL: old_sig=% count=%', v_old, v_count;
  end if;
end $$;

\echo
\echo === C4: profiles_validate_update is swept bare (M10 trigger-fn convention) ===
do $$
declare v_public boolean;
begin
  select exists (
    select 1 from unnest((select proacl from pg_proc
                          where oid = 'public.profiles_validate_update()'::regprocedure)) a
    where a::text like '=X/%'
  ) into v_public;
  if not has_function_privilege('anon', 'public.profiles_validate_update()', 'execute')
     and not has_function_privilege('authenticated', 'public.profiles_validate_update()', 'execute')
     and not v_public then
    raise notice 'C4 PASS | trigger function holds no API-role/PUBLIC EXECUTE';
  else
    raise exception 'C4 FAIL: anon=% auth=% public=%',
      has_function_privilege('anon', 'public.profiles_validate_update()', 'execute'),
      has_function_privilege('authenticated', 'public.profiles_validate_update()', 'execute'),
      v_public;
  end if;
end $$;

\echo
\echo === Category C complete (4 checks) ===
