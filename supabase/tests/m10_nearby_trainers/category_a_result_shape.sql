-- ============================================================================
-- Category A — result shape and distance correctness (as anon)
-- ============================================================================
-- The RPC is the directory's read API for logged-OUT browsers, so every case
-- here runs as anon. Covers: zero-distance identity, ascending ordering,
-- distance self-consistency against a direct ST_Distance computation,
-- real-world plausibility bands (the transposition trap), lat/lng read-back
-- orientation, and the card-field shape (display_name, specialties array).
--
-- Search point throughout: downtown Nashville (36.1627, -86.7816) — exactly
-- t_downtown's stored location, so its distance is exactly 0.
--
-- 5 cases. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- A1: zero distance at the search point + strictly ascending order
-- ============================================================================
\echo
\echo === A1: t_downtown at distance 0; results ordered nearest-first ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role anon;
  do $$
  declare
    v_first uuid; v_first_dist double precision; v_sorted boolean;
  begin
    select r.id, r.distance_meters into v_first, v_first_dist
      from public.nearby_trainers(36.1627, -86.7816, 250) r limit 1;

    -- distance_meters must be non-decreasing down the result set.
    select bool_and(ok) into v_sorted from (
      select r.distance_meters >= lag(r.distance_meters)
               over (order by ord) as ok
      from (select row_number() over () as ord, *
              from public.nearby_trainers(36.1627, -86.7816, 250)) r
    ) s where ok is not null;

    if v_first = 'a1111111-1111-1111-1111-111111111111'
       and v_first_dist = 0
       and v_sorted then
      raise notice 'A1 PASS | t_downtown first at exactly 0 m; ordering ascending';
    else
      raise exception 'A1 FAIL: first=% dist=% sorted=%', v_first, v_first_dist, v_sorted;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A2: RPC distance equals a direct ST_Distance computation, row by row
-- Same formula, same inputs, computed independently by the test over the
-- public-read trainers table (anon can SELECT service_point). Tolerance 1 mm
-- (identical float pipelines should be bit-equal; the millimeter absorbs any
-- future PostGIS build drift without weakening the assertion).
-- ============================================================================
\echo
\echo === A2: distance_meters matches direct ST_Distance per row ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role anon;
  do $$
  declare v_bad int;
  begin
    select count(*) into v_bad
    from public.nearby_trainers(36.1627, -86.7816, 250) r
    join public.trainers t on t.id = r.id
    where abs(
      r.distance_meters
      - extensions.st_distance(
          t.service_point,
          extensions.st_setsrid(extensions.st_makepoint(-86.7816, 36.1627), 4326)::extensions.geography)
    ) > 0.001;

    if v_bad = 0 then
      raise notice 'A2 PASS | every returned distance matches the direct computation (<= 1 mm)';
    else
      raise exception 'A2 FAIL: % row(s) disagree with direct ST_Distance', v_bad;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A3: real-world plausibility bands (the transposition trap)
-- A2 is self-consistent — if the RPC and the test BOTH transposed lat/lng the
-- same way, A2 would still pass. These independent real-world bands
-- (East Nashville ~2 mi, Franklin ~17 mi, Memphis ~196 mi) fail loudly on any
-- axis-order mistake.
-- ============================================================================
\echo
\echo === A3: distances land in known real-world bands ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role anon;
  do $$
  declare v_east double precision; v_franklin double precision; v_memphis double precision;
  begin
    select max(r.distance_meters) filter (where r.id = 'a2222222-2222-2222-2222-222222222222'),
           max(r.distance_meters) filter (where r.id = 'a3333333-3333-3333-3333-333333333333'),
           max(r.distance_meters) filter (where r.id = 'a4444444-4444-4444-4444-444444444444')
      into v_east, v_franklin, v_memphis
      from public.nearby_trainers(36.1627, -86.7816, 250) r;

    if v_east / 1609.344 between 1.0 and 3.0
       and v_franklin / 1609.344 between 14.0 and 20.0
       and v_memphis / 1609.344 between 180.0 and 215.0 then
      raise notice 'A3 PASS | east=% mi, franklin=% mi, memphis=% mi — all in band',
        round((v_east/1609.344)::numeric,2), round((v_franklin/1609.344)::numeric,1),
        round((v_memphis/1609.344)::numeric,0);
    else
      raise exception 'A3 FAIL: east=% franklin=% memphis=% meters', v_east, v_franklin, v_memphis;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A4: lat/lng read-back — exact round-trip and correct axis orientation
