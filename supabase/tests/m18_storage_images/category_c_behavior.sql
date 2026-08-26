-- ============================================================================
-- Category C — behavioral RLS (the predicates, exercised)
-- ============================================================================
-- Direct DML against storage.objects under JWT-scoped roles — storage RLS
-- fires on direct DML exactly as it does for the Storage API's own writes,
-- so the M6 test mechanics transfer. DELETE cases set the platform's
-- storage.allow_delete_query GUC (set_config ... is_local=true, dies with
-- the ROLLBACK): without it the platform's protect_delete STATEMENT trigger
-- raises before RLS is ever consulted — which C10 pins as a fact in its own
-- right (the "cleanup must use the Storage API" law).
--
--   C1   avatar INSERT, own exact path, as OWNER-role user  → allowed
--        (role-universal: avatars are not trainer-gated)
--   C2   avatar INSERT into a FOREIGN user path              → 42501
--   C3   avatar INSERT own folder, non-'avatar' object name  → 42501
--        (exact-path law: one legal object per user)
--   C4   avatar INSERT as anon                               → 42501
--   C5   avatar UPDATE own object (the upsert path)          → 1 row
--   C5b  avatar UPDATE renaming own object to a FOREIGN
--        path → 42501 (the hijack shape: without this check,
--        UPDATE-policy drift toward WITH CHECK (true) would
--        let any user rename their object onto a victim's
--        avatar path while every other case stays green)
--   C6   gallery INSERT, own folder, as trainer              → allowed
--   C7   gallery INSERT, own folder, as NON-trainer          → 42501
--        (the trainers row is the role evidence)
--   C8   gallery INSERT, foreign folder, as trainer          → 42501
--   C9   avatar DELETE own (GUC set): own row gone, foreign
--        row survives (RLS USING silently filters)           → 1/1
--   C10  DELETE without the GUC raises the platform guard    → 42501
--
-- Acceptance: all 11 PASS.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === C1: avatar INSERT own exact path as OWNER-role user (role-universal) ===
begin;
select set_config('request.jwt.claims','{"sub":"da180002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
-- Bare SQL, no DO ceremony: under ON_ERROR_STOP a denial halts the script,
-- so the PASS echo below prints only on success (the m6/m16 convention for
-- positive actions).
insert into storage.objects (bucket_id, name)
  values ('avatars','da180002-0000-0000-0000-000000000002/avatar');
\echo C1 PASS | owner-role user writes own avatar (avatars are role-universal)
rollback;

\echo
\echo === C2: avatar INSERT into a foreign user path is denied ===
begin;
select set_config('request.jwt.claims','{"sub":"da180002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
      values ('avatars','da180001-0000-0000-0000-000000000001/avatar');
    raise exception 'C2 FAIL | wrote into a foreign avatar path';
  exception when insufficient_privilege then
    raise notice 'C2 PASS | foreign avatar path denied (42501)';
  end;
end $$;
rollback;

\echo
\echo === C3: avatar INSERT own folder but wrong object name is denied ===
begin;
select set_config('request.jwt.claims','{"sub":"da180002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
      values ('avatars','da180002-0000-0000-0000-000000000002/second-file');
    raise exception 'C3 FAIL | exact-path law not enforced';
  exception when insufficient_privilege then
    raise notice 'C3 PASS | only ''{uid}/avatar'' is a legal object name (42501)';
  end;
end $$;
rollback;

\echo
\echo === C4: avatar INSERT as anon is denied ===
begin;
select set_config('request.jwt.claims','', true);
set local role anon;
do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
      values ('avatars','da180002-0000-0000-0000-000000000002/avatar');
    raise exception 'C4 FAIL | anon wrote an avatar object';
  exception when insufficient_privilege then
    raise notice 'C4 PASS | anon denied (42501)';
  end;
end $$;
rollback;

\echo
\echo === C5: avatar UPDATE own object (the upsert path) ===
begin;
select set_config('request.jwt.claims','{"sub":"da180002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  insert into storage.objects (bucket_id, name)
    values ('avatars','da180002-0000-0000-0000-000000000002/avatar');
  update storage.objects set version = 'v2'
    where bucket_id = 'avatars'
      and name = 'da180002-0000-0000-0000-000000000002/avatar';
  get diagnostics n = row_count;
  if n = 1 then
    raise notice 'C5 PASS | own-avatar UPDATE hits 1 row (upsert = SELECT+UPDATE works)';
  else
    raise exception 'C5 FAIL | update touched % rows', n;
  end if;
end $$;
rollback;

\echo
\echo === C5b: avatar UPDATE renaming own object to a foreign path is denied ===
begin;
select set_config('request.jwt.claims','{"sub":"da180002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  insert into storage.objects (bucket_id, name)
    values ('avatars','da180002-0000-0000-0000-000000000002/avatar');
  begin
    update storage.objects
      set name = 'da180001-0000-0000-0000-000000000001/avatar'
      where bucket_id = 'avatars'
        and name = 'da180002-0000-0000-0000-000000000002/avatar';
    raise exception 'C5b FAIL | renamed own avatar onto a foreign path (hijack)';
  exception when insufficient_privilege then
    raise notice 'C5b PASS | rename-to-foreign-path denied (USING doubles as the check)';
  end;
end $$;
rollback;

\echo
\echo === C6: gallery INSERT own folder as trainer ===
begin;
select set_config('request.jwt.claims','{"sub":"da180001-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
insert into storage.objects (bucket_id, name)
  values ('trainer-gallery','da180001-0000-0000-0000-000000000001/photo-1');
\echo C6 PASS | trainer writes own gallery folder
rollback;

\echo
\echo === C7: gallery INSERT as NON-trainer is denied (trainers row = role evidence) ===
begin;
select set_config('request.jwt.claims','{"sub":"da180002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
      values ('trainer-gallery','da180002-0000-0000-0000-000000000002/photo-1');
    raise exception 'C7 FAIL | non-trainer wrote a gallery object';
  exception when insufficient_privilege then
    raise notice 'C7 PASS | owner-role user denied on gallery (42501)';
  end;
end $$;
rollback;

\echo
\echo === C8: gallery INSERT into a foreign folder is denied ===
begin;
select set_config('request.jwt.claims','{"sub":"da180001-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
      values ('trainer-gallery','da180002-0000-0000-0000-000000000002/photo-1');
    raise exception 'C8 FAIL | trainer wrote into a foreign gallery folder';
  exception when insufficient_privilege then
    raise notice 'C8 PASS | foreign gallery folder denied (42501)';
  end;
end $$;
rollback;

\echo
\echo === C9: avatar DELETE scoping (GUC set; RLS USING filters silently) ===
begin;
-- Seed BOTH users' avatar rows as postgres, then delete as one of them.
insert into storage.objects (bucket_id, name) values
  ('avatars','da180001-0000-0000-0000-000000000001/avatar'),
  ('avatars','da180002-0000-0000-0000-000000000002/avatar');
select set_config('storage.allow_delete_query','true', true);
select set_config('request.jwt.claims','{"sub":"da180002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  delete from storage.objects where bucket_id = 'avatars';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'C9 FAIL | bucket-wide delete as one user removed % rows (RLS should scope to own)', n;
  end if;
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from storage.objects
    where bucket_id = 'avatars'
      and name = 'da180001-0000-0000-0000-000000000001/avatar';
  if n = 1 then
    raise notice 'C9 PASS | own avatar deleted, foreign avatar survived (USING filter)';
  else
    raise exception 'C9 FAIL | foreign avatar row missing after scoped delete';
  end if;
end $$;
rollback;

\echo
\echo === C10: DELETE without the GUC hits the platform guard (the API-only law) ===
-- No seed row on purpose: the guard is a BEFORE STATEMENT trigger — it
-- raises before RLS or row matching is consulted, and pinning THAT is the
-- point. A seeded row would imply the guard is row-dependent.
begin;
select set_config('request.jwt.claims','{"sub":"da180002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    delete from storage.objects
      where bucket_id = 'avatars'
        and name = 'da180002-0000-0000-0000-000000000002/avatar';
    raise exception 'C10 FAIL | direct SQL delete succeeded without the GUC';
  exception when insufficient_privilege then
    raise notice 'C10 PASS | platform guard raised — file deletion must use the Storage API';
  end;
end $$;
rollback;

\echo === Category C complete (11 checks) ===
