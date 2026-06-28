-- ============================================================================
-- M7 — grant-hardening sweep (project-wide)
-- ============================================================================
-- The M6 §13 finding generalized. Supabase's platform default (pg_default_acl,
-- grantor = postgres) auto-grants ALL 7 table privileges (SELECT, INSERT,
-- UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) to BOTH anon AND authenticated
-- on every table created in schema public. M6 fixed `bookings`; this migration
-- sweeps the remaining 9 Phase-1 tables and stops the recurrence on future
-- tables.
--
-- Effect today: not an active breach (RLS is enabled on every table, and
-- neither anon nor authenticated has BYPASSRLS), but the grant layer was inert
-- — it granted nothing that the platform default had not already granted, and
-- it never revoked the excess. This restores the GRANT layer as a real second
-- gate beneath RLS, project-wide.
--
-- DESIGN — grants are MATCHED to each table's existing RLS policy intent, not
-- blanket-revoked:
--   * The M1-M5 policies were written without a TO clause, so they default to
--     PUBLIC (which includes anon). Seven tables carry "...publicly readable"
--     SELECT policies whose USING qual does NOT depend on auth.uid()
--     (role = 'trainer', is_active, etc.) — i.e. the unauthenticated marketplace
--     browse (M3's intentional public-read RLS). anon KEEPS select on those.
--     Removing it would be a PRODUCT change (gating browse behind login), not a
--     security fix, and is out of scope here.
--   * dogs and trainer_stripe_accounts have only auth.uid()-dependent or
--     owner/trainer-scoped read policies — anon cannot satisfy them — so anon
--     gets nothing.
--   * authenticated gets EXACTLY the DML each table's write policies use:
--       - no INSERT on profiles (rows are minted by the SECURITY DEFINER
--         handle_new_user trigger, never a direct authenticated INSERT)
--       - DELETE only where a hard-delete DELETE policy exists
--         (trainer_certifications, trainer_availability,
--          trainer_availability_exceptions, trainer_specialty_assignments);
--         soft-delete tables (dogs, profiles, trainer_services) get no DELETE
--       - trainer_stripe_accounts is SELECT-only (M5 two-gate write design;
--         writes happen via service_role from the server, which bypasses RLS)
--   * service_role and postgres are untouched — they bypass RLS and remain the
--     server-side / admin paths.
--
-- Post-sweep grant matrix:
--   table                            | anon   | authenticated
--   ---------------------------------+--------+----------------------------
--   profiles                         | SELECT | SELECT, UPDATE
--   dogs                             | —      | SELECT, INSERT, UPDATE
--   trainers                         | SELECT | SELECT, INSERT, UPDATE
--   trainer_certifications           | SELECT | SELECT, INSERT, UPDATE, DELETE
--   trainer_specialty_assignments    | SELECT | SELECT, INSERT, DELETE
--   trainer_services                 | SELECT | SELECT, INSERT, UPDATE
--   trainer_availability             | SELECT | SELECT, INSERT, UPDATE, DELETE
--   trainer_availability_exceptions  | SELECT | SELECT, INSERT, UPDATE, DELETE
--   trainer_stripe_accounts          | —      | SELECT
--   (bookings: already hardened in M6 §13 — not repeated here)
--
-- Verified before authoring: every existing anon/authenticated grant has
-- grantor = postgres, so a postgres-run REVOKE removes it (a dry REVOKE on
-- dogs dropped anon from 7 privileges to 0). The migration role `postgres` is
-- non-superuser here but is the grantor, which is sufficient for both the
-- REVOKEs and for ALTER DEFAULT PRIVILEGES on its own defaults.
--
-- Convention established for M7+: every future migration REVOKE-then-GRANTs
-- explicitly. §2 below removes the postgres default auto-grant so a forgotten
-- GRANT fails loud (table inaccessible) rather than silently over-exposing.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Per-table REVOKE-then-GRANT — fix the present (the 9 existing tables)
-- ----------------------------------------------------------------------------
-- Each table: strip everything from anon + authenticated, then grant back
-- exactly the policy-matched set. REVOKE ALL clears the platform-default
-- excess (DELETE/TRUNCATE/REFERENCES/TRIGGER and, for private tables, all of
-- anon's access) in one statement; the GRANTs restate intent explicitly.

-- profiles (M1) — public trainer-profile read; users update their own row.
-- No INSERT: handle_new_user (SECURITY DEFINER) mints profile rows.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon;
grant select, update on public.profiles to authenticated;

-- dogs (M2) — private. Owner reads/creates/updates own; trainer reads via
-- booking. No public read (anon cannot satisfy the auth.uid() quals). Soft
-- delete -> no DELETE.
revoke all on public.dogs from anon, authenticated;
grant select, insert, update on public.dogs to authenticated;

-- trainers (M3) — public trainer-profile read; trainer creates/updates own row.
revoke all on public.trainers from anon, authenticated;
grant select on public.trainers to anon;
grant select, insert, update on public.trainers to authenticated;

-- trainer_certifications (M3) — public read; trainer fully self-manages
-- (hard-delete policy present).
revoke all on public.trainer_certifications from anon, authenticated;
grant select on public.trainer_certifications to anon;
grant select, insert, update, delete on public.trainer_certifications to authenticated;

-- trainer_specialty_assignments (M3) — public read; trainer adds/removes
-- (hard-delete join table; no UPDATE policy).
revoke all on public.trainer_specialty_assignments from anon, authenticated;
grant select on public.trainer_specialty_assignments to anon;
grant select, insert, delete on public.trainer_specialty_assignments to authenticated;

-- trainer_services (M4) — public active-service read; trainer creates/updates
-- own. Soft delete -> no DELETE.
revoke all on public.trainer_services from anon, authenticated;
grant select on public.trainer_services to anon;
grant select, insert, update on public.trainer_services to authenticated;

-- trainer_availability (M4) — public read; trainer fully self-manages
-- (hard-delete policy present).
revoke all on public.trainer_availability from anon, authenticated;
grant select on public.trainer_availability to anon;
grant select, insert, update, delete on public.trainer_availability to authenticated;

-- trainer_availability_exceptions (M4) — public read; trainer fully
-- self-manages (hard-delete policy present).
revoke all on public.trainer_availability_exceptions from anon, authenticated;
grant select on public.trainer_availability_exceptions to anon;
grant select, insert, update, delete on public.trainer_availability_exceptions to authenticated;

-- trainer_stripe_accounts (M5) — private, SELECT-only for the owning trainer.
-- Writes occur via service_role (server-side, M5 two-gate design); no
-- authenticated write path. anon gets nothing.
revoke all on public.trainer_stripe_accounts from anon, authenticated;
grant select on public.trainer_stripe_accounts to authenticated;


-- ----------------------------------------------------------------------------
-- 2. ALTER DEFAULT PRIVILEGES — guard the future (run last)
-- ----------------------------------------------------------------------------
-- Order rationale: §1 fixes the 9 existing tables; §2 prevents recurrence on
-- tables created AFTER this migration. ALTER DEFAULT PRIVILEGES only affects
-- objects created later, so it has no effect on the existing 9 regardless of
-- order — placing it last reads as "fix the present, then guard the future".
--
-- Scope: FOR ROLE postgres, stated EXPLICITLY rather than relying on the
-- current_user default. Postgres is the role migrations create tables as, so
-- this is the default ACL that governs all future migration-created tables.
-- Being explicit is self-documenting (a future reader sees the scope without
-- inferring it) and robust to role context (the statement behaves identically
-- even if a migration is ever applied under a different role). The
-- supabase_admin default ACL (grantor = supabase_admin) governs only
-- platform-internal tables it creates and is intentionally left alone (and is
-- not ours to alter as non-superuser).
--
-- Tables only — sequences and functions keep their platform defaults (our
-- tables use uuid PKs, not sequences, so no anon/authenticated sequence usage
-- is needed for inserts). Sequence/function default hardening is out of scope.
--
-- Effect: future tables auto-grant nothing to anon/authenticated. Each future
-- migration must GRANT explicitly (REVOKE-then-GRANT convention) — a forgotten
-- grant fails loud (table inaccessible) instead of silently over-exposing.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