-- The seeded EWKT decimals parse to the same float8 the RPC returns, so exact
-- equality is safe. The band check catches a transposed ST_X/ST_Y (a swapped
-- pair would put "lat" near -86).
-- ============================================================================
\echo
\echo === A4: lat/lng round-trip exactly and are not transposed ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role anon;
  do $$
  declare v_lat double precision; v_lng double precision;
  begin
    select r.lat, r.lng into v_lat, v_lng
      from public.nearby_trainers(36.1627, -86.7816, 250) r
      where r.id = 'a1111111-1111-1111-1111-111111111111';

    if v_lat = 36.1627 and v_lng = -86.7816
       and v_lat between 30 and 40 and v_lng between -95 and -80 then
      raise notice 'A4 PASS | lat=% lng=% — exact round-trip, correct orientation', v_lat, v_lng;
    else
      raise exception 'A4 FAIL: lat=% lng=% (expected 36.1627 / -86.7816)', v_lat, v_lng;
    end if;
  end $$;
rollback;

-- ============================================================================
-- A5: card-field shape — display_name, specialties array semantics
--   * t_downtown: name present, specialties = {puppy, basic_obedience} — ENUM
--     DECLARATION order, not alphabetical. Enum order is the project-wide
--     canonical order: the app's SPECIALTIES const derives from the enum in
--     declaration order, so the onboarding form already displays in it;
--     alphabetical here would give directory cards a different order than the
--     form. order by a.specialty (enum-ordinal) is the deliberate choice.
--   * t_franklin: zero assignments → specialties = {} (empty array, NOT null)
--   * t_memphis: NULL display_name but the row is returned (the profiles join
--     carries the name; it must not become an implicit listable filter)
-- ============================================================================
\echo
\echo === A5: display_name and specialties shapes ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role anon;
  do $$
  declare
    v_dt_name text; v_dt_spec public.trainer_specialty[];
    v_fr_spec public.trainer_specialty[];
    v_me_found boolean; v_me_name text;
  begin
    select r.display_name, r.specialties into v_dt_name, v_dt_spec
      from public.nearby_trainers(36.1627, -86.7816, 250) r
      where r.id = 'a1111111-1111-1111-1111-111111111111';
    select r.specialties into v_fr_spec
      from public.nearby_trainers(36.1627, -86.7816, 250) r
      where r.id = 'a3333333-3333-3333-3333-333333333333';
    select true, r.display_name into v_me_found, v_me_name
      from public.nearby_trainers(36.1627, -86.7816, 250) r
      where r.id = 'a4444444-4444-4444-4444-444444444444';

    if v_dt_name = 'Dana Downtown'
       and v_dt_spec = array['puppy','basic_obedience']::public.trainer_specialty[]  -- enum order
       and v_fr_spec = '{}'::public.trainer_specialty[]  -- empty, not NULL
       and v_fr_spec is not null
       and v_me_found and v_me_name is null then
      raise notice 'A5 PASS | name + enum-ordered specialties; {} for no assignments; NULL-name row survives';
    else
      raise exception 'A5 FAIL: dt_name=% dt_spec=% fr_spec=% me_found=% me_name=%',
        v_dt_name, v_dt_spec, v_fr_spec, v_me_found, v_me_name;
    end if;
  end $$;
rollback;

\echo
\echo === Category A complete (5 cases) ===
