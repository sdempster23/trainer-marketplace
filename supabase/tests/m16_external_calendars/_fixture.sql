-- ============================================================================
-- M16 external-calendars suite fixture
-- ============================================================================
-- ec16****-prefixed UUIDs, unique to this suite. Cleanup-first, idempotent.
-- One future CONFIRMED booking for trainer A (trigger-disable convention)
-- gives the union cases a booking arm; subscriptions/blocks are minted
-- in-case via the M16 functions themselves.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

delete from public.trainer_external_calendars
  where trainer_id in ('ec160002-0000-0000-0000-000000000002',
                       'ec160003-0000-0000-0000-000000000003');
delete from public.bookings
  where owner_id = 'ec160001-0000-0000-0000-000000000001';
delete from public.trainer_services
  where id = 'ec160005-0000-0000-0000-000000000005';
delete from public.dogs
  where id = 'ec160004-0000-0000-0000-000000000004';
delete from public.trainers
  where id in ('ec160002-0000-0000-0000-000000000002',
               'ec160003-0000-0000-0000-000000000003');
delete from auth.users
  where id in ('ec160001-0000-0000-0000-000000000001',
               'ec160002-0000-0000-0000-000000000002',
               'ec160003-0000-0000-0000-000000000003');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        is_super_admin, confirmation_token, email_change,
                        email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','ec160001-0000-0000-0000-000000000001',
   'authenticated','authenticated','m16-owner@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','ec160002-0000-0000-0000-000000000002',
   'authenticated','authenticated','m16-trainer-a@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','ec160003-0000-0000-0000-000000000003',
   'authenticated','authenticated','m16-trainer-b@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','','');

insert into public.trainers (id, timezone) values
  ('ec160002-0000-0000-0000-000000000002','America/Chicago'),
  ('ec160003-0000-0000-0000-000000000003','America/Chicago');

insert into public.dogs (id, owner_id, name) values
  ('ec160004-0000-0000-0000-000000000004',
   'ec160001-0000-0000-0000-000000000001','Rex');

insert into public.trainer_services
  (id, trainer_id, name, session_type, price_cents, duration_minutes)
values
  ('ec160005-0000-0000-0000-000000000005','ec160002-0000-0000-0000-000000000002',
   'Basic obedience','in_home',12000,60);

alter table public.bookings disable trigger trg_bookings_validate_insert;
insert into public.bookings
  (id, owner_id, trainer_id, dog_id, service_id,
   starts_at, duration_minutes, price_cents, status)
values
  ('ec160006-0000-0000-0000-000000000006','ec160001-0000-0000-0000-000000000001',
   'ec160002-0000-0000-0000-000000000002','ec160004-0000-0000-0000-000000000004',
   'ec160005-0000-0000-0000-000000000005',
   now() + interval '2 days', 60, 12000, 'CONFIRMED');
alter table public.bookings enable trigger trg_bookings_validate_insert;

\echo
\echo === M16 fixture loaded ===
select 'trainers' as t, count(*) from public.trainers
  where id::text like 'ec16%'
union all select 'bookings', count(*) from public.bookings
  where owner_id = 'ec160001-0000-0000-0000-000000000001';
