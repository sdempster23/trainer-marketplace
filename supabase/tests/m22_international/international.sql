\set ON_ERROR_STOP on
begin;
set local role postgres;
set local request.jwt.claims = '';

-- Expected pre-migration failure, before fixture writes.
select country_code, postal_area from public.trainers limit 0;
select currency from public.trainer_services limit 0;
select currency from public.bookings limit 0;

-- A border cluster: 51 nearer US trainers must not crowd out Canadian results.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
select ('22a00000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'm22-' || n || '@test.local', '{"role":"trainer"}'::jsonb
from generate_series(1, 55) n;
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values ('22a00000-0000-0000-0000-000000000099',
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'm22-99@test.local', '{"role":"owner"}'::jsonb);
update public.profiles set display_name = 'M22 trainer'
where id::text like '22a00000-%' and role = 'trainer';

insert into public.trainers (id, country_code, postal_area, service_point, timezone)
select ('22a00000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'US', '98230', 'SRID=4326;POINT(-122.75 48.99)', 'America/Los_Angeles'
from generate_series(1, 51) n;
insert into public.trainers (id, country_code, postal_area, service_point, timezone) values
 ('22a00000-0000-0000-0000-000000000052', 'CA', 'V4B', 'SRID=4326;POINT(-122.75 49.00)', 'America/Vancouver'),
 ('22a00000-0000-0000-0000-000000000053', 'CA', 'V4B', 'SRID=4326;POINT(-122.75 49.02)', 'America/Vancouver'),
 ('22a00000-0000-0000-0000-000000000054', 'GB', 'BT1', 'SRID=4326;POINT(-5.93 54.60)', 'Europe/London');
-- Old insert shapes remain valid, with no invented postal area.
insert into public.trainers (id, timezone)
values ('22a00000-0000-0000-0000-000000000055', 'America/Chicago');

set local role anon;
do $$
declare ids uuid[]; result record;
begin
 select array_agg(id order by distance_meters) into ids
 from public.nearby_trainers_v2(48.99, -122.75, 10000, 'CA');
 if ids is distinct from array['22a00000-0000-0000-0000-000000000052'::uuid,
                              '22a00000-0000-0000-0000-000000000053'::uuid]
 then raise exception 'M22 country filter/order before limit: %', ids; end if;
 select * into result from public.nearby_trainers_v2(48.99, -122.75, 2000, 'CA');
 if result.id is distinct from '22a00000-0000-0000-0000-000000000052'::uuid
    or result.country_code is distinct from 'CA' or result.postal_area is distinct from 'V4B'
    or result.distance_meters not between 1100 and 1125
    or result.lat is distinct from 49.00::double precision
    or result.lng is distinct from (-122.75)::double precision
 then raise exception 'M22 country/area/coordinate/meter result: %', result; end if;
 if (select count(*) from public.nearby_trainers_v2(48.99, -122.75, 10000)) <> 50
 then raise exception 'M22 default US/50 limit'; end if;
 if not exists(select 1 from public.nearby_trainers(48.99, -122.75, 10))
 then raise exception 'M22 legacy RPC lost'; end if;
 if not exists(select 1 from public.nearby_trainers_v2(54.60, -5.93, 1000, 'GB')
               where id = '22a00000-0000-0000-0000-000000000054')
 then raise exception 'M22 Northern Ireland result lost'; end if;
 raise notice 'PASS M22 anonymous border filtering, limit, order, meters, NI, old RPC';
end $$;
set local role postgres;
update public.profiles set deleted_at = now() where id = '22a00000-0000-0000-0000-000000000053';
set local role anon;
do $$ begin
 if exists(select 1 from public.nearby_trainers_v2(48.99, -122.75, 10000, 'CA')
           where id = '22a00000-0000-0000-0000-000000000053')
 then raise exception 'M22 RPC bypassed soft-delete RLS'; end if;
 raise notice 'PASS M22 soft-delete RLS';
end $$;
set local role postgres;

do $$
declare r text; fn regprocedure := 'public.nearby_trainers_v2(double precision,double precision,integer,text)'::regprocedure;
begin
 if exists(select 1 from pg_proc where oid = fn and (prosecdef or provolatile <> 's'
    or proconfig is distinct from array['search_path=""']))
 then raise exception 'M22 RPC security context changed'; end if;
 foreach r in array array['anon', 'authenticated', 'service_role'] loop
   if not has_function_privilege(r, fn, 'EXECUTE') then raise exception 'M22 RPC grant missing: %', r; end if;
   if has_function_privilege(r, 'public.trainer_services_validate_currency()', 'EXECUTE')
   then raise exception 'M22 trigger exposed to %', r; end if;
 end loop;
 if exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a where p.oid = fn and a.grantee = 0)
 then raise exception 'M22 RPC PUBLIC grant'; end if;
 if not exists(select 1 from public.trainers where id = '22a00000-0000-0000-0000-000000000055'
               and country_code = 'US' and postal_area is null and service_point is null)
 then raise exception 'M22 legacy trainer defaults'; end if;
 begin
   update public.trainers set country_code = 'AU' where id = '22a00000-0000-0000-0000-000000000055';
   raise exception 'M22 accepted unsupported country';
 exception when check_violation then null; end;
 begin
   update public.trainers set postal_area = 'V4B 1A1' where id = '22a00000-0000-0000-0000-000000000052';
   raise exception 'M22 stored full Canadian code';
 exception when check_violation then null; end;
 begin
   update public.trainers set postal_area = 'BT1 1AA' where id = '22a00000-0000-0000-0000-000000000054';
   raise exception 'M22 stored full UK code';
 exception when check_violation then null; end;
 raise notice 'PASS M22 catalog grants, country/area constraints, legacy defaults';
end $$;

-- Real trainer callers, so RLS and grants are exercised with the new fields.
set local role authenticated;
set local request.jwt.claims = '{"sub":"22a00000-0000-0000-0000-000000000052","role":"authenticated"}';
insert into public.trainer_services (id, trainer_id, name, session_type, price_cents, duration_minutes, currency)
values ('22a00000-0000-0000-0001-000000000052', '22a00000-0000-0000-0000-000000000052', 'Canadian service', 'in_home', 12000, 60, 'CAD');
do $$ begin
 begin
   insert into public.trainer_services (trainer_id, name, session_type, price_cents, duration_minutes, currency)
   values ('22a00000-0000-0000-0000-000000000052', 'Wrong currency', 'in_home', 12000, 60, 'USD');
   raise exception 'M22 service country/currency mismatch accepted';
 exception when check_violation then
   if sqlerrm not like 'Service currency % does not match trainer country %' then raise; end if;
 end;
 begin
   update public.trainer_services set currency = 'USD' where id = '22a00000-0000-0000-0001-000000000052';
   raise exception 'M22 service currency update accepted';
 exception when raise_exception then
   if sqlerrm <> 'Service currency is immutable' then raise; end if;
 end;
 raise notice 'PASS M22 CAD service and currency guards';
end $$;
set local request.jwt.claims = '{"sub":"22a00000-0000-0000-0000-000000000054","role":"authenticated"}';
insert into public.trainer_services (id, trainer_id, name, session_type, price_cents, duration_minutes, currency)
values ('22a00000-0000-0000-0001-000000000054', '22a00000-0000-0000-0000-000000000054', 'UK service', 'in_home', 8000, 45, 'GBP');
set local request.jwt.claims = '{"sub":"22a00000-0000-0000-0000-000000000055","role":"authenticated"}';
insert into public.trainer_services (id, trainer_id, name, session_type, price_cents, duration_minutes)
values ('22a00000-0000-0000-0001-000000000055', '22a00000-0000-0000-0000-000000000055', 'US service', 'in_home', 10000, 30);

set local request.jwt.claims = '{"sub":"22a00000-0000-0000-0000-000000000099","role":"authenticated"}';
insert into public.dogs (id, owner_id, name)
values ('22a00000-0000-0000-0002-000000000099', '22a00000-0000-0000-0000-000000000099', 'M22 Dog');
insert into public.bookings (id, owner_id, trainer_id, dog_id, service_id, starts_at, price_cents, duration_minutes, currency)
values
 ('22a00000-0000-0000-0003-000000000052', '22a00000-0000-0000-0000-000000000099', '22a00000-0000-0000-0000-000000000052',
  '22a00000-0000-0000-0002-000000000099', '22a00000-0000-0000-0001-000000000052', now()+interval '1 day', 12000, 60, 'CAD'),
 ('22a00000-0000-0000-0003-000000000054', '22a00000-0000-0000-0000-000000000099', '22a00000-0000-0000-0000-000000000054',
  '22a00000-0000-0000-0002-000000000099', '22a00000-0000-0000-0001-000000000054', now()+interval '2 days', 8000, 45, 'GBP');
insert into public.bookings (id, owner_id, trainer_id, dog_id, service_id, starts_at, price_cents, duration_minutes)
values ('22a00000-0000-0000-0003-000000000055', '22a00000-0000-0000-0000-000000000099', '22a00000-0000-0000-0000-000000000055',
 '22a00000-0000-0000-0002-000000000099', '22a00000-0000-0000-0001-000000000055', now()+interval '3 days', 10000, 30);
do $$ begin
 begin
   insert into public.bookings (owner_id, trainer_id, dog_id, service_id, starts_at, price_cents, duration_minutes, currency)
   values ('22a00000-0000-0000-0000-000000000099', '22a00000-0000-0000-0000-000000000052',
     '22a00000-0000-0000-0002-000000000099', '22a00000-0000-0000-0001-000000000052', now()+interval '4 days', 12000, 60, 'USD');
   raise exception 'M22 booking currency mismatch accepted';
 exception when check_violation then
   if sqlerrm not like 'currency % does not match service currency %' then raise; end if;
 end;
 begin
   update public.bookings set currency = 'USD' where id = '22a00000-0000-0000-0003-000000000052';
   raise exception 'M22 booking currency mutation accepted';
 exception when raise_exception then
   if sqlerrm <> 'currency is immutable' then raise; end if;
 end;
 if not exists(select 1 from public.bookings where id = '22a00000-0000-0000-0003-000000000055' and currency = 'USD')
 then raise exception 'M22 old booking default changed'; end if;
 raise notice 'PASS M22 CAD/GBP snapshots, USD compatibility, mismatch/immutability';
end $$;

-- Moving does not relabel old services or booking history. New services use GBP.
set local request.jwt.claims = '{"sub":"22a00000-0000-0000-0000-000000000052","role":"authenticated"}';
update public.trainers set country_code = 'GB', postal_area = 'SW1A',
 service_point = 'SRID=4326;POINT(-0.14 51.50)', timezone = 'Europe/London'
where id = '22a00000-0000-0000-0000-000000000052';
update public.trainer_services set price_cents = 15000, deleted_at = now()
where id = '22a00000-0000-0000-0001-000000000052';
insert into public.trainer_services (trainer_id, name, session_type, price_cents, duration_minutes, currency)
values ('22a00000-0000-0000-0000-000000000052', 'New UK service', 'in_home', 10000, 60, 'GBP');
do $$ begin
 if not exists(select 1 from public.trainer_services where id = '22a00000-0000-0000-0001-000000000052'
               and currency = 'CAD' and price_cents = 15000 and deleted_at is not null)
    or not exists(select 1 from public.bookings where id = '22a00000-0000-0000-0003-000000000052'
                  and currency = 'CAD' and price_cents = 12000)
 then raise exception 'M22 move/reprice/retire changed historical currency or price'; end if;
 raise notice 'PASS M22 move/reprice/retire preserves currency and booking price';
end $$;
rollback;
