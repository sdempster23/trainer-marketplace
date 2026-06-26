-- ============================================================================
-- Category J — §13 GRANTs (the privilege layer, in isolation)
-- ============================================================================
-- Covers §13's table-privilege layer on public.bookings — a DISTINCT layer
-- from RLS. GRANTs gate whether a role may ATTEMPT an operation at all; RLS
-- gates WHICH ROWS it may touch. They are independent: a role needs BOTH the
-- grant AND a passing RLS policy. Categories A-I exercised RLS (row gating);
-- J tests the grant layer alone via has_table_privilege() — no rows, no JWT,
-- no transaction needed.
--
-- THE FINDING THIS CATEGORY SURFACED (most important of the M6 test process):
--   Pre-investigation (information_schema.role_table_grants) revealed that
--   Supabase's platform default (pg_default_acl for schema public) auto-grants
--   ALL privileges (arwdDxtm = INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/
--   TRIGGER) to BOTH anon AND authenticated on every public-schema table.
--   §13's original `grant select, insert, update ... to authenticated` was
--   therefore NON-RESTRICTING — GRANT only adds, and those privileges (plus
--   DELETE and more, plus everything for anon) already existed. The GRANT
--   layer was decorative; RLS default-deny was the SOLE effective gate.
--
--   Every prior category (A-I) tested THROUGH RLS, so the defect was invisible
--   until the grant layer was inspected directly. M6 §13 was amended to REVOKE
--   the excess (see the §13 comment in the migration):
--     revoke all on public.bookings from anon;
--     revoke delete, truncate, references, trigger from authenticated;
--   restoring the GRANT layer as a real second gate beneath RLS.
--
--   Scope note: M6 fixes bookings ONLY. The same permissive default ACL exists
--   on profiles/dogs/trainers/services — a project-wide REVOKE sweep is the
--   next migration's priority (see project memory). J asserts the HARDENED
--   bookings end state.
--
-- HARDENED END STATE (verified on a fresh `supabase db reset`):
--   authenticated -> SELECT, INSERT, UPDATE   (exactly three)
--   anon          -> nothing
--   service_role  -> full (bypasses RLS; server-side admin path, unchanged)
--   postgres      -> full (table owner; unchanged)
--
-- VERIFICATION MECHANISM: has_table_privilege(role, table, priv) -> boolean.
-- The role is an explicit argument, so no JWT-clearing prelude and no session-
-- role switching is needed. Assertions are read-only, so no BEGIN/ROLLBACK.
-- Simpler than A-I by design — this layer is static metadata, not row behavior.
--
-- 4 cases:
--   J1  authenticated HAS select/insert/update          (granted DML present)
--   J2  authenticated LACKS delete/truncate/references/trigger (REVOKE held)
--   J3  anon has NO privileges                          (revoke all held)
--   J4  service_role retains full DML                   (REVOKE not over-broad)
--
-- Acceptance: all 4 cases must PASS.
-- ============================================================================

\set QUIET on

-- ============================================================================
-- J1: authenticated HAS exactly the three DML grants it needs
-- select/insert/update are what bookings' app paths require (read a booking,
-- create one, transition its status). All three must be present post-REVOKE.
-- ============================================================================
\echo
\echo === J1: authenticated has SELECT, INSERT, UPDATE ===
do $$
begin
  if has_table_privilege('authenticated','public.bookings','SELECT')
     and has_table_privilege('authenticated','public.bookings','INSERT')
     and has_table_privilege('authenticated','public.bookings','UPDATE') then
    raise notice 'J1 PASS | authenticated has SELECT, INSERT, UPDATE';
  else
    raise exception 'J1 FAIL | authenticated missing a DML grant: S=% I=% U=%',
      has_table_privilege('authenticated','public.bookings','SELECT'),
      has_table_privilege('authenticated','public.bookings','INSERT'),
      has_table_privilege('authenticated','public.bookings','UPDATE');
  end if;
end $$;

