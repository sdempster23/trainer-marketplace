-- ============================================================================
-- PawMatch local development seed — trainer directory population
-- ============================================================================
-- DEV-ONLY. Runs automatically on every `supabase db reset` (config.toml
-- [db.seed]), against a fresh M1→M10 schema. Never pushed to hosted; never
-- referenced by tests (test suites carry their own fixtures with different
-- UUID anchors).
--
-- WHAT: 12 trainers giving the directory something real to browse, filter,
-- and proximity-search. Distance-graded from downtown Nashville
-- (36.1627, -86.7816): five in the Nashville metro at staggered distances
-- (downtown / ~2 / ~9 / ~15 / ~17 / ~30 mi), five in distance-graded metros
-- (Chattanooga / Knoxville / Louisville / Memphis / Atlanta), so every radius
-- step changes the result set. Specialties cover ALL 17 enum values,
-- working-dog heavy (PSA, IGP, French Ring, Mondioring, decoy work) per the
-- product niche, with the pet side represented.
--
-- TWO DELIBERATE EDGE ROWS (exercise the directory's listable floor):
--   5eed0011 — NULL display_name, everything else complete (Hendersonville)
--   5eed0012 — NULL service_point: never appears in proximity results
--
-- MECHANICS (the proven M10-fixture pattern):
--   * direct auth.users INSERTs — GoTrue gotchas honored: token/string
--     columns are '' (NULL breaks GoTrue's Go string scans),
--     raw_user_meta_data carries {"role":"trainer"} (what handle_new_user
--     reads), encrypted_password = '' (browse targets — these users never
--     log in; no auth.identities rows needed)
--   * handle_new_user (AFTER INSERT trigger) mints the profiles rows
--   * UPDATE profiles.display_name (the trigger writes only id + role)
--   * INSERT trainers with ST_SetSRID(ST_MakePoint(lng, lat), 4326) —
--     LNG FIRST, real coordinates per city; radius in meters
--     (10 mi = 16093, 25 mi = 40234, 50 mi = 80467, 100 mi = 160934)
--   * INSERT specialty assignments
--   * UUID pattern 5eed00NN-… (N = roster number) — seed rows are instantly
--     distinguishable from app-created data and test fixtures
--   * idempotent-safe: ON CONFLICT DO NOTHING on every insert (reset gives a
--     fresh DB anyway; this keeps a manual re-run harmless)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. auth.users (trigger creates public.profiles with role=trainer)
-- ----------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        is_super_admin, confirmation_token, email_change,
                        email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','5eed0001-0000-0000-0000-000000000001',
   'authenticated','authenticated','marcus.webb@seed.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','5eed0002-0000-0000-0000-000000000002',
   'authenticated','authenticated','sofia.ramirez@seed.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','5eed0003-0000-0000-0000-000000000003',
   'authenticated','authenticated','derek.holt@seed.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','5eed0004-0000-0000-0000-000000000004',
   'authenticated','authenticated','priya.natarajan@seed.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','5eed0005-0000-0000-0000-000000000005',
   'authenticated','authenticated','cole.brannigan@seed.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','5eed0006-0000-0000-0000-000000000006',
   'authenticated','authenticated','jade.onwudiwe@seed.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','5eed0007-0000-0000-0000-000000000007',
   'authenticated','authenticated','tom.kessler@seed.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','5eed0008-0000-0000-0000-000000000008',
   'authenticated','authenticated','annelise.brandt@seed.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','5eed0009-0000-0000-0000-000000000009',
   'authenticated','authenticated','rashida.cole@seed.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','5eed0010-0000-0000-0000-000000000010',
   'authenticated','authenticated','al.torres@seed.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','5eed0011-0000-0000-0000-000000000011',
   'authenticated','authenticated','noname.hendersonville@seed.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','5eed0012-0000-0000-0000-000000000012',
   'authenticated','authenticated','wren.delacroix@seed.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','','')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. display_name (5eed0011 deliberately skipped — the NULL-name edge row)
-- ----------------------------------------------------------------------------
update public.profiles set display_name = v.display_name
from (values
  ('5eed0001-0000-0000-0000-000000000001'::uuid, 'Marcus Webb'),
  ('5eed0002-0000-0000-0000-000000000002'::uuid, 'Sofia Ramirez'),
  ('5eed0003-0000-0000-0000-000000000003'::uuid, 'Derek Holt'),
  ('5eed0004-0000-0000-0000-000000000004'::uuid, 'Priya Natarajan'),
  ('5eed0005-0000-0000-0000-000000000005'::uuid, 'Cole Brannigan'),
  ('5eed0006-0000-0000-0000-000000000006'::uuid, 'Jade Onwudiwe'),
  ('5eed0007-0000-0000-0000-000000000007'::uuid, 'Tom Kessler'),
  ('5eed0008-0000-0000-0000-000000000008'::uuid, 'Annelise Brandt'),
  ('5eed0009-0000-0000-0000-000000000009'::uuid, 'Rashida Cole'),
  ('5eed0010-0000-0000-0000-000000000010'::uuid, 'Al Torres'),
  ('5eed0012-0000-0000-0000-000000000012'::uuid, 'Wren Delacroix')
) as v(id, display_name)
where profiles.id = v.id;

-- ----------------------------------------------------------------------------
-- 3. trainers — real coordinates, LNG FIRST in ST_MakePoint
--    Timezones: Nashville metro / Murfreesboro / Hendersonville / Memphis =
--    America/Chicago; Chattanooga / Knoxville / Atlanta = America/New_York;
--    Louisville = America/Kentucky/Louisville (Louisville is EASTERN time —
--    its precise IANA zone).
-- ----------------------------------------------------------------------------
insert into public.trainers (id, bio, years_experience, service_point, service_radius_meters, timezone)
values
  -- Nashville cluster, proximity-graded from downtown
  ('5eed0001-0000-0000-0000-000000000001',
   'Twelve years building PSA dogs from foundation to trial. I run decoy-heavy sessions out of a downtown club and take personal-protection clients by referral only.',
   12, extensions.st_setsrid(extensions.st_makepoint(-86.7816, 36.1627), 4326)::extensions.geography,
   40234, 'America/Chicago'),                                             -- downtown, 0 mi, 25 mi radius
  ('5eed0002-0000-0000-0000-000000000002',
   'Puppy foundations and family-dog manners in East Nashville. Positive-first, realistic about what a busy household can practice between sessions.',
   6, extensions.st_setsrid(extensions.st_makepoint(-86.7510, 36.1770), 4326)::extensions.geography,
   16093, 'America/Chicago'),                                             -- East Nashville, ~2 mi, 10 mi radius
  ('5eed0003-0000-0000-0000-000000000003',
   'IGP competitor since 2011 — three dogs titled to IGP3. Tracking is my first love; obedience routines built for the trial field, not the living room.',
   15, extensions.st_setsrid(extensions.st_makepoint(-86.7828, 36.0331), 4326)::extensions.geography,
   80467, 'America/Chicago'),                                             -- Brentwood, ~9 mi, 50 mi radius
  ('5eed0004-0000-0000-0000-000000000004',
   'Behavior cases are my whole practice: leash reactivity, resource guarding, bite histories. Veterinary-behaviorist referrals welcome; I work management-first.',
   9, extensions.st_setsrid(extensions.st_makepoint(-86.8689, 35.9251), 4326)::extensions.geography,
   40234, 'America/Chicago'),                                             -- Franklin, ~17 mi, 25 mi radius
  ('5eed0005-0000-0000-0000-000000000005',
   'Gun-dog trainer on a working farm outside Murfreesboro. Retrievers and pointers started on live birds; scent and blood-tracking work for hunters year-round.',
   20, extensions.st_setsrid(extensions.st_makepoint(-86.3903, 35.8456), 4326)::extensions.geography,
   80467, 'America/Chicago'),                                             -- Murfreesboro, ~30 mi, 50 mi radius
  -- Distance-graded metros
  ('5eed0006-0000-0000-0000-000000000006',
   'French Ring decoy and trainer out of Chattanooga. I travel for club seminars across the Southeast — expect hard, fair pressure and a lot of laughing.',
   7, extensions.st_setsrid(extensions.st_makepoint(-85.3097, 35.0456), 4326)::extensions.geography,
   160934, 'America/New_York'),                                           -- Chattanooga, ~105 mi, 100 mi radius
  ('5eed0007-0000-0000-0000-000000000007',
   'Service-dog task training and public-access prep in Knoxville. Owner-trainer teams are my specialty; I also teach solid pet obedience fundamentals.',
   11, extensions.st_setsrid(extensions.st_makepoint(-83.9207, 35.9606), 4326)::extensions.geography,
   40234, 'America/New_York'),                                            -- Knoxville, ~160 mi, 25 mi radius
  ('5eed0008-0000-0000-0000-000000000008',
   'IGP and Mondioring out of Louisville — decoy certified in both. I like a serious dog and an honest handler; sport first, ego last.',
   14, extensions.st_setsrid(extensions.st_makepoint(-85.7585, 38.2527), 4326)::extensions.geography,
   160934, 'America/Kentucky/Louisville'),                                -- Louisville, ~150 mi, 100 mi radius
  ('5eed0009-0000-0000-0000-000000000009',
   'Memphis sport-dog club trainer: nosework trials, agility foundations, competition obedience. High-drive dogs that need a job are my favorite students.',
   8, extensions.st_setsrid(extensions.st_makepoint(-90.0490, 35.1495), 4326)::extensions.geography,
   40234, 'America/Chicago'),                                             -- Memphis, ~197 mi, 25 mi radius
  ('5eed0010-0000-0000-0000-000000000010',
   'Atlanta protection-sport trainer, PSA judge''s apprentice. Serious aggression rehab taken case-by-case with muzzle-first protocols and full transparency.',
   18, extensions.st_setsrid(extensions.st_makepoint(-84.3880, 33.7490), 4326)::extensions.geography,
   160934, 'America/New_York'),                                           -- Atlanta, ~215 mi, 100 mi radius
  -- Edge row 1: NULL display_name, everything else complete
  ('5eed0011-0000-0000-0000-000000000011',
   'Agility handling and puppy sports foundations in Hendersonville. Weekend classes on a full competition course.',
   4, extensions.st_setsrid(extensions.st_makepoint(-86.6200, 36.3048), 4326)::extensions.geography,
   16093, 'America/Chicago'),                                             -- Hendersonville, ~15 mi, 10 mi radius
  -- Edge row 2: NULL service_point — never appears in proximity results
  ('5eed0012-0000-0000-0000-000000000012',
   'Recently relocated to Tennessee and rebuilding my practice — obedience and service-dog work. Location listing coming soon.',
   5, null, null, 'America/Chicago')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. specialty assignments — all 17 enum values covered across the roster
-- ----------------------------------------------------------------------------
insert into public.trainer_specialty_assignments (trainer_id, specialty)
values
  ('5eed0001-0000-0000-0000-000000000001', 'protection_sport_psa'),
  ('5eed0001-0000-0000-0000-000000000001', 'decoy_work'),
  ('5eed0001-0000-0000-0000-000000000001', 'personal_protection'),
  ('5eed0002-0000-0000-0000-000000000002', 'puppy'),
  ('5eed0002-0000-0000-0000-000000000002', 'basic_obedience'),
  ('5eed0002-0000-0000-0000-000000000002', 'behavioral'),
  ('5eed0003-0000-0000-0000-000000000003', 'protection_sport_schutzhund_igp'),
  ('5eed0003-0000-0000-0000-000000000003', 'tracking'),
  ('5eed0003-0000-0000-0000-000000000003', 'competition_obedience'),
  ('5eed0004-0000-0000-0000-000000000004', 'reactivity'),
  ('5eed0004-0000-0000-0000-000000000004', 'aggression'),
  ('5eed0004-0000-0000-0000-000000000004', 'behavioral'),
  ('5eed0005-0000-0000-0000-000000000005', 'gun_dog'),
  ('5eed0005-0000-0000-0000-000000000005', 'scent_work'),
  ('5eed0005-0000-0000-0000-000000000005', 'tracking'),
  ('5eed0006-0000-0000-0000-000000000006', 'protection_sport_french_ring'),
  ('5eed0006-0000-0000-0000-000000000006', 'decoy_work'),
  ('5eed0007-0000-0000-0000-000000000007', 'service_dog'),
  ('5eed0007-0000-0000-0000-000000000007', 'basic_obedience'),
  ('5eed0008-0000-0000-0000-000000000008', 'protection_sport_schutzhund_igp'),
  ('5eed0008-0000-0000-0000-000000000008', 'protection_sport_mondio_ring'),
  ('5eed0008-0000-0000-0000-000000000008', 'decoy_work'),
  ('5eed0009-0000-0000-0000-000000000009', 'scent_work'),
  ('5eed0009-0000-0000-0000-000000000009', 'agility'),
  ('5eed0009-0000-0000-0000-000000000009', 'competition_obedience'),
  ('5eed0010-0000-0000-0000-000000000010', 'protection_sport_psa'),
  ('5eed0010-0000-0000-0000-000000000010', 'personal_protection'),
  ('5eed0010-0000-0000-0000-000000000010', 'aggression'),
  ('5eed0011-0000-0000-0000-000000000011', 'agility'),
  ('5eed0011-0000-0000-0000-000000000011', 'puppy'),
  ('5eed0012-0000-0000-0000-000000000012', 'basic_obedience'),
  ('5eed0012-0000-0000-0000-000000000012', 'service_dog')
on conflict (trainer_id, specialty) do nothing;
