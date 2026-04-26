-- ============================================================================
-- Migration 1b — Identity GRANTs (forward-only correction to Migration 1)
-- ============================================================================
-- Background: Migration 1 enabled RLS and wrote policies on public.profiles
-- but did NOT issue table-level GRANTs to the anon / authenticated roles.
-- Postgres has two independent access-control layers — the GRANT layer
-- (table-level privileges) and the RLS layer (per-row policies). Both must
-- permit a query for it to succeed. With RLS enabled and no GRANTs, every
-- API call from anon/authenticated bounces with SQLSTATE 42501
-- ("permission denied for table profiles") before RLS even runs.
--
-- Older Supabase project defaults baked in a blanket
--   GRANT ... ON ALL TABLES IN SCHEMA public TO anon, authenticated
-- This project deliberately disabled "auto-expose tables" at provisioning,
-- which (rightly) drops that auto-grant. The trade-off is we have to be
-- explicit per table — a habit worth building.
--
-- This migration adds the minimum grants aligned with the policies in
-- Migration 1. From Migration 2 onward, every table-creating migration
-- will include its own GRANTs in the same file.
--
-- Why a separate forward-only migration instead of editing Migration 1:
-- Migration 1 has already been applied to the remote dev project and
-- recorded in the migration log. Editing an applied migration creates a
-- divergence between local and remote that the CLI can't resolve cleanly.
-- The forward-only convention is rigid: once applied, never edit; correct
-- via a new migration on top.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. authenticated role grants
-- ----------------------------------------------------------------------------
-- SELECT covers Policy 1 (read own profile) and Policy 2 (public trainer
-- read — authenticated users can see what anon can see, plus their own).
-- UPDATE covers Policy 3 (update own profile, with role-change prevented
-- by the WITH CHECK subquery).
--
-- Deliberately NOT granted:
--   INSERT — profiles inserts only happen via handle_new_user() which is
--            SECURITY DEFINER and runs as postgres, bypassing app GRANTs.
--   DELETE — no delete policy exists; deletion is via CASCADE from
--            auth.users (dev cleanup) or via Phase 13 anonymization.
-- ----------------------------------------------------------------------------
grant select, update on public.profiles to authenticated;


-- ----------------------------------------------------------------------------
-- 2. anon role grants
-- ----------------------------------------------------------------------------
-- SELECT only — Policy 2 lets logged-out visitors browse trainer profiles.
-- Nothing else: anon cannot read non-trainer profiles, cannot update,
-- cannot insert, cannot delete.
-- ----------------------------------------------------------------------------
grant select on public.profiles to anon;


-- ----------------------------------------------------------------------------
-- 3. user_role enum USAGE
-- ----------------------------------------------------------------------------
-- Custom types are usually accessible to PUBLIC by default in modern
-- Postgres, which would make this redundant. Granting explicitly anyway —
-- defensive, harmless, and self-contained (the migration doesn't depend
-- on whatever defaults the Supabase project happens to ship with).
-- ----------------------------------------------------------------------------
grant usage on type public.user_role to authenticated, anon;
