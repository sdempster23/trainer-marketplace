-- ============================================================================
-- M15 feed-tokens suite fixture
-- ============================================================================
-- feed****-prefixed UUIDs, unique to this suite (collision-checked against
-- every other fixture's anchors). Cleanup-first so re-runs are idempotent.
--
-- Booking rows are seeded via the trigger-disable convention (the M12
-- fixture's pattern) — §9 requires starts_at 15+ minutes in the future and
-- PENDING entry, so aged/status rows cannot be built through the legal
-- path. display_name is set explicitly: handle_new_user copies ONLY role
-- from signup metadata (probe finding, M15 journal).
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

delete from public.trainer_feed_tokens
  where trainer_id in ('feed0002-0000-0000-0000-000000000002',
                       'feed0003-0000-0000-0000-000000000003');
delete from public.bookings
  where owner_id = 'feed0001-0000-0000-0000-000000000001';
delete from public.trainer_services
  where id = 'feed0005-0000-0000-0000-000000000005';
delete from public.dogs
  where id = 'feed0004-0000-0000-0000-000000000004';
delete from public.trainers
  where id in ('feed0002-0000-0000-0000-000000000002',
               'feed0003-0000-0000-0000-000000000003');
delete from auth.users
  where id in ('feed0001-0000-0000-0000-000000000001',
               'feed0002-0000-0000-0000-000000000002',
               'feed0003-0000-0000-0000-000000000003');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        is_super_admin, confirmation_token, email_change,
                        email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','feed0001-0000-0000-0000-000000000001',
   'authenticated','authenticated','feed-owner@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','feed0002-0000-0000-0000-000000000002',
   'authenticated','authenticated','feed-trainer-a@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','feed0003-0000-0000-0000-000000000003',
   'authenticated','authenticated','feed-trainer-b@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','','');

-- handle_new_user copies only role; names are app-set (probe finding)
update public.profiles set display_name = 'Feed Owner'
  where id = 'feed0001-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Feed Trainer A'
  where id = 'feed0002-0000-0000-0000-000000000002';

insert into public.trainers (id, timezone) values
  ('feed0002-0000-0000-0000-000000000002','America/Chicago'),
  ('feed0003-0000-0000-0000-000000000003','America/Chicago');

insert into public.dogs (id, owner_id, name) values
  ('feed0004-0000-0000-0000-000000000004',
   'feed0001-0000-0000-0000-000000000001','Rex');

insert into public.trainer_services
  (id, trainer_id, name, session_type, price_cents, duration_minutes)
values
  ('feed0005-0000-0000-0000-000000000005','feed0002-0000-0000-0000-000000000002',
   'Basic obedience','in_home',12000,60);

-- Aged/status bookings: trigger-disable convention (see header)
alter table public.bookings disable trigger trg_bookings_validate_insert;
alter table public.bookings disable trigger trg_bookings_validate_update;
insert into public.bookings
  (id, owner_id, trainer_id, dog_id, service_id,
   starts_at, duration_minutes, price_cents, status, cancelled_at, cancelled_by)
values
  -- future PENDING
  ('feed0006-0000-0000-0000-000000000006','feed0001-0000-0000-0000-000000000001',
   'feed0002-0000-0000-0000-000000000002','feed0004-0000-0000-0000-000000000004',
   'feed0005-0000-0000-0000-000000000005',
   now() + interval '3 days', 60, 12000, 'PENDING', null, null),
  -- future CONFIRMED
  ('feed0007-0000-0000-0000-000000000007','feed0001-0000-0000-0000-000000000001',
   'feed0002-0000-0000-0000-000000000002','feed0004-0000-0000-0000-000000000004',
   'feed0005-0000-0000-0000-000000000005',
   now() + interval '7 days', 60, 12000, 'CONFIRMED', null, null),
  -- 10 days ago, CANCELLED — IN window (ruling 1: cancelled events render)
  ('feed0008-0000-0000-0000-000000000008','feed0001-0000-0000-0000-000000000001',
   'feed0002-0000-0000-0000-000000000002','feed0004-0000-0000-0000-000000000004',
   'feed0005-0000-0000-0000-000000000005',
   now() - interval '10 days', 60, 12000, 'CANCELLED',
   now() - interval '11 days', 'owner'),
  -- 70 days ago, CANCELLED — OUT of the 60-day window
  ('feed0009-0000-0000-0000-000000000009','feed0001-0000-0000-0000-000000000001',
   'feed0002-0000-0000-0000-000000000002','feed0004-0000-0000-0000-000000000004',
   'feed0005-0000-0000-0000-000000000005',
   now() - interval '70 days', 60, 12000, 'CANCELLED',
   now() - interval '71 days', 'owner');
alter table public.bookings enable trigger trg_bookings_validate_insert;
alter table public.bookings enable trigger trg_bookings_validate_update;

\echo
\echo === M15 fixture loaded ===
select 'profiles' as t, count(*) from public.profiles
  where id::text like 'feed%'
union all select 'trainers', count(*) from public.trainers
  where id::text like 'feed%'
union all select 'bookings', count(*) from public.bookings
  where owner_id = 'feed0001-0000-0000-0000-000000000001';
