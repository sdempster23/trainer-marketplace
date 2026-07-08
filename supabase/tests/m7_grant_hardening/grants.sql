-- ============================================================================
-- M7 grant-hardening — grant-layer verification
-- ============================================================================
-- Asserts the post-sweep grant state from 20260627143000_grant_hardening.sql.
-- The grant layer is static catalog metadata, so (like M6 category J) there
-- are no rows, no JWT, no fixture — pure has_table_privilege() assertions.
--
-- Three checks:
--   M7-1  exact grant matrix — each of the 9 swept tables, anon + authenticated
--         hold EXACTLY the policy-matched set (all 7 privileges asserted, so
--         both a missing grant and a leftover excess fail)
--   M7-2  service_role declared-set pin (M14): trainer_stripe_accounts =
--         SELECT,INSERT,UPDATE exactly; dogs = no DML at all
--   M7-3  default-privileges capstone — a new table auto-grants nothing to
--         anon/authenticated (proves §2 ALTER DEFAULT PRIVILEGES took)
--
-- Acceptance: all 3 checks PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- M7-1: exact grant matrix across the 9 swept tables
-- For each (table, role) the expected privilege set is declared inline; the
-- check iterates all 7 table privileges and asserts has_table_privilege equals
-- (priv = ANY expected). One PASS notice per table; raises on first mismatch
-- with the offending table/role/privilege.
-- ============================================================================
\echo
\echo === M7-1: exact grant matrix (9 tables, anon + authenticated) ===
do $$
declare
  r record;
  priv text;
  expected boolean;
  actual boolean;
  fails int := 0;
  all_privs text[] := array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
begin
  for r in
    select * from (values
      ('profiles',                        'anon',          array['SELECT']),
      ('profiles',                        'authenticated', array['SELECT','UPDATE']),
      ('dogs',                            'anon',          array[]::text[]),
      ('dogs',                            'authenticated', array['SELECT','INSERT','UPDATE']),
      ('trainers',                        'anon',          array['SELECT']),
      ('trainers',                        'authenticated', array['SELECT','INSERT','UPDATE']),
      ('trainer_certifications',          'anon',          array['SELECT']),
      ('trainer_certifications',          'authenticated', array['SELECT','INSERT','UPDATE','DELETE']),
      ('trainer_specialty_assignments',   'anon',          array['SELECT']),
      ('trainer_specialty_assignments',   'authenticated', array['SELECT','INSERT','DELETE']),
      ('trainer_services',                'anon',          array['SELECT']),
      ('trainer_services',                'authenticated', array['SELECT','INSERT','UPDATE']),
      ('trainer_availability',            'anon',          array['SELECT']),
      ('trainer_availability',            'authenticated', array['SELECT','INSERT','UPDATE','DELETE']),
      ('trainer_availability_exceptions', 'anon',          array['SELECT']),
      ('trainer_availability_exceptions', 'authenticated', array['SELECT','INSERT','UPDATE','DELETE']),
      ('trainer_stripe_accounts',         'anon',          array[]::text[]),
      ('trainer_stripe_accounts',         'authenticated', array['SELECT'])
    ) as t(tbl, role_name, granted)
  loop
    foreach priv in array all_privs loop
      expected := priv = any(r.granted);
      actual := has_table_privilege(r.role_name, 'public.' || r.tbl, priv);
      if actual <> expected then
        raise warning 'M7-1 MISMATCH | %.% | % | expected=% actual=%',
          r.role_name, r.tbl, priv, expected, actual;
        fails := fails + 1;
      end if;
    end loop;
    -- per-(table,role) confirmation line
    raise notice 'M7-1 ok | % | % = {%}', r.role_name, r.tbl, array_to_string(r.granted, ', ');
  end loop;

  if fails = 0 then
    raise notice 'M7-1 PASS | 9 tables x {anon,authenticated} match exact matrix (126 privilege checks)';
  else
    raise exception 'M7-1 FAIL | % grant mismatches (see warnings above)', fails;
  end if;
end $$;

-- ============================================================================
-- M7-2: service_role declared-set pin (M14 amendment, 2026-07-08)
-- The original case was an over-revoke guard asserting service_role's full
-- DML — which was never granted by anyone; it was the v2.90 platform default,
-- removed by the v2.90->v2.109 CLI upgrade (journal: grants are never
-- platform-conferred for service_role, hosted + local alike). M14 declares
-- the real set. Same two most-tightened tables, now pinned in BOTH
-- directions against the M14 declaration:
--   trainer_stripe_accounts = SELECT,INSERT,UPDATE exactly (the M5 two-gate
--     table — service_role is its ONLY writer: Phase-7 onboarding INSERT,
--     Phase-8 account.updated UPDATE, stripe_account_id lookup SELECT; no
--     DELETE — row absence is a first-class state, never reached by delete)
--   dogs = no DML at all (no system path touches dogs)
-- ============================================================================
\echo
\echo === M7-2: service_role holds the M14 declared set exactly (both directions) ===
do $$
declare
  r record;
  p text;
  expected boolean;
  actual boolean;
  fails int := 0;
begin
  for r in
    select * from (values
      ('trainer_stripe_accounts', array['SELECT','INSERT','UPDATE']),
      ('dogs',                    array[]::text[])
    ) as m(tbl, granted)
  loop
    foreach p in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      expected := p = any(r.granted);
      actual := has_table_privilege('service_role', 'public.' || r.tbl, p);
      if actual <> expected then
        raise warning 'M7-2 MISMATCH | service_role | % | % | expected=% actual=%',
          r.tbl, p, expected, actual;
        fails := fails + 1;
      end if;
    end loop;
  end loop;
  if fails = 0 then
    raise notice 'M7-2 PASS | service_role = M14 declared set (stripe S,I,U; dogs none)';
  else
    raise exception 'M7-2 FAIL | % mismatch(es) against the M14 declared set', fails;
  end if;
end $$;

-- ============================================================================
-- M7-3: default-privileges capstone
-- §2 altered the postgres default ACL so future public tables auto-grant
-- nothing to anon/authenticated. Create a throwaway table AS postgres (the
-- role migrations create tables as), assert anon + authenticated received no
-- privileges, then ROLLBACK so the probe never persists. If §2 had not taken,
-- the platform default would have auto-granted full CRUD here.
-- ============================================================================
\echo
\echo === M7-3: new table auto-grants nothing to anon/authenticated (default-priv capstone) ===
begin;
  create table public._m7_default_priv_probe (id int);
  do $$
  declare
    leaked int := 0;
    p text;
    role_name text;
    all_privs text[] := array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
  begin
    foreach role_name in array array['anon','authenticated'] loop
      foreach p in array all_privs loop
        if has_table_privilege(role_name, 'public._m7_default_priv_probe', p) then
          raise warning 'M7-3 LEAK | new table granted % to % by default', p, role_name;
          leaked := leaked + 1;
        end if;
      end loop;
    end loop;
    if leaked = 0 then
      raise notice 'M7-3 PASS | new table auto-grants nothing to anon/authenticated (default privileges hardened)';
    else
      raise exception 'M7-3 FAIL | new table auto-granted % privilege(s) — ALTER DEFAULT PRIVILEGES did not take', leaked;
    end if;
  end $$;
rollback;  -- drops the probe table; default-privilege change persists (it is schema-level, set by M7)

\echo
\echo === M7 grant-hardening tests complete (3 checks) ===
