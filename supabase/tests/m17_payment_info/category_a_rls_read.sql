-- ============================================================================
-- Category A — booking-scoped read (the anti-harvest core)
-- ============================================================================
-- 5 cases, each with JWT-scoped role.
--
--   A1  trainer reads OWN payment row
--   A2  owner with a CONFIRMED booking reads the trainer's payment row
--   A3  owner with only a PENDING booking sees NOTHING (CONFIRMED-gated)
--   A4  owner with NO booking sees NOTHING (anti-harvest control)
--   A5  a DIFFERENT trainer cannot read this trainer's row
--
-- Acceptance: all 5 PASS.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === A1: trainer reads own payment row ===
begin;
select set_config('request.jwt.claims','{"sub":"da170002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r record;
begin
  select instructions, venmo_handle into r from public.trainer_payment_info
    where trainer_id = 'da170002-0000-0000-0000-000000000002';
  if r.venmo_handle = 'casey-trains' then
    raise notice 'A1 PASS | trainer reads own payment info';
  else
    raise exception 'A1 FAIL';
  end if;
end $$;
rollback;

\echo
\echo === A2: owner with a CONFIRMED booking reads the trainer's payment ===
begin;
select set_config('request.jwt.claims','{"sub":"da170001-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.trainer_payment_info
    where trainer_id = 'da170002-0000-0000-0000-000000000002';
  if n = 1 then
    raise notice 'A2 PASS | CONFIRMED-booking owner reads trainer payment (the render path)';
  else
    raise exception 'A2 FAIL | saw % rows', n;
  end if;
end $$;
rollback;

\echo
\echo === A3: PENDING-only owner sees nothing (payment is CONFIRMED-gated) ===
begin;
select set_config('request.jwt.claims','{"sub":"da170007-0000-0000-0000-000000000007","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.trainer_payment_info;
  if n = 0 then
    raise notice 'A3 PASS | PENDING-only owner sees zero (no payee relationship until CONFIRMED)';
  else
    raise exception 'A3 FAIL | leaked % rows to a pending-only owner', n;
  end if;
end $$;
rollback;

\echo
\echo === A4: no-booking owner sees nothing (anti-harvest control) ===
begin;
select set_config('request.jwt.claims','{"sub":"da170003-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.trainer_payment_info;
  if n = 0 then
    raise notice 'A4 PASS | a stranger authenticated owner harvests ZERO payment rows';
  else
    raise exception 'A4 FAIL | harvest leaked % rows', n;
  end if;
end $$;
rollback;

\echo
\echo === A5: a different trainer cannot read this trainer's row ===
begin;
-- mint a second trainer inside the case
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin,confirmation_token,email_change,email_change_token_new,recovery_token)
values ('00000000-0000-0000-0000-000000000000','da17000b-0000-0000-0000-00000000000b','authenticated','authenticated','m17-trainer-b@test.local','',now(),now(),now(),'{}','{"role":"trainer"}',false,'','','','');
insert into public.trainers (id,timezone) values ('da17000b-0000-0000-0000-00000000000b','America/Chicago');
select set_config('request.jwt.claims','{"sub":"da17000b-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.trainer_payment_info;
  if n = 0 then
    raise notice 'A5 PASS | a non-party trainer sees zero of another trainer''s payment';
  else
    raise exception 'A5 FAIL | cross-trainer leak % rows', n;
  end if;
end $$;
rollback;

\echo
\echo === Category A complete (5 cases) ===
