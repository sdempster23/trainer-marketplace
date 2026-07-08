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
-- G2 service_role declared-set pin (M14): NO DML on either table — no
--    system path writes messaging; the M14 declaration grants it nothing.
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
-- G2: service_role declared-set pin (M14 amendment, 2026-07-08)
-- Was an over-revoke guard asserting full DML — the v2.90 platform-default
-- artifact, never granted by any migration, removed by the v2.90->v2.109 CLI
-- upgrade (journal: service_role grants are never platform-conferred, hosted
-- + local alike). M14 declares service_role's set per table, and for
-- messaging that set is EMPTY: all writes are authenticated-party server
-- actions; the mail seam reads run under the acting user's session plus the
-- auth admin API. Absence is now the assertion — a stray grant here would
-- hand the RLS-bypassing role a surface no designed path uses.
-- ============================================================================
\echo
\echo === G2: service_role holds NO DML on messaging tables (M14 pin) ===
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
      if has_table_privilege('service_role', 'public.' || t, p) then
        raise warning 'G2 STRAY | service_role holds % on % (declared set is empty)', p, t;
        fails := fails + 1;
      end if;
    end loop;
  end loop;
  if fails = 0 then
    raise notice 'G2 PASS | service_role holds no DML on messaging tables (M14 declared set: empty)';
  else
    raise exception 'G2 FAIL | % stray privilege(s) beyond the M14 declared set', fails;
  end if;
end $$;

\echo
\echo === Category G complete (2 checks) ===
