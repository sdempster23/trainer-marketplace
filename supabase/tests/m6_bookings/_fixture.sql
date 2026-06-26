-- ============================================================================
-- M6 bookings test fixture — idempotent setup
-- ============================================================================
-- Anchored UUIDs used across all category files:
--   owner_a     = 11111111-1111-1111-1111-111111111111
--   trainer_a   = 22222222-2222-2222-2222-222222222222
--   trainer_b   = 33333333-3333-3333-3333-333333333333
--   dog (Rex)   = 44444444-4444-4444-4444-444444444444  (owned by owner_a)
--   service_a   = 55555555-5555-5555-5555-555555555555  (offered by trainer_a)
--   service_b   = 66666666-6666-6666-6666-666666666666  (offered by trainer_b)
--
-- All trainer_services: $120.00 (12000 cents), 60 minutes, in_home.
--
-- Idempotent: DELETE-then-INSERT in FK dependency order; safe to re-run.
-- auth.users DELETE cascades to public.profiles.
-- ============================================================================

\set QUIET on

-- Tear down (children before parents).
delete from public.bookings
  where owner_id   = '11111111-1111-1111-1111-111111111111'
     or trainer_id in ('22222222-2222-2222-2222-222222222222',
                       '33333333-3333-3333-3333-333333333333');

delete from public.trainer_services where id in (
  '55555555-5555-5555-5555-555555555555',
  '66666666-6666-6666-6666-666666666666'
);

delete from public.dogs where id = '44444444-4444-4444-4444-444444444444';

delete from public.trainers where id in (
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);

-- auth.users cascade -> public.profiles
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);

-- Build (parents before children).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        is_super_admin, confirmation_token, email_change,
                        email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111111',
   'authenticated','authenticated','owner-a@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,
   false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-2222-2222-222222222222',
   'authenticated','authenticated','trainer-a@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,
   false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','33333333-3333-3333-3333-333333333333',
   'authenticated','authenticated','trainer-b@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,
   false,'','','','');
-- M1's handle_new_user trigger creates matching public.profiles rows from
-- raw_user_meta_data.role.

insert into public.trainers (id, timezone) values
  ('22222222-2222-2222-2222-222222222222','America/New_York'),
  ('33333333-3333-3333-3333-333333333333','America/New_York');

insert into public.dogs (id, owner_id, name) values
  ('44444444-4444-4444-4444-444444444444',
   '11111111-1111-1111-1111-111111111111',
   'Rex');

insert into public.trainer_services
  (id, trainer_id, name, session_type, price_cents, duration_minutes)
values
  ('55555555-5555-5555-5555-555555555555',
   '22222222-2222-2222-2222-222222222222',
   'Basic obedience','in_home',12000,60),
  ('66666666-6666-6666-6666-666666666666',
   '33333333-3333-3333-3333-333333333333',
   'Basic obedience','in_home',12000,60);

\echo
\echo === Fixture loaded ===
select 'profiles'         as t, count(*) from public.profiles
  where id in ('11111111-1111-1111-1111-111111111111',
               '22222222-2222-2222-2222-222222222222',
               '33333333-3333-3333-3333-333333333333')
union all select 'trainers', count(*) from public.trainers
  where id in ('22222222-2222-2222-2222-222222222222',
               '33333333-3333-3333-3333-333333333333')
union all select 'dogs',     count(*) from public.dogs
  where id = '44444444-4444-4444-4444-444444444444'
union all select 'trainer_services', count(*) from public.trainer_services
  where id in ('55555555-5555-5555-5555-555555555555',
               '66666666-6666-6666-6666-666666666666');
