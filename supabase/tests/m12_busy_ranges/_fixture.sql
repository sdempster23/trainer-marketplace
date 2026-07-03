-- ============================================================================
-- M12 busy-ranges test fixture — idempotent setup
-- ============================================================================
-- Principals (cc-anchors, no overlap with earlier fixtures):
--   owner_cc    = cc111111-…  role=owner    — the booking owner
--   trainer_cc  = cc222222-…  role=trainer  — the busy trainer under test
--   nonparty_cc = cc999999-…  role=owner    — the caller who must NOT see
--                 bookings directly but MUST get ranges via the function
--   dog_cc      = cc333333-…  owner_cc's dog
--   service_cc  = cc555555-…  trainer_cc's active 60-min service
-- Bookings are created PER CASE inside BEGIN/ROLLBACK (some via the M6
-- trigger-disable convention, to seed non-PENDING statuses and past rows).
-- ============================================================================

\set QUIET on

delete from public.bookings where trainer_id = 'cc222222-2222-4222-8222-222222222222';
delete from public.dogs where id = 'cc333333-3333-4333-8333-333333333333';
delete from public.trainer_services where id = 'cc555555-5555-4555-8555-555555555555';
delete from public.trainers where id = 'cc222222-2222-4222-8222-222222222222';
delete from auth.users where id in (
  'cc111111-1111-4111-8111-111111111111','cc222222-2222-4222-8222-222222222222',
  'cc999999-9999-4999-8999-999999999999');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        is_super_admin, confirmation_token, email_change,
                        email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','cc111111-1111-4111-8111-111111111111',
   'authenticated','authenticated','m12-owner@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','cc222222-2222-4222-8222-222222222222',
   'authenticated','authenticated','m12-trainer@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','cc999999-9999-4999-8999-999999999999',
   'authenticated','authenticated','m12-nonparty@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,false,'','','','');

insert into public.trainers (id, timezone)
values ('cc222222-2222-4222-8222-222222222222','America/Chicago');
insert into public.dogs (id, owner_id, name)
values ('cc333333-3333-4333-8333-333333333333','cc111111-1111-4111-8111-111111111111','Rex');
insert into public.trainer_services (id, trainer_id, name, session_type, price_cents, duration_minutes)
values ('cc555555-5555-4555-8555-555555555555','cc222222-2222-4222-8222-222222222222',
        'M12 session','virtual', 5000, 60);

\echo
\echo === M12 fixture loaded ===
select 'users' t, count(*) from auth.users where id::text like 'cc%'
union all select 'trainers', count(*) from public.trainers where id::text like 'cc%'
union all select 'dogs', count(*) from public.dogs where id::text like 'cc%'
union all select 'services', count(*) from public.trainer_services where id::text like 'cc%';
