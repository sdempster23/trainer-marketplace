-- ============================================================================
-- M9 read-state test fixture — idempotent setup
-- ============================================================================
-- Read-state (per-participant last_read timestamps) needs only principals — no
-- dog/service/booking (unlike M8, whose A6 exercised the optional booking link).
--
-- Participants of the thread-under-test:
--   owner_a    = 11111111-…  (role=owner)    — thread participant
--   trainer_a  = 22222222-…  (role=trainer)  — thread participant
-- Outsiders (real non-participants, so the RLS-exclusion case excludes someone):
--   trainer_b  = 33333333-…  (role=trainer)  — a trainer NOT in the thread
--   owner_c    = 88888888-…  (role=owner)    — an owner NOT in the thread
--
-- Same UUID anchors as the M8 fixture (deliberate — these suites run against
-- their own fresh reset, never co-loaded; see the migrations-journal note on
-- per-migration fixtures). Threads are created per-case inside BEGIN/ROLLBACK.
-- Idempotent: DELETE-then-INSERT in FK dependency order. auth.users DELETE
-- cascades to public.profiles.
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

\echo
\echo === M9 fixture loaded ===
select 'profiles' as t, count(*) from public.profiles
  where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
               '33333333-3333-3333-3333-333333333333','88888888-8888-8888-8888-888888888888')
union all select 'trainers', count(*) from public.trainers
  where id in ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');