-- ============================================================================
-- J2: authenticated LACKS delete/truncate/references/trigger (the REVOKE held)
-- These were granted by the platform default ACL and explicitly revoked in
-- §13. DELETE is the design-critical one: cancellation is a state transition
-- (status -> CANCELLED), never a row removal, so authenticated must not be
-- able to DELETE. truncate/references/trigger are revoked as belt-and-braces.
-- ============================================================================
\echo
\echo === J2: authenticated lacks DELETE, TRUNCATE, REFERENCES, TRIGGER ===
do $$
begin
  if not has_table_privilege('authenticated','public.bookings','DELETE')
     and not has_table_privilege('authenticated','public.bookings','TRUNCATE')
     and not has_table_privilege('authenticated','public.bookings','REFERENCES')
     and not has_table_privilege('authenticated','public.bookings','TRIGGER') then
    raise notice 'J2 PASS | authenticated lacks DELETE/TRUNCATE/REFERENCES/TRIGGER';
  else
    raise exception 'J2 FAIL | authenticated retains a revoked privilege: D=% T=% R=% Trg=%',
      has_table_privilege('authenticated','public.bookings','DELETE'),
      has_table_privilege('authenticated','public.bookings','TRUNCATE'),
      has_table_privilege('authenticated','public.bookings','REFERENCES'),
      has_table_privilege('authenticated','public.bookings','TRIGGER');
  end if;
end $$;

-- ============================================================================
-- J3: anon has NO privileges on bookings (revoke all held)
-- Bookings are never publicly accessible. With the platform default revoked,
-- anon holds nothing — the grant layer now blocks anon even before RLS. (RLS
-- would also deny anon, since all policies are `to authenticated`; this is the
-- defense-in-depth the original §13 lacked.)
-- ============================================================================
\echo
\echo === J3: anon has no privileges on bookings ===
do $$
begin
  if not has_table_privilege('anon','public.bookings','SELECT')
     and not has_table_privilege('anon','public.bookings','INSERT')
     and not has_table_privilege('anon','public.bookings','UPDATE')
     and not has_table_privilege('anon','public.bookings','DELETE') then
    raise notice 'J3 PASS | anon has no SELECT/INSERT/UPDATE/DELETE on bookings';
  else
    raise exception 'J3 FAIL | anon retains a privilege: S=% I=% U=% D=%',
      has_table_privilege('anon','public.bookings','SELECT'),
      has_table_privilege('anon','public.bookings','INSERT'),
      has_table_privilege('anon','public.bookings','UPDATE'),
      has_table_privilege('anon','public.bookings','DELETE');
  end if;
end $$;

-- ============================================================================
-- J4: service_role retains full DML (the REVOKE was not over-broad)
-- service_role is the trusted server-side role (it also has BYPASSRLS). The
-- §13 REVOKE targeted anon + authenticated only; this case guards against an
-- over-broad revoke that would break server-side admin/cron paths (e.g. the
-- Phase 8 system-path CONFIRMED -> COMPLETED). Grants are separate from
-- BYPASSRLS: the role still needs table privileges to operate.
-- ============================================================================
\echo
\echo === J4: service_role retains full DML (not over-revoked) ===
do $$
begin
  if has_table_privilege('service_role','public.bookings','SELECT')
     and has_table_privilege('service_role','public.bookings','INSERT')
     and has_table_privilege('service_role','public.bookings','UPDATE')
     and has_table_privilege('service_role','public.bookings','DELETE') then
    raise notice 'J4 PASS | service_role retains full DML (server-side path intact)';
  else
    raise exception 'J4 FAIL | service_role lost a privilege (over-revoke): S=% I=% U=% D=%',
      has_table_privilege('service_role','public.bookings','SELECT'),
      has_table_privilege('service_role','public.bookings','INSERT'),
      has_table_privilege('service_role','public.bookings','UPDATE'),
      has_table_privilege('service_role','public.bookings','DELETE');
  end if;
end $$;

\echo
\echo === Category J complete (4 cases) ===
