-- Run only BEFORE M22 is installed, concatenated with M22 and upgrade_after.sql.
-- One transaction protects the existing local database and rolls back the DDL.
\set ON_ERROR_STOP on
begin;
set local role postgres;
set local request.jwt.claims = '';
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
 ('22b00000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'm22-old-trainer@test.local', '{"role":"trainer"}'),
 ('22b00000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'm22-old-owner@test.local', '{"role":"owner"}');
insert into public.trainers (id, service_point, timezone)
values ('22b00000-0000-0000-0000-000000000001', 'SRID=4326;POINT(-86.7816 36.1627)', 'America/Chicago');
insert into public.trainer_services (id, trainer_id, name, session_type, price_cents, duration_minutes)
values ('22b00000-0000-0000-0001-000000000001', '22b00000-0000-0000-0000-000000000001',
        'Legacy service', 'in_home', 12500, 60);
insert into public.dogs (id, owner_id, name)
values ('22b00000-0000-0000-0002-000000000002', '22b00000-0000-0000-0000-000000000002', 'Legacy dog');
insert into public.bookings (id, owner_id, trainer_id, dog_id, service_id, starts_at, price_cents, duration_minutes)
values ('22b00000-0000-0000-0003-000000000001', '22b00000-0000-0000-0000-000000000002',
        '22b00000-0000-0000-0000-000000000001', '22b00000-0000-0000-0002-000000000002',
        '22b00000-0000-0000-0001-000000000001', now()+interval '1 day', 12500, 60);
create temporary table m22_upgrade_baseline as
select 'trainer' as kind, to_jsonb(t) as row_data from public.trainers t
 where id = '22b00000-0000-0000-0000-000000000001'
union all select 'service', to_jsonb(s) from public.trainer_services s
 where id = '22b00000-0000-0000-0001-000000000001'
union all select 'booking', to_jsonb(b) from public.bookings b
 where id = '22b00000-0000-0000-0003-000000000001';
