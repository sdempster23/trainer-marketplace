-- ============================================================================
-- Category B — policy declaration matrix (storage.objects)
-- ============================================================================
-- The policies ARE the entire storage access model (grants are platform-wide
-- by design and deliberately unpinned — see the M18 migration header). So
-- the declared set is asserted in BOTH directions:
--
--   B1  every declared (policyname, cmd, role) exists on storage.objects
--   B2  no undeclared policy exists on storage.objects OR storage.buckets —
--       buckets is included because the platform gates it the same way
--       (wide grants, policy-only): a stray dashboard policy there would
--       let authenticated users mint their own buckets with self-chosen
--       caps/MIME lists, bypassing the category-A floor. We declare ZERO
--       policies on buckets; only postgres-owned migrations touch it.
--
-- Predicate TEXT is not asserted (pg_policies pretty-printing is
-- version-sensitive); category C asserts the predicates BEHAVIORALLY.
--
-- Acceptance: both PASS.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === B1/B2: policy declaration matrix ===
do $$
declare
  declared constant jsonb := jsonb_build_object(
    'avatars_insert_own',          'INSERT',
    'avatars_select_own',          'SELECT',
    'avatars_update_own',          'UPDATE',
    'avatars_delete_own',          'DELETE',
    'gallery_insert_own_trainer',  'INSERT',
    'gallery_select_own_trainer',  'SELECT',
    'gallery_delete_own_trainer',  'DELETE'
  );
  k text;
  r record;
  n int;
begin
  -- B1: presence with exact cmd + role
  for k in select jsonb_object_keys(declared) loop
    select p.cmd, p.roles into r from pg_policies p
      where p.schemaname = 'storage' and p.tablename = 'objects'
        and p.policyname = k;
    if not found then
      raise exception 'B1 FAIL | policy % missing', k;
    end if;
    if r.cmd is distinct from (declared ->> k) then
      raise exception 'B1 FAIL | % cmd: got %, declared %', k, r.cmd, declared ->> k;
    end if;
    if r.roles is distinct from array['authenticated']::name[] then
      raise exception 'B1 FAIL | % roles: got % (declared {authenticated})', k, r.roles;
    end if;
    raise notice 'B1 ok | % (%) to authenticated', k, r.cmd;
  end loop;

  -- B2: absence — exactly the declared set on objects, NOTHING on buckets
  select count(*) into n from pg_policies p
    where p.schemaname = 'storage' and p.tablename in ('objects','buckets')
      and not (p.tablename = 'objects' and (declared ? p.policyname));
  if n <> 0 then
    raise exception 'B2 FAIL | % undeclared polic(ies) on storage.objects/buckets', n;
  end if;
  raise notice 'B1 PASS | all 7 declared policies exact';
  raise notice 'B2 PASS | no undeclared policies on objects or buckets';
end $$;

\echo === Category B complete (2 checks) ===
