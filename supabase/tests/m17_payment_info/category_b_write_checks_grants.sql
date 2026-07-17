-- ============================================================================
-- Category B — write path, CHECK constraints, grant/catalog matrix
-- ============================================================================
-- 6 cases.
--
--   B1  trainer writes/updates OWN row (RLS write path)
--   B2  a trainer cannot write ANOTHER trainer's row (RLS WITH CHECK)
--   B3  bad venmo/paypal handle rejected (CHECK charset)
--   B4  over-280 instructions rejected (CHECK length)
--   B5  grant/anti-harvest matrix: anon {}, service_role DML {} (M14 pos),
--       authenticated SELECT/INSERT/UPDATE, NO DELETE
--   B6  updated_at trigger present; exactly 4 policies all to authenticated
--
-- Acceptance: all 6 PASS.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === B1: trainer writes + updates own row ===
begin;
select set_config('request.jwt.claims','{"sub":"da170002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
update public.trainer_payment_info set instructions = 'Zelle now too'
  where trainer_id = 'da170002-0000-0000-0000-000000000002';
do $$
declare r record;
begin
  select instructions into r from public.trainer_payment_info
    where trainer_id = 'da170002-0000-0000-0000-000000000002';
  if r.instructions = 'Zelle now too' then
    raise notice 'B1 PASS | trainer updates own payment row under RLS';
  else
    raise exception 'B1 FAIL';
  end if;
end $$;
rollback;

\echo
\echo === B2: a trainer cannot write another trainer's row ===
begin;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin,confirmation_token,email_change,email_change_token_new,recovery_token)
values ('00000000-0000-0000-0000-000000000000','da17000c-0000-0000-0000-00000000000c','authenticated','authenticated','m17-tc@test.local','',now(),now(),now(),'{}','{"role":"trainer"}',false,'','','','');
insert into public.trainers (id,timezone) values ('da17000c-0000-0000-0000-00000000000c','America/Chicago');
select set_config('request.jwt.claims','{"sub":"da17000c-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  -- UPDATE of another trainer's row: RLS makes it a 0-row no-op
  update public.trainer_payment_info set instructions = 'hijacked'
    where trainer_id = 'da170002-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n = 0 then
    raise notice 'B2 PASS | cross-trainer UPDATE is a 0-row no-op (RLS)';
  else
    raise exception 'B2 FAIL | updated % foreign rows', n;
  end if;
end $$;
-- and INSERT for another trainer is rejected by WITH CHECK
do $$
begin
  begin
    insert into public.trainer_payment_info (trainer_id, instructions)
      values ('da170002-0000-0000-0000-000000000002', 'squatting');
    raise exception 'B2 FAIL | inserted a row for another trainer';
  exception when insufficient_privilege or check_violation then
    raise notice 'B2 PASS | INSERT for another trainer rejected (WITH CHECK)';
  end;
end $$;
rollback;

\echo
\echo === B3: bad handle charset rejected ===
begin;
select set_config('request.jwt.claims','{"sub":"da170002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    update public.trainer_payment_info set venmo_handle = 'has spaces & !'
      where trainer_id = 'da170002-0000-0000-0000-000000000002';
    raise exception 'B3 FAIL | bad venmo handle accepted';
  exception when check_violation then
    raise notice 'B3 PASS | bad handle rejected (CHECK charset — app builds the href, DB guards the slug)';
  end;
end $$;
rollback;

\echo
\echo === B4: over-280 instructions rejected ===
begin;
select set_config('request.jwt.claims','{"sub":"da170002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    update public.trainer_payment_info set instructions = repeat('x', 281)
      where trainer_id = 'da170002-0000-0000-0000-000000000002';
    raise exception 'B4 FAIL | 281-char instructions accepted';
  exception when check_violation then
    raise notice 'B4 PASS | over-280 instructions rejected';
  end;
end $$;
rollback;

\echo
\echo === B5: grant matrix (anon {}, service_role DML {}, authenticated S/I/U no D) ===
do $$
declare p text; fails int := 0;
begin
  foreach p in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if has_table_privilege('anon','public.trainer_payment_info',p) then
      raise warning 'B5 STRAY | anon %', p; fails := fails + 1; end if;
    if has_table_privilege('service_role','public.trainer_payment_info',p) then
      raise warning 'B5 STRAY | service_role %', p; fails := fails + 1; end if;
  end loop;
  if not has_table_privilege('authenticated','public.trainer_payment_info','SELECT')
     or not has_table_privilege('authenticated','public.trainer_payment_info','INSERT')
     or not has_table_privilege('authenticated','public.trainer_payment_info','UPDATE') then
    raise warning 'B5 MISSING | authenticated S/I/U'; fails := fails + 1; end if;
  if has_table_privilege('authenticated','public.trainer_payment_info','DELETE') then
    raise warning 'B5 STRAY | authenticated DELETE (clear via UPDATE to null)'; fails := fails + 1; end if;
  if fails = 0 then
    raise notice 'B5 PASS | anon {}; service_role DML {} (M14 pos); authenticated S,I,U no D';
  else
    raise exception 'B5 FAIL | % problems', fails;
  end if;
end $$;

\echo
\echo === B6: catalog — updated_at trigger + exactly 4 authenticated policies ===
do $$
declare n_pol int;
begin
  if not exists (select 1 from pg_trigger where tgrelid='public.trainer_payment_info'::regclass and tgname='trg_trainer_payment_info_updated_at') then
    raise exception 'B6 FAIL | updated_at trigger missing';
  end if;
  select count(*) into n_pol from pg_policies where schemaname='public' and tablename='trainer_payment_info';
  if n_pol <> 4 or exists (
       select 1 from pg_policies where schemaname='public' and tablename='trainer_payment_info' and roles <> '{authenticated}') then
    raise exception 'B6 FAIL | policy set drifted (% policies)', n_pol;
  end if;
  raise notice 'B6 PASS | updated_at trigger present; exactly 4 authenticated policies';
end $$;

\echo
\echo === Category B complete (6 cases) ===
