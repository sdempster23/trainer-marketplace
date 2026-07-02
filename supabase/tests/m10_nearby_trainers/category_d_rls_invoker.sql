-- ============================================================================
-- Category D — RLS gating through the RPC (the SECURITY INVOKER proof)
-- ============================================================================
-- The M8 integrity-vs-access convention says this function is ACCESS, so it
-- runs under the caller's RLS. These cases prove that empirically and pin it
-- against regression:
--
--   D1 — paired positive control: t_east is visible to anon through the RPC,
--        then postgres soft-deletes its profile INSIDE the transaction, and
--        t_east vanishes from anon's next call. This is also the live
--        DEFINER-regression trap: the function owner (postgres) OWNS trainers
--        and profiles, so a DEFINER flip would make the body bypass RLS
--        entirely and the soft-deleted trainer would LEAK — D1 fails.
--   D2 — catalog pins: prosecdef = false (the direct DEFINER trap),
--        provolatile = 's' (STABLE — PostgREST GET exposure depends on it),
--        and search_path pinned empty (the DEFINER-hardening posture even
--        under INVOKER; a dropped pin is a silent convention break).
--   D3 — role parity: authenticated sees exactly what anon sees (public-read
--        policies are role-neutral; the directory renders identically before
--        and after login).
--
-- 3 cases. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- D1: soft-delete gates the RPC for anon (positive control, then the gate)
-- ============================================================================
\echo
\echo === D1: anon sees t_east, postgres soft-deletes it, anon no longer does ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare
    v_before boolean; v_after boolean;
    v_count_before int; v_count_after int;
    v_row_still_exists boolean;
  begin
    -- Positive control, as anon.
    set local role anon;
    select exists (select 1 from public.nearby_trainers(36.1627, -86.7816, 5) r
                   where r.id = 'a2222222-2222-2222-2222-222222222222') into v_before;
    select count(*) into v_count_before from public.nearby_trainers(36.1627, -86.7816, 5);

    -- The gate: postgres soft-deletes t_east's profile.
    set local role 'postgres';
    update public.profiles set deleted_at = now()
      where id = 'a2222222-2222-2222-2222-222222222222';
    -- The trainers row itself still exists (postgres, as owner, bypasses RLS).
    select exists (select 1 from public.trainers
                   where id = 'a2222222-2222-2222-2222-222222222222') into v_row_still_exists;

    -- Re-query as anon.
    set local role anon;
    select exists (select 1 from public.nearby_trainers(36.1627, -86.7816, 5) r
                   where r.id = 'a2222222-2222-2222-2222-222222222222') into v_after;
    select count(*) into v_count_after from public.nearby_trainers(36.1627, -86.7816, 5);

    if v_before and v_row_still_exists and not v_after
       and v_count_after = v_count_before - 1 then
      raise notice 'D1 PASS | t_east visible -> soft-deleted -> gone (% -> % rows); table row intact underneath',
        v_count_before, v_count_after;
    else
      raise exception 'D1 FAIL: before=% after=% row_exists=% counts %->%',
        v_before, v_after, v_row_still_exists, v_count_before, v_count_after;
    end if;
  end $$;
rollback;

-- ============================================================================
-- D2: catalog pins — INVOKER, STABLE, empty search_path
-- ============================================================================
\echo
\echo === D2: prosecdef=false, provolatile=s, search_path pinned empty ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare
    v_secdef boolean; v_vol "char"; v_sp text;
  begin
    select p.prosecdef, p.provolatile,
           (select cfg from unnest(p.proconfig) cfg where cfg like 'search_path=%')
      into v_secdef, v_vol, v_sp
      from pg_proc p
      where p.oid = 'public.nearby_trainers(double precision, double precision, double precision)'::regprocedure;

    if v_secdef = false and v_vol = 's'
       and v_sp in ('search_path=', 'search_path=""') then
      raise notice 'D2 PASS | SECURITY INVOKER, STABLE, search_path pinned empty';
    else
      raise exception 'D2 FAIL: secdef=% volatile=% search_path=% (DEFINER flip or convention break)',
        v_secdef, v_vol, v_sp;
    end if;
  end $$;
rollback;

-- ============================================================================
-- D3: authenticated parity — same rows, same order as anon
-- ============================================================================
\echo
\echo === D3: authenticated result set identical to anon ===
begin;
  set local role 'postgres';
  set local request.jwt.claims to '';
  do $$
  declare v_anon uuid[]; v_auth uuid[];
  begin
    set local role anon;
    select coalesce(array_agg(r.id order by r.distance_meters), '{}') into v_anon
      from public.nearby_trainers(36.1627, -86.7816, 250) r;

    set local role 'postgres';
    set local role authenticated;
    perform set_config('request.jwt.claims',
                       '{"sub":"a1111111-1111-1111-1111-111111111111"}', true);
    select coalesce(array_agg(r.id order by r.distance_meters), '{}') into v_auth
      from public.nearby_trainers(36.1627, -86.7816, 250) r;

    if v_anon = v_auth and array_length(v_anon, 1) = 4 then
      raise notice 'D3 PASS | anon and authenticated see the same 4 trainers in the same order';
    else
      raise exception 'D3 FAIL: anon=% auth=%', v_anon, v_auth;
    end if;
  end $$;
rollback;

\echo
\echo === Category D complete (3 cases) ===
