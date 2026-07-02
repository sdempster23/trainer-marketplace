-- ============================================================================
-- Category C — NULL-location exclusion (as anon)
-- ============================================================================
-- t_noloc has a name, a specialty, and a trainers row — everything EXCEPT a
-- service_point. It must never appear in proximity results at any radius:
-- the exclusion is location-driven, not a side effect of missing card data.
-- A planet-sized radius (25,000 mi) makes the case airtight — nothing located
-- could be outside it.
--
-- 1 case. Acceptance: PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- C1: planet-radius search — all located trainers in, t_noloc out
-- ============================================================================
\echo
\echo === C1: NULL service_point excluded even at 25000 mi ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  set local role anon;
  do $$
  declare v_noloc boolean; v_located int;
  begin
    select exists (select 1 from public.nearby_trainers(36.1627, -86.7816, 25000) r
                   where r.id = 'a5555555-5555-5555-5555-555555555555') into v_noloc;
    select count(*) into v_located
      from public.nearby_trainers(36.1627, -86.7816, 25000) r
      where r.id in ('a1111111-1111-1111-1111-111111111111',
                     'a2222222-2222-2222-2222-222222222222',
                     'a3333333-3333-3333-3333-333333333333',
                     'a4444444-4444-4444-4444-444444444444');

    if not v_noloc and v_located = 4 then
      raise notice 'C1 PASS | t_noloc absent, all 4 located trainers present at 25000 mi';
    else
      raise exception 'C1 FAIL: noloc_present=% located=%', v_noloc, v_located;
    end if;
  end $$;
rollback;

\echo
\echo === Category C complete (1 case) ===
