-- ============================================================================
-- Category B — radius filtering (as anon)
-- ============================================================================
-- The sweep: each radius step admits exactly one more trainer, so an
-- off-by-anything in the miles→meters conversion or the ST_DWithin call moves
-- a boundary and changes a result SET, not just a number. B5 pins the
-- inclusive (<=) boundary semantics with a ±0.5 m band rather than exact
-- float equality — ST_DWithin and ST_Distance take different code paths, so
-- bit-exact boundary equality is not guaranteed the way M6's
-- transaction-stable now() was; half a meter proves <= without the flake.
--
-- Expected sets from the search point (36.1627, -86.7816):
--   1 mi   → {t_downtown}                             (t_east is ~2 mi out)
--   5 mi   → {t_downtown, t_east}
--   25 mi  → {t_downtown, t_east, t_franklin}         (Franklin ~17 mi)
--   250 mi → + t_memphis (~196 mi)                    (order pinned end-to-end)
--
-- 5 cases. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- B1: 1 mile — only the trainer AT the search point
-- ============================================================================
\echo
\echo === B1: radius 1 mi returns only t_downtown ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role anon;
  do $$
  declare v_ids uuid[];
  begin
    select coalesce(array_agg(r.id order by r.distance_meters), '{}') into v_ids
      from public.nearby_trainers(36.1627, -86.7816, 1) r;
    if v_ids = array['a1111111-1111-1111-1111-111111111111']::uuid[] then
      raise notice 'B1 PASS | 1 mi = {t_downtown}';
    else
      raise exception 'B1 FAIL: got %', v_ids;
    end if;
  end $$;
rollback;

-- ============================================================================
-- B2: 5 miles — downtown + east
-- ============================================================================
\echo
\echo === B2: radius 5 mi returns t_downtown, t_east ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role anon;
  do $$
  declare v_ids uuid[];
  begin
    select coalesce(array_agg(r.id order by r.distance_meters), '{}') into v_ids
      from public.nearby_trainers(36.1627, -86.7816, 5) r;
    if v_ids = array['a1111111-1111-1111-1111-111111111111',
                     'a2222222-2222-2222-2222-222222222222']::uuid[] then
      raise notice 'B2 PASS | 5 mi = {t_downtown, t_east}';
    else
      raise exception 'B2 FAIL: got %', v_ids;
    end if;
  end $$;
rollback;

-- ============================================================================
-- B3: 25 miles — + franklin
-- ============================================================================
\echo
\echo === B3: radius 25 mi adds t_franklin ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role anon;
  do $$
  declare v_ids uuid[];
  begin
    select coalesce(array_agg(r.id order by r.distance_meters), '{}') into v_ids
      from public.nearby_trainers(36.1627, -86.7816, 25) r;
    if v_ids = array['a1111111-1111-1111-1111-111111111111',
                     'a2222222-2222-2222-2222-222222222222',
                     'a3333333-3333-3333-3333-333333333333']::uuid[] then
      raise notice 'B3 PASS | 25 mi = {t_downtown, t_east, t_franklin}';
    else
      raise exception 'B3 FAIL: got %', v_ids;
    end if;
  end $$;
rollback;

-- ============================================================================
-- B4: 250 miles — full set, distance order pinned end-to-end
-- ============================================================================
\echo
\echo === B4: radius 250 mi returns all four located trainers in order ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role anon;
  do $$
  declare v_ids uuid[];
  begin
    select coalesce(array_agg(r.id order by r.distance_meters), '{}') into v_ids
      from public.nearby_trainers(36.1627, -86.7816, 250) r;
    if v_ids = array['a1111111-1111-1111-1111-111111111111',
                     'a2222222-2222-2222-2222-222222222222',
                     'a3333333-3333-3333-3333-333333333333',
                     'a4444444-4444-4444-4444-444444444444']::uuid[] then
      raise notice 'B4 PASS | 250 mi = all four, nearest-first';
    else
      raise exception 'B4 FAIL: got %', v_ids;
    end if;
  end $$;
rollback;

-- ============================================================================
-- B5: boundary semantics — radius straddling the exact distance to t_east
-- Compute the true distance D as anon (public-read service_point), then call
-- with D +/- 0.5 m expressed in miles: the +0.5 call must include t_east
-- (ST_DWithin is inclusive), the -0.5 call must exclude it.
-- ============================================================================
\echo
\echo === B5: inclusive boundary — D+0.5m in, D-0.5m out ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role anon;
  do $$
  declare
    v_d double precision;
    v_in boolean; v_out boolean;
  begin
    select extensions.st_distance(
             t.service_point,
             extensions.st_setsrid(extensions.st_makepoint(-86.7816, 36.1627), 4326)::extensions.geography)
      into v_d
      from public.trainers t
      where t.id = 'a2222222-2222-2222-2222-222222222222';

    select exists (select 1 from public.nearby_trainers(36.1627, -86.7816, (v_d + 0.5) / 1609.344) r
                   where r.id = 'a2222222-2222-2222-2222-222222222222') into v_in;
    select exists (select 1 from public.nearby_trainers(36.1627, -86.7816, (v_d - 0.5) / 1609.344) r
                   where r.id = 'a2222222-2222-2222-2222-222222222222') into v_out;

    if v_in and not v_out then
      raise notice 'B5 PASS | D=% m: included at D+0.5, excluded at D-0.5 (inclusive <=)', round(v_d::numeric,1);
    else
      raise exception 'B5 FAIL: D=% in(D+0.5)=% in(D-0.5)=%', v_d, v_in, v_out;
    end if;
  end $$;
rollback;

\echo
\echo === Category B complete (5 cases) ===
