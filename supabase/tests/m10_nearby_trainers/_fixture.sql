-- ============================================================================
-- M10 nearby_trainers test fixture — idempotent setup
-- ============================================================================
-- A five-trainer geography spread anchored on downtown Nashville, chosen so a
-- radius sweep (1 / 5 / 25 / 250 mi) changes the result set at every step:
--
--   t_downtown = a1111111-…  POINT(-86.7816 36.1627)  = THE search point (0 mi)
--   t_east     = a2222222-…  POINT(-86.7510 36.1770)  ~2 mi (East Nashville)
--   t_franklin = a3333333-…  POINT(-86.8689 35.9251)  ~17 mi (Franklin)
--   t_memphis  = a4444444-…  POINT(-90.0490 35.1495)  ~196 mi (Memphis)
--   t_noloc    = a5555555-…  service_point NULL       (never returned)
--
-- Deliberate edge shapes:
--   * t_franklin has NO specialty assignments   → specialties must be {} not NULL
--   * t_memphis  has NO display_name            → row survives with NULL name
--   * t_noloc    HAS a name and a specialty     → exclusion is location-driven
--   * all profiles start live; category D soft-deletes t_east INSIDE its own
--     BEGIN/ROLLBACK (paired positive-control design), so the fixture stays
--     reusable across categories
--
-- EWKT is lng-first (POINT(lng lat)) — the same orientation the onboarding
-- action writes. Distinct a*-prefixed UUID anchors (no overlap with the
-- M6/M8/M9 fixtures; per-suite fresh reset regardless).
-- Idempotent: DELETE-then-INSERT in FK dependency order. auth.users DELETE
-- cascades to public.profiles.
-- ============================================================================

\set QUIET on

-- Tear down (children before parents).
delete from public.trainer_specialty_assignments where trainer_id in (
  'a1111111-1111-1111-1111-111111111111','a2222222-2222-2222-2222-222222222222',
  'a3333333-3333-3333-3333-333333333333','a4444444-4444-4444-4444-444444444444',
  'a5555555-5555-5555-5555-555555555555');
delete from public.trainers where id in (
  'a1111111-1111-1111-1111-111111111111','a2222222-2222-2222-2222-222222222222',
  'a3333333-3333-3333-3333-333333333333','a4444444-4444-4444-4444-444444444444',
  'a5555555-5555-5555-5555-555555555555');
delete from auth.users where id in (
  'a1111111-1111-1111-1111-111111111111','a2222222-2222-2222-2222-222222222222',
  'a3333333-3333-3333-3333-333333333333','a4444444-4444-4444-4444-444444444444',
  'a5555555-5555-5555-5555-555555555555');

-- Build (parents before children).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        is_super_admin, confirmation_token, email_change,
                        email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','a1111111-1111-1111-1111-111111111111',
   'authenticated','authenticated','m10-downtown@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','a2222222-2222-2222-2222-222222222222',
   'authenticated','authenticated','m10-east@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','a3333333-3333-3333-3333-333333333333',
   'authenticated','authenticated','m10-franklin@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','a4444444-4444-4444-4444-444444444444',
   'authenticated','authenticated','m10-memphis@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','a5555555-5555-5555-5555-555555555555',
   'authenticated','authenticated','m10-noloc@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','','');
-- M1's handle_new_user trigger creates matching public.profiles rows (role=trainer).

-- display_name: t_memphis deliberately left NULL.
update public.profiles set display_name = 'Dana Downtown'
  where id = 'a1111111-1111-1111-1111-111111111111';
update public.profiles set display_name = 'Eli East'
  where id = 'a2222222-2222-2222-2222-222222222222';
update public.profiles set display_name = 'Fran Franklin'
  where id = 'a3333333-3333-3333-3333-333333333333';
update public.profiles set display_name = 'Nora Nowhere'
  where id = 'a5555555-5555-5555-5555-555555555555';

insert into public.trainers (id, bio, years_experience, service_point, service_radius_meters, timezone)
values
  ('a1111111-1111-1111-1111-111111111111','Downtown Nashville obedience trainer.', 8,
   'SRID=4326;POINT(-86.7816 36.1627)', 40234, 'America/Chicago'),
  ('a2222222-2222-2222-2222-222222222222','East Nashville protection-sport club decoy.', 3,
   'SRID=4326;POINT(-86.7510 36.1770)', 24140, 'America/Chicago'),
  ('a3333333-3333-3333-3333-333333333333','Franklin all-breed trainer.', 12,
   'SRID=4326;POINT(-86.8689 35.9251)', 56327, 'America/Chicago'),
  ('a4444444-4444-4444-4444-444444444444','Memphis scent-work specialist.', 5,
   'SRID=4326;POINT(-90.0490 35.1495)', 40234, 'America/Chicago'),
  ('a5555555-5555-5555-5555-555555555555','Trainer without a service location yet.', null,
   null, null, 'America/New_York');

insert into public.trainer_specialty_assignments (trainer_id, specialty) values
  ('a1111111-1111-1111-1111-111111111111','basic_obedience'),
  ('a1111111-1111-1111-1111-111111111111','puppy'),
  ('a2222222-2222-2222-2222-222222222222','protection_sport_psa'),
  ('a2222222-2222-2222-2222-222222222222','decoy_work'),
  ('a2222222-2222-2222-2222-222222222222','tracking'),
  ('a4444444-4444-4444-4444-444444444444','scent_work'),
  ('a5555555-5555-5555-5555-555555555555','agility');
-- t_franklin (a3333333) intentionally gets none.

\echo
\echo === M10 fixture loaded ===
select 'profiles' as t, count(*) from public.profiles where id::text like 'a_______-%'
union all select 'trainers', count(*) from public.trainers where id::text like 'a_______-%'
union all select 'assignments', count(*) from public.trainer_specialty_assignments where trainer_id::text like 'a_______-%';
