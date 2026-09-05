-- ============================================================================
-- M20 analytics_events — grants, RLS, CHECK, once-per-user, SET NULL
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === A1: RLS on; append-only (no updated_at column) ===
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'analytics_events' and c.relrowsecurity
  ) then
    raise exception 'A1 FAIL | RLS not enabled';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_events'
      and column_name = 'updated_at'
  ) then
    raise exception 'A1 FAIL | updated_at present — events are facts, not mutable rows';
  end if;
  raise notice 'A1 PASS | RLS enabled; no updated_at';
end $$;

\echo
\echo === A2: grant matrix (anon {}, authenticated {}, service_role INSERT) ===
do $$
declare p text; fails int := 0;
begin
  foreach p in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if has_table_privilege('anon', 'public.analytics_events', p) then
      raise warning 'A2 STRAY | anon %', p; fails := fails + 1;
    end if;
    if has_table_privilege('authenticated', 'public.analytics_events', p) then
      raise warning 'A2 STRAY | authenticated %', p; fails := fails + 1;
    end if;
  end loop;
  if not has_table_privilege('service_role', 'public.analytics_events', 'INSERT') then
    raise warning 'A2 MISSING | service_role INSERT'; fails := fails + 1;
  end if;
  foreach p in array array['SELECT','UPDATE','DELETE'] loop
    if has_table_privilege('service_role', 'public.analytics_events', p) then
      raise warning 'A2 STRAY | service_role %', p; fails := fails + 1;
    end if;
  end loop;
  if fails = 0 then
    raise notice 'A2 PASS | anon {}; authenticated {}; service_role INSERT only';
  else
    raise exception 'A2 FAIL | % problems', fails;
  end if;
end $$;

\echo
\echo === A3: anon INSERT denied ===
begin;
set local role anon;
do $$
begin
  begin
    insert into public.analytics_events (event_name) values ('search');
    raise exception 'A3 FAIL | anon inserted';
  exception when insufficient_privilege then
    raise notice 'A3 PASS | anon INSERT 42501';
  end;
end $$;
rollback;

\echo
\echo === A4: authenticated INSERT denied (the abuse path) ===
begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"a20e0001-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    insert into public.analytics_events (event_name) values ('booking_request');
    raise exception 'A4 FAIL | authenticated inserted';
  exception when insufficient_privilege then
    raise notice 'A4 PASS | authenticated INSERT 42501';
  end;
end $$;
rollback;

\echo
\echo === A5: service_role INSERT of a legal event succeeds ===
begin;
set local role service_role;
insert into public.analytics_events (event_name, props)
  values ('search', '{"zip":"37203","result_count":0}'::jsonb);
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.analytics_events
    where event_name = 'search' and props->>'zip' = '37203';
  if n = 1 then
    raise notice 'A5 PASS | service_role inserted a search event';
  else
    raise exception 'A5 FAIL | expected 1 row, got %', n;
  end if;
end $$;
rollback;

\echo
\echo === A6: unknown event_name rejected ===
begin;
do $$
begin
  begin
    insert into public.analytics_events (event_name) values ('booking_confirmed');
    raise exception 'A6 FAIL | booking_confirmed accepted';
  exception when check_violation then
    raise notice 'A6 PASS | unknown event_name rejected (CHECK) — booking_confirmed is out of scope';
  end;
end $$;
rollback;

\echo
\echo === A7: trainer_signup is once-per-user ===
begin;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'a20e0001-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'm20-trainer@test.local', '',
  now(), now(), now(), '{}'::jsonb, '{"role":"trainer"}'::jsonb, false,
  '', '', '', ''
);
insert into public.analytics_events (event_name, user_id)
  values ('trainer_signup', 'a20e0001-0000-0000-0000-000000000001');
do $$
begin
  begin
    insert into public.analytics_events (event_name, user_id)
      values ('trainer_signup', 'a20e0001-0000-0000-0000-000000000001');
    raise exception 'A7 FAIL | second trainer_signup accepted';
  exception when unique_violation then
    raise notice 'A7 PASS | second trainer_signup is 23505 (idempotent upsert backstop)';
  end;
end $$;
rollback;

\echo
\echo === A8: search may repeat for the same user ===
begin;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'a20e0002-0000-0000-0000-000000000002',
  'authenticated', 'authenticated', 'm20-owner@test.local', '',
  now(), now(), now(), '{}'::jsonb, '{"role":"owner"}'::jsonb, false,
  '', '', '', ''
);
insert into public.analytics_events (event_name, user_id)
  values ('search', 'a20e0002-0000-0000-0000-000000000002');
insert into public.analytics_events (event_name, user_id)
  values ('search', 'a20e0002-0000-0000-0000-000000000002');
do $$
declare n int;
begin
  select count(*) into n from public.analytics_events
    where user_id = 'a20e0002-0000-0000-0000-000000000002' and event_name = 'search';
  if n = 2 then
    raise notice 'A8 PASS | two search events for one user';
  else
    raise exception 'A8 FAIL | expected 2, got %', n;
  end if;
end $$;
rollback;

\echo
\echo === A9: profile delete SET NULLs user_id ===
begin;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'a20e0003-0000-0000-0000-000000000003',
  'authenticated', 'authenticated', 'm20-delete@test.local', '',
  now(), now(), now(), '{}'::jsonb, '{"role":"trainer"}'::jsonb, false,
  '', '', '', ''
);
insert into public.analytics_events (event_name, user_id)
  values ('trainer_signup', 'a20e0003-0000-0000-0000-000000000003');
-- Deleting the profile (CASCADE from auth.users) must keep the event and
-- drop the person. SET NULL, not CASCADE-delete the fact.
delete from auth.users where id = 'a20e0003-0000-0000-0000-000000000003';
do $$
declare r record;
begin
  select user_id, event_name into r from public.analytics_events
    where event_name = 'trainer_signup'
    order by created_at desc limit 1;
  if r.event_name = 'trainer_signup' and r.user_id is null then
    raise notice 'A9 PASS | event survives; user_id is NULL';
  else
    raise exception 'A9 FAIL | user_id=% event=%', r.user_id, r.event_name;
  end if;
end $$;
rollback;

\echo
\echo === A10: authenticated SELECT denied ===
begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"a20e0001-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform 1 from public.analytics_events;
    raise exception 'A10 FAIL | authenticated selected';
  exception when insufficient_privilege then
    raise notice 'A10 PASS | authenticated SELECT 42501';
  end;
end $$;
rollback;

\echo
\echo === M20 suite complete (10 checks) ===
