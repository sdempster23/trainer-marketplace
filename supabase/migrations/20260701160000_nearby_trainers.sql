-- ============================================================================
-- M10 — nearby_trainers RPC (the project's first function-as-API)
-- ============================================================================
-- The trainer directory's proximity search: "trainers within X miles of a
-- point, sorted by distance". PostgREST's filter grammar has no PostGIS
-- operators (verified: a filter of the form service_point=st_dwithin....
-- fails to parse with PGRST100), so ST_DWithin/ST_Distance must live in a
-- database function exposed at /rest/v1/rpc/nearby_trainers.
--
-- SECURITY MODEL — SECURITY INVOKER, deliberately.
-- Per the M8 integrity-vs-access convention: this function is pure access
-- (reading rows on behalf of a caller), not integrity validation, so it runs
-- under the CALLER's RLS. anon through this function sees exactly the rows
-- anon sees through the tables (M3/M7 public-read policies, soft-delete
-- filtered via the parent profile). Verified empirically pre-draft: a
-- soft-deleted trainer's profile removed the trainer from anon's RPC results
-- in the same transaction.
--
-- DESIGN DECISION — wide return (directory-card fields), not (id, distance):
--   * The directory card needs name + bio + specialties + distance in one
--     render. A thin (id, distance) return forces a second PostgREST query
--     (`id=in.(...)`), which returns rows in arbitrary order — the app would
--     re-sort by a distance map and stitch specialties client-side (an N+1
--     shape). One STABLE function call is one round trip, ordering preserved
--     server-side.
--   * The hybrid ("thin RPC + PostgREST resource embedding") is not available:
--     PostgREST can only embed on functions that RETURN SETOF <table>, and a
--     SETOF trainers return cannot carry the computed distance column.
--   * INVOKER makes the widening RLS-safe: the profiles join and the
--     specialties aggregate each run under the caller's own policies, so the
--     function can never return a field the caller couldn't SELECT directly.
--   * Cost accepted: RETURNS TABLE cannot be reshaped by CREATE OR REPLACE, so
--     adding fields later (pricing, ratings) means DROP + CREATE in a future
--     migration. Fine — card fields are stable, and pricing/ratings have no
--     data yet (out of scope by YAGNI, not oversight).
--
-- UNITS — callers speak MILES (matching the app's METERS_PER_MILE boundary
-- convention in app/(trainer)/actions.ts); geography ST_DWithin/ST_Distance
-- speak METERS (geodesic). The miles→meters conversion happens once, inside
-- the function; distance_meters is returned raw and the app converts for
-- display (dividing by the same shared constant).
--
-- LOCATION READ-BACK — service_point is returned as (lat, lng) doubles via
-- ST_Y/ST_X on a geometry cast, NOT as raw geography (which PostgREST
-- serializes as WKB hex, useless to a client). Note the axis order trap:
-- ST_X = longitude, ST_Y = latitude — same lng-first orientation as the EWKT
-- the onboarding action writes.
--
-- The "listable floor" (which trainers are presentable enough to show in a
-- browse-all list) is an app-level query concern and stays out of this
-- migration; the WHERE below excludes NULL locations because a proximity
-- search over them is undefined, not as a listability policy.
--
-- Uses idx_trainers_service_point (M3's GiST index) — ST_DWithin is
-- index-aware; plan verified (Index Scan with && expand) pre-draft.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The function
-- ----------------------------------------------------------------------------
-- Parameter names are prefixed (search_*) so they cannot collide with the
-- OUT columns lat/lng — RETURNS TABLE column names are in scope inside the
-- body, and same-named parameters would make every reference ambiguous.
-- search_path is pinned empty, so every object reference — including the
-- PostGIS functions and the geometry/geography type names in casts — is
-- schema-qualified.
create function public.nearby_trainers(
  search_lat double precision,
  search_lng double precision,
  radius_miles double precision
)
returns table (
  id uuid,
  display_name text,
  bio text,
  years_experience integer,
  service_radius_meters integer,
  timezone text,
  specialties public.trainer_specialty[],
  lat double precision,
  lng double precision,
  distance_meters double precision
)
language sql
stable                -- read-only; also lets PostgREST serve it via GET
security invoker      -- access-gating → caller's RLS (see header)
set search_path = ''
as $$
  select
    t.id,
    p.display_name,
    t.bio,
    t.years_experience,
    t.service_radius_meters,
    t.timezone,
    -- Aggregate under the caller's RLS like everything else. coalesce to an
    -- empty array so a specialty-less trainer renders as [] downstream, not
    -- null (one less null-check in every consumer).
    coalesce(
      (
        select array_agg(a.specialty order by a.specialty)
        from public.trainer_specialty_assignments a
        where a.trainer_id = t.id
      ),
      '{}'::public.trainer_specialty[]
    ) as specialties,
    extensions.st_y(t.service_point::extensions.geometry) as lat,
    extensions.st_x(t.service_point::extensions.geometry) as lng,
    extensions.st_distance(
      t.service_point,
      extensions.st_setsrid(
        extensions.st_makepoint(search_lng, search_lat), 4326
      )::extensions.geography
    ) as distance_meters
  from public.trainers t
  -- INNER join: a trainers row is only RLS-visible when its profile row is
  -- visible (the M3 policy's EXISTS), so the join can't drop rows the caller
  -- could otherwise see — it only carries display_name along.
  join public.profiles p on p.id = t.id
  where t.service_point is not null
    and extensions.st_dwithin(
      t.service_point,
      extensions.st_setsrid(
        extensions.st_makepoint(search_lng, search_lat), 4326
      )::extensions.geography,
      radius_miles * 1609.344
    )
  order by distance_meters asc
$$;

comment on function public.nearby_trainers(double precision, double precision, double precision) is
  'Directory proximity search: trainers within radius_miles of (search_lat, '
  'search_lng), ordered nearest-first, with directory-card fields. SECURITY '
  'INVOKER deliberately (M8 integrity-vs-access convention): this is access, '
  'not integrity — rows are gated by the caller''s own RLS (public-read, '
  'soft-delete filtered). Distances in meters (geodesic); callers convert '
  'miles at the boundary.';


-- ----------------------------------------------------------------------------
-- 2. Explicit EXECUTE grants — the M7 convention extended to functions
-- ----------------------------------------------------------------------------
-- Two mechanisms auto-grant EXECUTE today: the Postgres built-in default
-- (EXECUTE to PUBLIC on every new function) and the platform default ACL
-- (pg_default_acl, grantor postgres, objtype f: anon/authenticated/
-- service_role each get X). M7's hardening covered TABLES ONLY, so this
-- function would arrive pre-granted to everyone. The intended audience here
-- HAPPENS to match that default (the directory is logged-out browse), but per
-- the M7 convention the grant layer states intent explicitly rather than
-- inheriting it: REVOKE what the defaults handed out, then GRANT back exactly
-- the intended set. service_role and postgres are untouched, as in M7 — they
-- are the server-side/admin paths.
revoke execute on function public.nearby_trainers(double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.nearby_trainers(double precision, double precision, double precision)
  to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. ALTER DEFAULT PRIVILEGES — guard the future, now for FUNCTIONS
-- ----------------------------------------------------------------------------
-- (M7 placed its guard last as "fix the present, then guard the future"; here
-- §4's present-fixing sweep follows instead. Order is cosmetic — ALTER
-- DEFAULT PRIVILEGES affects only objects created after it, never §4's
-- existing functions.)
-- The M7 §2 pattern covering what M7 explicitly scoped out ("function default
-- hardening is out of scope"). M10 makes functions load-bearing API surface,
-- so the same forgotten-grant-fails-loud property should hold for them:
-- future postgres-created functions in public must not auto-grant EXECUTE to
-- PUBLIC/anon/authenticated. FOR ROLE postgres stated explicitly (M7
-- rationale: self-documenting, robust to role context). service_role keeps
-- its platform default, mirroring the tables guard.
--
-- Effect: every future RPC (there will be more) must carry its own explicit
-- REVOKE-then-GRANT block like §2 — a forgotten grant means the function is
-- uncallable by the API roles (loud) instead of callable by everyone
-- (silent). Trigger functions are unaffected in practice: EXECUTE on a
-- trigger function is checked against the table owner at trigger-creation
-- time, never against the API caller.
--
-- (Sequences keep their platform defaults, as in M7 — uuid PKs, no sequence
-- usage by API roles.)
--
-- TWO STATEMENTS, NOT ONE — the default-privileges composition gotcha
-- (caught by test E3 on the first apply; encode it so it is never re-learned):
-- per-schema default-privilege entries compose ADDITIVELY with the global
-- defaults and CANNOT mask the built-in EXECUTE-to-PUBLIC grant on functions
-- — a per-schema REVOKE only undoes per-schema GRANTs. So the per-schema
-- statement below strips the platform default ACL's explicit anon/
-- authenticated auto-grants (that entry IS per-schema), but new functions
-- were still born with =X (PUBLIC) from the built-in default, which anon and
-- authenticated inherit. Only the GLOBAL (schema-less) form overrides the
-- built-in default. Tables never hit this — there is no built-in PUBLIC
-- default on tables — which is why M7's per-schema-only guard was clean.
--
-- Accepted scope of the global form: it applies to functions postgres creates
-- in ANY schema, not just public. Fine here — postgres creates functions only
-- in public, and the §2-style explicit REVOKE-then-GRANT is the convention
-- for every function that should be callable regardless.

-- Global: override the built-in EXECUTE-to-PUBLIC default for postgres-created
-- functions.
alter default privileges for role postgres
  revoke execute on functions from public;

-- Per-schema: strip the platform default ACL's explicit anon/authenticated
-- auto-grants (harmless overlap with the global form; kept because this is
-- the entry that actually carries those grants).
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4. Ride-along sweep — the 9 pre-M10 functions (M7 precedent: it swept
--    tables; M10 sweeps functions)
-- ----------------------------------------------------------------------------
-- The existing grants are INERT for the 8 RETURNS-trigger functions: a
-- trigger function cannot be called directly through the API (PostgREST
-- refuses RETURNS trigger), and trigger FIRING does not check the acting
-- user's EXECUTE (verified empirically pre-draft: an authenticated INSERT
-- fired a trigger function with zero EXECUTE grants; Postgres checks EXECUTE
-- against the trigger's CREATOR at CREATE TRIGGER time, not the DML caller).
-- So this is hygiene/uniformity, not a vulnerability fix — it makes the
-- journal statement clean ("function grants are explicit from M10; existing
-- functions swept") instead of carrying a permanent asterisk. The M6-M9
-- suites run as full regression after apply to PROVE trigger firing survives
-- the sweep, not assume it.
--
-- THE ONE EXCEPTION — _bookings_ends_at is NOT a trigger function. It is
-- evaluated inside bookings' GENERATED column (ends_at) and EXCLUDE
-- constraint during caller DML, and — verified empirically pre-draft —
-- generated-column/EXCLUDE evaluation DOES check the acting role's EXECUTE
-- (an authenticated INSERT into a probe table failed with "permission denied
-- for function" after a blind revoke). A blanket sweep here would break every
-- authenticated bookings INSERT/UPDATE. Policy-matched instead (the M7
-- lesson): authenticated keeps EXECUTE because authenticated holds bookings
-- INSERT/UPDATE; anon holds no bookings DML (M6 §13: anon has nothing) so
-- anon loses it; PUBLIC goes. service_role keeps its platform grant (it
-- writes bookings server-side).

-- The 8 trigger functions — inert grants, fully swept.
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.bookings_validate_insert() from public, anon, authenticated;
revoke execute on function public.bookings_validate_update() from public, anon, authenticated;
revoke execute on function public.message_threads_validate_insert() from public, anon, authenticated;
revoke execute on function public.message_threads_validate_update() from public, anon, authenticated;
revoke execute on function public.messages_validate_insert() from public, anon, authenticated;
revoke execute on function public.messages_bump_thread() from public, anon, authenticated;

-- _bookings_ends_at — policy-matched: REVOKE-then-GRANT back exactly the DML
-- audience (authenticated), per the empirical finding above.
revoke execute on function public._bookings_ends_at(timestamp with time zone, integer)
  from public, anon, authenticated;
grant execute on function public._bookings_ends_at(timestamp with time zone, integer)
  to authenticated;
