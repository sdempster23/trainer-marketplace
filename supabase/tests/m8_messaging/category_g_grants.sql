-- ============================================================================
-- Category G — grant layer (M7 convention, J-style verification)
-- ============================================================================
-- Confirms M8's tables landed with exactly the intended grants under the M7
-- default-privilege baseline. has_table_privilege() — static catalog metadata,
-- no rows/JWT/transaction.
--
-- G1 exact matrix: message_threads + messages x {anon, authenticated},
--    exhaustive across all 7 table privileges (proves absence as well as
--    presence — e.g. anon has nothing, messages has no UPDATE/DELETE).
-- G2 over-revoke guard: service_role retains full DML on both tables.
--
-- 2 checks. Acceptance: all PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- G1: exact grant matrix
--   message_threads : anon {} | authenticated {SELECT, INSERT, UPDATE}
--   messages        : anon {} | authenticated {SELECT, INSERT}
-- ============================================================================
\echo
\echo === G1: exact grant matrix (message_threads, messages) ===
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
      ('message_threads', 'anon',          array[]::text[]),
      ('message_threads', 'authenticated', array['SELECT','INSERT','UPDATE']),
      ('messages',        'anon',          array[]::text[]),
      ('messages',        'authenticated', array['SELECT','INSERT'])
    ) as t(tbl, role_name, granted)
  loop
    foreach priv in array all_privs loop
      expected := priv = any(r.granted);
      actual := has_table_privilege(r.role_name, 'public.' || r.tbl, priv);
      if actual <> expected then
        raise warning 'G1 MISMATCH | %.% | % | expected=% actual=%',
          r.role_name, r.tbl, priv, expected, actual;
        fails := fails + 1;
      end if;
    end loop;
    raise notice 'G1 ok | % | % = {%}', r.role_name, r.tbl, array_to_string(r.granted, ', ');
  end loop;

  if fails = 0 then
    raise notice 'G1 PASS | 2 tables x {anon,authenticated} match exact matrix (56 privilege checks)';
  else
    raise exception 'G1 FAIL | % grant mismatches (see warnings)', fails;
  end if;
end $$;

-- ============================================================================
-- G2: over-revoke guard — service_role retains full DML on both tables
-- ============================================================================
\echo
\echo === G2: service_role retains full DML (over-revoke guard) ===
do $$
declare
  t text;
  p text;
  tables text[] := array['message_threads','messages'];
  dml text[] := array['SELECT','INSERT','UPDATE','DELETE'];
  fails int := 0;
begin
  foreach t in array tables loop
    foreach p in array dml loop
      if not has_table_privilege('service_role', 'public.' || t, p) then
        raise warning 'G2 MISSING | service_role lacks % on %', p, t;
        fails := fails + 1;
      end if;
    end loop;
  end loop;
  if fails = 0 then
    raise notice 'G2 PASS | service_role retains full DML (REVOKE scoped to anon/authenticated only)';
  else
    raise exception 'G2 FAIL | service_role lost % privilege(s) — over-revoke', fails;
  end if;
end $$;

\echo
\echo === Category G complete (2 checks) ===
