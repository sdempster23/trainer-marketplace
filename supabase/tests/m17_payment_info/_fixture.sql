-- ============================================================================
-- M17 payment-info suite fixture
-- ============================================================================
-- pay1****-prefixed anchors. A trainer with payment info, an owner WITH a
-- CONFIRMED booking (the reader), an owner WITHOUT any booking (the
-- anti-harvest control), and a PENDING-only owner (payment is CONFIRMED-only).
-- Booking rows via the trigger-disable convention.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

delete from public.trainer_payment_info where trainer_id = 'da170002-0000-0000-0000-000000000002';
delete from public.bookings where owner_id in ('da170001-0000-0000-0000-000000000001','da170007-0000-0000-0000-000000000007');
delete from public.trainer_services where id = 'da170005-0000-0000-0000-000000000005';
delete from public.dogs where id in ('da170004-0000-0000-0000-000000000004','da170008-0000-0000-0000-000000000008');
delete from public.trainers where id = 'da170002-0000-0000-0000-000000000002';
delete from auth.users where id in (
  'da170001-0000-0000-0000-000000000001','da170002-0000-0000-0000-000000000002',
  'da170003-0000-0000-0000-000000000003','da170007-0000-0000-0000-000000000007');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        is_super_admin, confirmation_token, email_change,
                        email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','da170002-0000-0000-0000-000000000002',
   'authenticated','authenticated','m17-trainer@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','da170001-0000-0000-0000-000000000001',
   'authenticated','authenticated','m17-owner-confirmed@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','da170003-0000-0000-0000-000000000003',
   'authenticated','authenticated','m17-owner-nobooking@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','da170007-0000-0000-0000-000000000007',
   'authenticated','authenticated','m17-owner-pending@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,false,'','','','');

insert into public.trainers (id, timezone) values
  ('da170002-0000-0000-0000-000000000002','America/Chicago');
insert into public.dogs (id, owner_id, name) values
  ('da170004-0000-0000-0000-000000000004','da170001-0000-0000-0000-000000000001','Rex'),
  ('da170008-0000-0000-0000-000000000008','da170007-0000-0000-0000-000000000007','Nova');
insert into public.trainer_services (id, trainer_id, name, session_type, price_cents, duration_minutes)
values ('da170005-0000-0000-0000-000000000005','da170002-0000-0000-0000-000000000002',
        'Class','in_home',9000,60);

alter table public.bookings disable trigger trg_bookings_validate_insert;
insert into public.bookings
  (id, owner_id, trainer_id, dog_id, service_id, starts_at, duration_minutes, price_cents, status)
values
  -- CONFIRMED booking → this owner may read payment
  ('da170006-0000-0000-0000-000000000006','da170001-0000-0000-0000-000000000001',
   'da170002-0000-0000-0000-000000000002','da170004-0000-0000-0000-000000000004',
   'da170005-0000-0000-0000-000000000005', now() + interval '2 days', 60, 9000, 'CONFIRMED'),
  -- PENDING only → this owner may NOT read payment yet
  ('da170009-0000-0000-0000-000000000009','da170007-0000-0000-0000-000000000007',
   'da170002-0000-0000-0000-000000000002','da170008-0000-0000-0000-000000000008',
   'da170005-0000-0000-0000-000000000005', now() + interval '3 days', 60, 9000, 'PENDING');
alter table public.bookings enable trigger trg_bookings_validate_insert;

-- The trainer's payment info (written directly here; the RLS write path is
-- exercised in category A).
insert into public.trainer_payment_info (trainer_id, instructions, venmo_handle, paypal_handle)
values ('da170002-0000-0000-0000-000000000002',
        'Venmo preferred, cash at the session works too', 'casey-trains', 'caseytrains');

\echo
\echo === M17 fixture loaded ===
select 'payment_rows' as t, count(*) from public.trainer_payment_info
  where trainer_id = 'da170002-0000-0000-0000-000000000002';
