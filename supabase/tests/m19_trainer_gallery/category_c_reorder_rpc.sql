-- ============================================================================
-- Category C — move_gallery_photo (the reorder RPC)
-- ============================================================================
-- The RPC exists because the reorder MUST be one statement in one
-- transaction. C1 pins the failure mode it replaces, so nobody "simplifies"
-- it back into client-side updates.
--
--   C1  TWO separate transactions cannot swap: the first half raises 23505
--       (the deferred check fires at ITS commit, where the duplicate lives)
--   C2  the RPC swaps two adjacent photos as the trainer
--   C3  the RPC is a no-op at the top of the list (no error)
--   C4  the RPC skips HOLES — neighbours are by ORDER, not position ± 1
--   C5  another trainer's photo raises 42501
--   C6  a bad direction raises 22023
--   C7  EXECUTE grants: authenticated only (anon and service_role denied)
--
-- Acceptance: all 7 PASS.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === C1: two separate transactions CANNOT swap (why the RPC exists) ===
begin;
do $$
begin
  -- Exactly what two supabase-js .update() calls do: one statement, its own
  -- commit. Committing here is simulated by forcing the deferred check.
  update public.trainer_gallery_photos set position = 2
    where trainer_id = 'da190001-0000-0000-0000-000000000001' and position = 1;
  begin
    set constraints public.tgp_unique_slot immediate;
    raise exception 'C1 FAIL | a half-swap survived its own transaction';
  exception when unique_violation then
    raise notice 'C1 PASS | half-swap raises 23505 at its own commit (client-side reorder is impossible)';
  end;
end $$;
rollback;

\echo
\echo === C2: the RPC swaps two adjacent photos ===
begin;
select set_config('request.jwt.claims','{"sub":"da190001-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare first_file text;
begin
  perform public.move_gallery_photo(
    (select id from public.trainer_gallery_photos
      where trainer_id = 'da190001-0000-0000-0000-000000000001' and position = 1),
    'down');
  select file_name into first_file from public.trainer_gallery_photos
    where trainer_id = 'da190001-0000-0000-0000-000000000001' and position = 1;
  if first_file = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb' then
    raise notice 'C2 PASS | photos swapped; slot 1 now holds the former slot 2';
  else
    raise exception 'C2 FAIL | slot 1 holds %', first_file;
  end if;
end $$;
rollback;

\echo
\echo === C3: moving the first photo up is a silent no-op ===
begin;
select set_config('request.jwt.claims','{"sub":"da190001-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare first_file text;
begin
  perform public.move_gallery_photo(
    (select id from public.trainer_gallery_photos
      where trainer_id = 'da190001-0000-0000-0000-000000000001' and position = 1),
    'up');
  select file_name into first_file from public.trainer_gallery_photos
    where trainer_id = 'da190001-0000-0000-0000-000000000001' and position = 1;
  if first_file = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa' then
    raise notice 'C3 PASS | no-op at the top of the list, no error raised';
  else
    raise exception 'C3 FAIL | order changed unexpectedly';
  end if;
end $$;
rollback;

\echo
\echo === C4: neighbours are by ORDER, so holes are skipped ===
begin;
-- Leave a hole: photos at 1 and 5 with nothing between.
update public.trainer_gallery_photos set position = 5
  where trainer_id = 'da190001-0000-0000-0000-000000000001' and position = 2;
select set_config('request.jwt.claims','{"sub":"da190001-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare pos_a smallint; pos_b smallint;
begin
  perform public.move_gallery_photo(
    (select id from public.trainer_gallery_photos
      where trainer_id = 'da190001-0000-0000-0000-000000000001'
        and file_name = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'),
    'down');
  select position into pos_a from public.trainer_gallery_photos
    where file_name = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  select position into pos_b from public.trainer_gallery_photos
    where file_name = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
  if pos_a = 5 and pos_b = 1 then
    raise notice 'C4 PASS | 1 and 5 swapped across the hole (order, not arithmetic)';
  else
    raise exception 'C4 FAIL | a=%, b=%', pos_a, pos_b;
  end if;
end $$;
rollback;

\echo
\echo === C5: another trainer's photo raises 42501 ===
begin;
insert into public.trainer_gallery_photos (trainer_id, file_name, position) values
  ('da190002-0000-0000-0000-000000000002','99999999-9999-4999-8999-999999999999',1),
  ('da190002-0000-0000-0000-000000000002','88888888-8888-4888-8888-888888888888',2);
select set_config('request.jwt.claims','{"sub":"da190001-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.move_gallery_photo(
      (select id from public.trainer_gallery_photos
        where file_name = '99999999-9999-4999-8999-999999999999'),
      'down');
    raise exception 'C5 FAIL | reordered another trainer''s gallery';
  exception when insufficient_privilege then
    raise notice 'C5 PASS | foreign photo raises 42501 (explicit, not a silent no-op)';
  end;
end $$;
rollback;

\echo
\echo === C6: an invalid direction raises 22023 ===
begin;
select set_config('request.jwt.claims','{"sub":"da190001-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.move_gallery_photo(
      (select id from public.trainer_gallery_photos
        where trainer_id = 'da190001-0000-0000-0000-000000000001' and position = 1),
      'sideways');
    raise exception 'C6 FAIL | an invalid direction was accepted';
  exception when invalid_parameter_value then
    raise notice 'C6 PASS | invalid direction raises 22023';
  end;
end $$;
rollback;

\echo
\echo === C7: EXECUTE grants — authenticated only ===
do $$
declare r text; expected boolean; actual boolean;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    expected := (r = 'authenticated');
    actual := has_function_privilege(
      r, 'public.move_gallery_photo(uuid, text)', 'EXECUTE');
    if actual <> expected then
      raise exception 'C7 FAIL | EXECUTE for %: expected %, got %', r, expected, actual;
    end if;
    raise notice 'C7 ok | % execute = %', r, actual;
  end loop;
  raise notice 'C7 PASS | only authenticated may reorder';
end $$;

\echo === Category C complete (7 checks) ===
