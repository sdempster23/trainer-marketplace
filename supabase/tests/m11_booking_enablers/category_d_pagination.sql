-- ============================================================================
-- Category D — nearby_trainers pagination (§4), all AS ANON
-- ============================================================================
-- Search point: downtown Denver (39.7392, -104.9903) — the fixture's three
-- Denver trainers are the ONLY trainers within 250 mi (every seed trainer is
-- ~1000 mi east), so the expected sets are exact.
--
-- D1 legacy 3-arg call works via the defaults (the app's call site unchanged)
-- D2 max_results=2 -> the two nearest, order preserved
-- D3 result_offset=2 -> skips two, returns the third
-- D4 clamps: max_results=0 -> clamped to 1 row; negative offset -> treated 0
--
-- 4 cases. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

\echo
\echo === D1: three-argument call still works (defaults) ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role anon;
  do $$
  declare v_ids uuid[];
  begin
    select coalesce(array_agg(r.id order by r.distance_meters), '{}') into v_ids
    from public.nearby_trainers(39.7392, -104.9903, 250) r;
    if v_ids = array['b6666666-6666-6666-6666-666666666666',
                     'b7777777-7777-7777-7777-777777777777',
                     'b8888888-8888-8888-8888-888888888888']::uuid[] then
      raise notice 'D1 PASS | defaults: all three Denver trainers, nearest-first';
    else
      raise exception 'D1 FAIL: got %', v_ids;
    end if;
  end $$;
rollback;

\echo
\echo === D2: max_results=2 returns the two nearest ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role anon;
  do $$
  declare v_ids uuid[];
  begin
    select coalesce(array_agg(r.id order by r.distance_meters), '{}') into v_ids
    from public.nearby_trainers(39.7392, -104.9903, 250, 2) r;
    if v_ids = array['b6666666-6666-6666-6666-666666666666',
                     'b7777777-7777-7777-7777-777777777777']::uuid[] then
      raise notice 'D2 PASS | limit honored, order preserved';
    else
      raise exception 'D2 FAIL: got %', v_ids;
    end if;
  end $$;
rollback;

\echo
\echo === D3: result_offset=2 skips the two nearest ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role anon;
  do $$
  declare v_ids uuid[];
  begin
    select coalesce(array_agg(r.id order by r.distance_meters), '{}') into v_ids
    from public.nearby_trainers(39.7392, -104.9903, 250, 50, 2) r;
    if v_ids = array['b8888888-8888-8888-8888-888888888888']::uuid[] then
      raise notice 'D3 PASS | offset skips in distance order';
    else
      raise exception 'D3 FAIL: got %', v_ids;
    end if;
  end $$;
rollback;

\echo
\echo === D4: clamps — max_results=0 yields 1 row; negative offset treated as 0 ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role anon;
  do $$
  declare v_zero uuid[]; v_neg uuid[];
  begin
    select coalesce(array_agg(r.id order by r.distance_meters), '{}') into v_zero
    from public.nearby_trainers(39.7392, -104.9903, 250, 0) r;
    select coalesce(array_agg(r.id order by r.distance_meters), '{}') into v_neg
    from public.nearby_trainers(39.7392, -104.9903, 250, 50, -5) r;
    if v_zero = array['b6666666-6666-6666-6666-666666666666']::uuid[]
       and array_length(v_neg, 1) = 3 then
      raise notice 'D4 PASS | max_results=0 clamps to 1; negative offset clamps to 0';
    else
      raise exception 'D4 FAIL: zero=% neg=%', v_zero, v_neg;
    end if;
  end $$;
rollback;

\echo
\echo === Category D complete (4 cases) ===
