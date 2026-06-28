-- ============================================================================
-- M8 messaging test fixture — idempotent setup
-- ============================================================================
-- Participants of the thread-under-test:
--   owner_a    = 11111111-…  (role=owner)    — thread participant
--   trainer_a  = 22222222-…  (role=trainer)  — thread participant
-- Outsiders (real non-participants, so RLS-exclusion cases exclude something):
--   trainer_b  = 33333333-…  (role=trainer)  — a trainer NOT in the thread
--   owner_c    = 88888888-…  (role=owner)    — an owner NOT in the thread
-- Supporting (for the optional booking_id association, A6):
--   dog Rex    = 44444444-…  (owner_a's)
--   service_a  = 55555555-…  (trainer_a's, $120/60min)
--   booking_ab = bbbbbbbb-…  (owner_a + trainer_a, future PENDING)
--
-- Threads/messages are created per-case inside BEGIN/ROLLBACK; the fixture only
-- supplies the principals + one booking. Idempotent: DELETE-then-INSERT in FK
-- dependency order. auth.users DELETE cascades to public.profiles.
-- ============================================================================

\set QUIET on

-- Tear down (children before parents).
delete from public.messages where thread_id in (
  select id from public.message_threads
  where owner_id in ('11111111-1111-1111-1111-111111111111','88888888-8888-8888-8888-888888888888')
     or trainer_id in ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333'));
delete from public.message_threads
  where owner_id in ('11111111-1111-1111-1111-111111111111','88888888-8888-8888-8888-888888888888')
     or trainer_id in ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');

delete from public.bookings where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
delete from public.trainer_services where id = '55555555-5555-5555-5555-555555555555';
delete from public.dogs where id = '44444444-4444-4444-4444-444444444444';
delete from public.trainers where id in (
  '22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '88888888-8888-8888-8888-888888888888');

-- Build (parents before children).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        is_super_admin, confirmation_token, email_change,
                        email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111111',
   'authenticated','authenticated','owner-a@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-2222-2222-222222222222',
   'authenticated','authenticated','trainer-a@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','33333333-3333-3333-3333-333333333333',
   'authenticated','authenticated','trainer-b@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','88888888-8888-8888-8888-888888888888',
   'authenticated','authenticated','owner-c@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,false,'','','','');
-- M1's handle_new_user trigger creates matching public.profiles rows.

insert into public.trainers (id, timezone) values
  ('22222222-2222-2222-2222-222222222222','America/New_York'),
  ('33333333-3333-3333-3333-333333333333','America/New_York');

insert into public.dogs (id, owner_id, name) values
  ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','Rex');

insert into public.trainer_services
  (id, trainer_id, name, session_type, price_cents, duration_minutes)
values
  ('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222',
   'Basic obedience','in_home',12000,60);

-- One valid booking (owner_a + trainer_a) for the optional booking_id link (A6).
insert into public.bookings (id, owner_id, trainer_id, dog_id, service_id,
                              starts_at, duration_minutes, price_cents,
                              stripe_payment_intent_id)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
        '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',
        now() + interval '24 hours', 60, 12000, 'pi_m8_fixture');

\echo
\echo === M8 fixture loaded ===
select 'profiles' as t, count(*) from public.profiles
  where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
               '33333333-3333-3333-3333-333333333333','88888888-8888-8888-8888-888888888888')
union all select 'trainers', count(*) from public.trainers
  where id in ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333')
union all select 'bookings', count(*) from public.bookings
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
