-- ============================================================================
-- Category B — RLS and grants
-- ============================================================================
--   B1  anon reads a listable trainer's photos (public directory content)
--   B2  anon CANNOT see a soft-deleted trainer's photos (the M3/M4 filter)
--   B3  a trainer inserts into their OWN gallery
--   B4  a trainer CANNOT insert into another trainer's gallery (42501)
--   B5  an OWNER-role user cannot insert at all (trainers row = role evidence)
--   B6  a trainer cannot MOVE a row to another trainer (WITH CHECK freeze)
--   B7  a trainer cannot delete another trainer's photo (USING filters: 0 rows)
--   B8  a trainer deletes their OWN photo
--   B9  grant catalog: anon SELECT only; authenticated S/I/U/D; service_role
--       nothing (M14 asserts the absence too, this pins the positive side)
--   B10 photos die with the trainer (FK CASCADE — the account-deletion path)
--
-- Acceptance: all 10 PASS.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === B1/B2: anon reads listable photos, never a soft-deleted trainer's ===
begin;
select set_config('request.jwt.claims','', true);
set local role anon;
do $$
declare visible int; hidden int;
begin
  select count(*) into visible from public.trainer_gallery_photos
    where trainer_id = 'da190001-0000-0000-0000-000000000001';
  select count(*) into hidden from public.trainer_gallery_photos
    where trainer_id = 'da190004-0000-0000-0000-000000000004';
  if visible = 2 then
    raise notice 'B1 PASS | anon sees the listable trainer''s 2 photos';
  else
    raise exception 'B1 FAIL | anon saw % photos', visible;
  end if;
  if hidden = 0 then
    raise notice 'B2 PASS | soft-deleted trainer''s photo is invisible to anon';
  else
    raise exception 'B2 FAIL | leaked % soft-deleted photo(s)', hidden;
  end if;
end $$;
rollback;

\echo
\echo === B3: a trainer inserts into their own gallery ===
begin;
select set_config('request.jwt.claims','{"sub":"da190001-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
insert into public.trainer_gallery_photos (trainer_id, file_name, position)
values ('da190001-0000-0000-0000-000000000001',
        '11111111-1111-4111-8111-111111111111', 3);
\echo B3 PASS | trainer writes their own gallery row
rollback;

\echo
\echo === B4: a trainer cannot insert into ANOTHER trainer's gallery ===
begin;
select set_config('request.jwt.claims','{"sub":"da190001-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into public.trainer_gallery_photos (trainer_id, file_name, position)
    values ('da190002-0000-0000-0000-000000000002',
            '22222222-2222-4222-8222-222222222222', 1);
    raise exception 'B4 FAIL | wrote into a foreign gallery';
  exception when insufficient_privilege then
    raise notice 'B4 PASS | foreign gallery insert denied (42501)';
  end;
end $$;
rollback;

\echo
\echo === B5: an OWNER-role user cannot insert (trainers row = role evidence) ===
begin;
select set_config('request.jwt.claims','{"sub":"da190003-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into public.trainer_gallery_photos (trainer_id, file_name, position)
    values ('da190003-0000-0000-0000-000000000003',
            '33333333-3333-4333-8333-333333333333', 1);
    raise exception 'B5 FAIL | an owner-role user created a gallery row';
  exception when insufficient_privilege then
    raise notice 'B5 PASS | owner-role insert denied (42501)';
  end;
end $$;
rollback;

\echo
\echo === B6: a trainer cannot MOVE a row to another trainer ===
begin;
select set_config('request.jwt.claims','{"sub":"da190001-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    update public.trainer_gallery_photos
      set trainer_id = 'da190002-0000-0000-0000-000000000002'
      where trainer_id = 'da190001-0000-0000-0000-000000000001' and position = 1;
    raise exception 'B6 FAIL | reparented a photo to another trainer';
  exception when insufficient_privilege then
    raise notice 'B6 PASS | WITH CHECK freezes trainer_id (42501)';
  end;
end $$;
rollback;

\echo
\echo === B7/B8: delete scoping — foreign filtered silently, own succeeds ===
begin;
select set_config('request.jwt.claims','{"sub":"da190001-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  delete from public.trainer_gallery_photos
    where trainer_id = 'da190002-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'B7 FAIL | deleted % foreign row(s)', n;
  end if;
  raise notice 'B7 PASS | foreign delete filtered to zero rows (USING)';

  delete from public.trainer_gallery_photos
    where trainer_id = 'da190001-0000-0000-0000-000000000001' and position = 2;
  get diagnostics n = row_count;
  if n = 1 then
    raise notice 'B8 PASS | trainer deletes their own photo';
  else
    raise exception 'B8 FAIL | own delete touched % rows', n;
  end if;
end $$;
rollback;

\echo
\echo === B9: grant catalog ===
do $$
declare
  declared constant jsonb := jsonb_build_object(
    'anon',          jsonb_build_array('SELECT'),
    'authenticated', jsonb_build_array('SELECT','INSERT','UPDATE','DELETE'),
    'service_role',  jsonb_build_array()
  );
  r text; p text; expected boolean; actual boolean;
begin
  for r in select jsonb_object_keys(declared) loop
    foreach p in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      expected := declared -> r ? p;
      actual := has_table_privilege(r, 'public.trainer_gallery_photos', p);
      if actual <> expected then
        raise exception 'B9 FAIL | % on %: expected %, got %', p, r, expected, actual;
      end if;
    end loop;
    raise notice 'B9 ok | % = %', r, declared -> r;
  end loop;
  raise notice 'B9 PASS | grants match the declared set exactly';
end $$;

\echo
\echo === B10: photos die with the trainer (the deletion-runbook cascade) ===
begin;
delete from public.trainers where id = 'da190002-0000-0000-0000-000000000002';
do $$
declare n int;
begin
  insert into public.trainer_gallery_photos (trainer_id, file_name, position)
  values ('da190001-0000-0000-0000-000000000001',
          '44444444-4444-4444-8444-444444444444', 4);
  delete from public.trainers where id = 'da190001-0000-0000-0000-000000000001';
  select count(*) into n from public.trainer_gallery_photos
    where trainer_id = 'da190001-0000-0000-0000-000000000001';
  if n = 0 then
    raise notice 'B10 PASS | gallery rows cascade with the trainer (storage objects still need the runbook sweep)';
  else
    raise exception 'B10 FAIL | % orphaned row(s) survived', n;
  end if;
end $$;
rollback;

\echo === Category B complete (10 checks) ===
