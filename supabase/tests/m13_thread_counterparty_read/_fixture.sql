-- ============================================================================
-- M13 thread-counterparty-read test fixture — idempotent setup
-- ============================================================================
-- Principals (d*-prefixed anchors — verified free of overlap with the
-- M6/M8/M9/M10/M11/M12 fixtures and the seed):
--   owner_d    = d1111111-…  role=owner    'Owner Dee' — the inquirer
--   trainer_d  = d2222222-…  role=trainer  'Trainer Dee' — the thread
--                counterparty; LISTABLE (name + SEATTLE service_point) so
--                the anon directory case reads the exact production shape
--   trainer_e  = d3333333-…  role=trainer  'Trainer Ess' — NO thread with
--                owner_d: the category-A negative control (also the
--                trainer_id target for the A5 no-recursion INSERT)
--
-- Geography: trainer_d sits in SEATTLE — ~1,100 mi from M11's Denver
-- anchors and ~2,000+ mi from the east-coast seed roster, so the anon
-- nearby_trainers assertion sees exactly one row no matter which other
-- fixtures have run in this database.
--
-- NO bookings, dogs, or services: threads are freestanding (M8) — that is
-- the entire point of this migration. Threads are created PER CASE inside
-- BEGIN/ROLLBACK. Idempotent: DELETE-then-INSERT in FK order (auth.users
-- cascades profiles; message_threads carries RESTRICT FKs so it goes first).
-- ============================================================================

\set QUIET on

delete from public.messages where thread_id in (
  select id from public.message_threads
  where owner_id = 'd1111111-1111-1111-1111-111111111111');
delete from public.message_threads
  where owner_id = 'd1111111-1111-1111-1111-111111111111';
delete from public.trainers where id in (
  'd2222222-2222-2222-2222-222222222222','d3333333-3333-3333-3333-333333333333');
delete from auth.users where id in (
  'd1111111-1111-1111-1111-111111111111',
  'd2222222-2222-2222-2222-222222222222',
  'd3333333-3333-3333-3333-333333333333');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        is_super_admin, confirmation_token, email_change,
                        email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','d1111111-1111-1111-1111-111111111111',
   'authenticated','authenticated','m13-owner-d@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','d2222222-2222-2222-2222-222222222222',
   'authenticated','authenticated','m13-trainer-d@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','d3333333-3333-3333-3333-333333333333',
   'authenticated','authenticated','m13-trainer-e@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','','');

update public.profiles set display_name = v.n from (values
  ('d1111111-1111-1111-1111-111111111111'::uuid,'Owner Dee'),
  ('d2222222-2222-2222-2222-222222222222'::uuid,'Trainer Dee'),
  ('d3333333-3333-3333-3333-333333333333'::uuid,'Trainer Ess')
) as v(id, n) where profiles.id = v.id;

insert into public.trainers (id, bio, service_point, service_radius_meters, timezone) values
  ('d2222222-2222-2222-2222-222222222222','M13 Seattle anchor.',
   'SRID=4326;POINT(-122.3321 47.6062)', 40234, 'America/Los_Angeles'),
  ('d3333333-3333-3333-3333-333333333333','M13 no-thread stranger.', null, null, 'America/Chicago');

\echo
\echo === M13 fixture loaded ===
select 'profiles' t, count(*) from public.profiles where id::text like 'd_______-%'
union all select 'trainers', count(*) from public.trainers where id::text like 'd_______-%';
