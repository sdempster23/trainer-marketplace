-- ============================================================================
-- M11 booking-enablers test fixture — idempotent setup
-- ============================================================================
-- Principals (b*-prefixed anchors — no overlap with M6/M8/M9/M10 fixtures):
--   owner_b    = b1111111-…  role=owner    — the booking owner (has a dog)
--   trainer_b  = b2222222-…  role=trainer  — the booked trainer (has a service)
--   owner_c    = b3333333-…  role=owner    — STRANGER owner: no booking with
--                anyone, the category-B negative control
--   dog_b      = b4444444-…  owner_b's active dog (trigger G1 target)
--   service_b  = b5555555-…  trainer_b's active service (60 min, $50)
--
-- Category-D geography: three located trainers near DENVER — deliberately
-- ~1000 mi from every seed trainer (the seed loads on db reset), so
-- pagination assertions see exactly these three:
--   t_den0 = b6666666-…  downtown Denver          (0 mi from the test point)
--   t_den2 = b7777777-…  ~2 mi east
--   t_den7 = b8888888-…  ~7.5 mi east
--
-- Bookings are created PER CASE inside BEGIN/ROLLBACK. Idempotent:
-- DELETE-then-INSERT in FK order (auth.users cascades profiles).
-- ============================================================================

\set QUIET on

delete from public.bookings where owner_id = 'b1111111-1111-1111-1111-111111111111';
delete from public.dogs where id = 'b4444444-4444-4444-4444-444444444444';
delete from public.trainer_services where id = 'b5555555-5555-5555-5555-555555555555';
delete from public.trainers where id in (
  'b2222222-2222-2222-2222-222222222222','b6666666-6666-6666-6666-666666666666',
  'b7777777-7777-7777-7777-777777777777','b8888888-8888-8888-8888-888888888888');
delete from auth.users where id in (
  'b1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222',
  'b3333333-3333-3333-3333-333333333333','b6666666-6666-6666-6666-666666666666',
  'b7777777-7777-7777-7777-777777777777','b8888888-8888-8888-8888-888888888888');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        is_super_admin, confirmation_token, email_change,
                        email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','b1111111-1111-1111-1111-111111111111',
   'authenticated','authenticated','m11-owner-b@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','b2222222-2222-2222-2222-222222222222',
   'authenticated','authenticated','m11-trainer-b@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','b3333333-3333-3333-3333-333333333333',
   'authenticated','authenticated','m11-owner-c@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','b6666666-6666-6666-6666-666666666666',
   'authenticated','authenticated','m11-den0@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','b7777777-7777-7777-7777-777777777777',
   'authenticated','authenticated','m11-den2@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','b8888888-8888-8888-8888-888888888888',
   'authenticated','authenticated','m11-den7@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','','');

update public.profiles set display_name = v.n from (values
  ('b1111111-1111-1111-1111-111111111111'::uuid,'Owner Bee'),
  ('b2222222-2222-2222-2222-222222222222'::uuid,'Trainer Bee'),
  ('b3333333-3333-3333-3333-333333333333'::uuid,'Owner Cee'),
  ('b6666666-6666-6666-6666-666666666666'::uuid,'Denver Zero'),
  ('b7777777-7777-7777-7777-777777777777'::uuid,'Denver Two'),
  ('b8888888-8888-8888-8888-888888888888'::uuid,'Denver Seven')
) as v(id, n) where profiles.id = v.id;

insert into public.trainers (id, bio, service_point, service_radius_meters, timezone) values
  ('b2222222-2222-2222-2222-222222222222','M11 booked trainer.', null, null, 'America/Chicago'),
  ('b6666666-6666-6666-6666-666666666666','Denver anchor.',
   'SRID=4326;POINT(-104.9903 39.7392)', 40234, 'America/Denver'),
  ('b7777777-7777-7777-7777-777777777777','Two miles east.',
   'SRID=4326;POINT(-104.9520 39.7392)', 40234, 'America/Denver'),
  ('b8888888-8888-8888-8888-888888888888','Seven-ish miles east.',
   'SRID=4326;POINT(-104.8500 39.7392)', 40234, 'America/Denver');

insert into public.dogs (id, owner_id, name)
values ('b4444444-4444-4444-4444-444444444444','b1111111-1111-1111-1111-111111111111','Bixby');

insert into public.trainer_services (id, trainer_id, name, session_type, price_cents, duration_minutes)
values ('b5555555-5555-5555-5555-555555555555','b2222222-2222-2222-2222-222222222222',
        'M11 session','virtual', 5000, 60);

\echo
\echo === M11 fixture loaded ===
select 'profiles' t, count(*) from public.profiles where id::text like 'b_______-%'
union all select 'trainers', count(*) from public.trainers where id::text like 'b_______-%'
union all select 'dogs', count(*) from public.dogs where id::text like 'b_______-%'
union all select 'services', count(*) from public.trainer_services where id::text like 'b_______-%';
