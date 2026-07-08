-- ============================================================================
-- M14 service_role deliberate grants — catalog-matrix verification
-- ============================================================================
-- Asserts the declared service_role table-DML state from
-- 20260708150000_service_role_deliberate_grants.sql across the ENTIRE public
-- schema. Static catalog metadata (the J/M7 pattern): no rows, no JWT, no
-- fixture, no transaction — pure has_table_privilege().
--
-- THE CONTRACT (also stated in _README.md so it survives): assert what we
-- DECLARE — the four DML verbs, both presence and absence — and stay SILENT
-- on the platform-default housekeeping verbs (TRUNCATE/REFERENCES/TRIGGER/
-- MAINTAIN). Pinning those would re-couple the suite to the platform's
-- default ACL, the exact drift class M14 cures (v2.90 -> v2.109 changed it
-- once already; it can change again without any migration of ours moving).
--
-- CATALOG-DRIVEN, both directions:
--   - The table list comes from pg_class, not from this file — a FUTURE
--     table that forgets to declare its service_role position lands in the
--     matrix with an expected set of {} and fails loud the moment it holds
--     (or platform-gains) any DML.
--   - Every DECLARED table must exist — a rename or drop that orphans the
--     declaration fails too. The integrity check runs FIRST, so the matrix
--     never runs against a declaration the schema contradicts.
--
-- Mechanics (review-hardened, 2026-07-08):
--   - relkind IN ('r','p','f'): plain, PARTITIONED, and foreign tables all
--     take GRANTs — a partitioned Phase-8 ledger must not slip the matrix
--     (partition children are relkind 'r' and covered either way). Views /
--     matviews are excluded deliberately: SELECT-only surfaces, and
--     extension-owned ones often GRANT TO PUBLIC — pinning them couples the
--     suite to ACLs that are not ours. Revisit when the first one appears.
--   - has_table_privilege takes c.oid, never 'public.'||relname — a future
--     quoted/mixed-case identifier must be CHECKED, not detonate the DO
--     block with a case-folded "relation does not exist".
--   - ONE declared-set source (the `declared` jsonb) feeds both checks —
--     a declaration added to the matrix cannot miss the integrity guard.
--   - The per-table `ok` line prints only when that table's four verbs all
--     matched — a triager scanning `ok` lines is never told a drifted
--     table is fine.
--
-- 2 checks, one DO block (they share the declaration):
--   M14-2  declaration integrity: every declared table exists in pg_class
--          (runs first — validates the declaration before the matrix uses it)
--   M14-1  matrix: every public table x {SELECT,INSERT,UPDATE,DELETE} for
--          service_role equals the declared set exactly
--          (bookings {S,U}; trainer_stripe_accounts {S,I,U}; all else {})
--
-- Acceptance: both PASS.
-- ============================================================================

\set QUIET on

\echo
\echo === M14: service_role declared-set verification (integrity + matrix) ===
do $$
declare
  -- THE single source of truth for this suite. Adding a declared table?
  -- Add it here, once — both checks derive from this object.
  declared constant jsonb := jsonb_build_object(
    'bookings',                jsonb_build_array('SELECT','UPDATE'),
    'trainer_stripe_accounts', jsonb_build_array('SELECT','INSERT','UPDATE')
  );
  r record;
  p text;
  expected boolean;
  actual boolean;
  tbl_fails int;
  fails int := 0;
  n_tables int := 0;
  missing text;
begin
  -- --------------------------------------------------------------------------
  -- M14-2: declaration integrity (first — the matrix trusts this)
  -- --------------------------------------------------------------------------
  select string_agg(k, ', ') into missing
  from jsonb_object_keys(declared) as k
  where not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p','f') and c.relname = k
  );

  if missing is not null then
    raise exception 'M14-2 FAIL | declared table(s) missing from catalog: %', missing;
  end if;
  raise notice 'M14-2 PASS | all declared tables exist';

  -- --------------------------------------------------------------------------
  -- M14-1: the matrix — all public tables x 4 DML verbs vs the declared set
  -- --------------------------------------------------------------------------
  for r in
    select c.oid as reloid,
           c.relname as tbl,
           array(select jsonb_array_elements_text(declared -> c.relname)) as granted
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p','f')
    order by c.relname
  loop
    n_tables := n_tables + 1;
    tbl_fails := 0;
    foreach p in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      expected := p = any(r.granted);
      actual := has_table_privilege('service_role', r.reloid, p);
      if actual <> expected then
        raise warning 'M14-1 MISMATCH | service_role | % | % | expected=% actual=%',
          r.tbl, p, expected, actual;
        tbl_fails := tbl_fails + 1;
      end if;
    end loop;
    if tbl_fails = 0 then
      raise notice 'M14-1 ok | % = {%}', r.tbl, array_to_string(r.granted, ', ');
    else
      fails := fails + tbl_fails;
    end if;
  end loop;

  if fails = 0 then
    raise notice 'M14-1 PASS | % public tables x 4 DML verbs match the declared set exactly', n_tables;
  else
    raise exception 'M14-1 FAIL | % mismatch(es) against the declared set (see warnings)', fails;
  end if;
end $$;

\echo
\echo === M14 suite complete (2 checks) ===
