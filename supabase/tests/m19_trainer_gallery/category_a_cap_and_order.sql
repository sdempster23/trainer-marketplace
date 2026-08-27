-- ============================================================================
-- Category A — the cap and the slot invariants (by construction, not app code)
-- ============================================================================
--   A1  the 9th photo is impossible (position CHECK 1..8)
--   A2  position 0 / negative is impossible (same CHECK, lower bound)
--   A3  two photos cannot share a slot (UNIQUE(trainer_id, position))
--   A4  a two-row swap in ONE statement is legal (DEFERRABLE unique) and
--       leaves both slots occupied exactly once
--   A5  the deferred check STILL fires at commit on a real duplicate —
--       deferrable must not mean unenforced
--   A6  file_name charset is DB-enforced: a path-traversal smuggle is
--       rejected by CHECK (the untrusted-read rule, enforced below app code)
--   A7  two trainers may hold the SAME slot number (the unique is per-trainer)
--
-- Acceptance: all 7 PASS.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === A1: the 9th photo is impossible ===
begin;
insert into public.trainer_gallery_photos (trainer_id, file_name, position)
select 'da190001-0000-0000-0000-000000000001',
       lpad(to_hex(g),8,'0') || '-4444-4444-8444-444444444444', g
from generate_series(3,8) g;
do $$
begin
  begin
    insert into public.trainer_gallery_photos (trainer_id, file_name, position)
    values ('da190001-0000-0000-0000-000000000001',
            'dddddddd-9999-4999-8999-dddddddddddd', 9);
    raise exception 'A1 FAIL | a 9th photo was accepted';
  exception when check_violation then
    raise notice 'A1 PASS | 9th photo rejected by CHECK (cap is structural)';
  end;
end $$;
rollback;

\echo
\echo === A2: position 0 is impossible (lower bound) ===
begin;
do $$
begin
  begin
    insert into public.trainer_gallery_photos (trainer_id, file_name, position)
    values ('da190001-0000-0000-0000-000000000001',
            'dddddddd-0000-4000-8000-dddddddddddd', 0);
    raise exception 'A2 FAIL | position 0 accepted';
  exception when check_violation then
    raise notice 'A2 PASS | position 0 rejected by CHECK';
  end;
end $$;
rollback;

\echo
\echo === A3: two photos cannot share a slot ===
begin;
do $$
begin
  begin
    insert into public.trainer_gallery_photos (trainer_id, file_name, position)
    values ('da190001-0000-0000-0000-000000000001',
            'eeeeeeee-1111-4111-8111-eeeeeeeeeeee', 1);
    -- DEFERRABLE: the violation surfaces at the commit boundary, so force it.
    set constraints public.tgp_unique_slot immediate;
    raise exception 'A3 FAIL | duplicate slot accepted';
  exception when unique_violation then
    raise notice 'A3 PASS | duplicate slot rejected by UNIQUE';
  end;
end $$;
rollback;

\echo
\echo === A4: a two-row swap in ONE statement is legal, slots stay exact ===
begin;
update public.trainer_gallery_photos
  set position = case position when 1 then 2 else 1 end
  where trainer_id = 'da190001-0000-0000-0000-000000000001'
    and position in (1, 2);
do $$
declare first_file text; n int;
begin
  select file_name into first_file from public.trainer_gallery_photos
    where trainer_id = 'da190001-0000-0000-0000-000000000001' and position = 1;
  select count(distinct position) into n from public.trainer_gallery_photos
    where trainer_id = 'da190001-0000-0000-0000-000000000001';
  if first_file = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb' and n = 2 then
    raise notice 'A4 PASS | single-statement swap applied; both slots occupied once';
  else
    raise exception 'A4 FAIL | slot 1 holds %, distinct slots %', first_file, n;
  end if;
end $$;
rollback;

\echo
\echo === A5: deferrable still ENFORCES at the commit boundary ===
begin;
do $$
begin
  -- Set BOTH photos to slot 1: legal mid-transaction, illegal at commit.
  update public.trainer_gallery_photos set position = 1
    where trainer_id = 'da190001-0000-0000-0000-000000000001';
  begin
    set constraints public.tgp_unique_slot immediate;
    raise exception 'A5 FAIL | duplicate slots survived the deferred check';
  exception when unique_violation then
    raise notice 'A5 PASS | deferred check fires at the boundary (deferrable is not unenforced)';
  end;
end $$;
rollback;

\echo
\echo === A6: file_name charset is DB-enforced (traversal smuggle rejected) ===
begin;
do $$
declare bad text;
begin
  foreach bad in array array[
    '../avatars/da190002-0000-0000-0000-000000000002/avatar',
    'not-a-uuid',
    'AAAAAAAA-1111-4111-8111-AAAAAAAAAAAA',
    'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa/../../x'
  ] loop
    begin
      insert into public.trainer_gallery_photos (trainer_id, file_name, position)
      values ('da190001-0000-0000-0000-000000000001', bad, 5);
      raise exception 'A6 FAIL | file_name % was accepted', bad;
    exception when check_violation then
      null; -- expected
    end;
  end loop;
  raise notice 'A6 PASS | traversal/uppercase/garbage file_names all rejected by CHECK';
end $$;
rollback;

\echo
\echo === A7: the slot unique is PER TRAINER ===
begin;
insert into public.trainer_gallery_photos (trainer_id, file_name, position)
values ('da190002-0000-0000-0000-000000000002',
        'ffffffff-1111-4111-8111-ffffffffffff', 1);
\echo A7 PASS | a second trainer may also hold slot 1
rollback;

\echo === Category A complete (7 checks) ===
