-- ============================================================================
-- Category A — bucket config (the server-enforced security floor)
-- ============================================================================
-- Assert what we DECLARE, exactly: two buckets, exact public flag, exact
-- byte caps, exact MIME lists (order-insensitive), and NO undeclared
-- buckets. A dashboard-created bucket or a drifted cap fails loud — the
-- declared-set discipline (M14's contract shape, storage-flavored: we pin
-- OUR config, never platform grants).
--
--   A1  declared buckets match exactly (config equality per bucket)
--   A2  no undeclared buckets exist
--
-- Acceptance: both PASS.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === A1/A2: bucket declaration matrix ===
do $$
declare
  declared constant jsonb := jsonb_build_object(
    'avatars',         jsonb_build_object('public', true, 'limit', 2097152,
                         'mimes', jsonb_build_array('image/jpeg','image/png','image/webp')),
    'trainer-gallery', jsonb_build_object('public', true, 'limit', 5242880,
                         'mimes', jsonb_build_array('image/jpeg','image/png','image/webp'))
  );
  k text;
  r record;
  n int;
begin
  -- A1: every declared bucket exists with exact config
  for k in select jsonb_object_keys(declared) loop
    select b.public, b.file_size_limit, b.allowed_mime_types into r
      from storage.buckets b where b.id = k;
    if not found then
      raise exception 'A1 FAIL | declared bucket % does not exist', k;
    end if;
    if r.public is distinct from (declared -> k ->> 'public')::boolean then
      raise exception 'A1 FAIL | % public flag: got %', k, r.public;
    end if;
    if r.file_size_limit is distinct from (declared -> k ->> 'limit')::bigint then
      raise exception 'A1 FAIL | % file_size_limit: got %', k, r.file_size_limit;
    end if;
    if (select array_agg(m order by m) from unnest(r.allowed_mime_types) m)
       is distinct from
       (select array_agg(m order by m) from jsonb_array_elements_text(declared -> k -> 'mimes') m) then
      raise exception 'A1 FAIL | % allowed_mime_types: got %', k, r.allowed_mime_types;
    end if;
    raise notice 'A1 ok | % config exact', k;
  end loop;

  -- A2: absence direction — no bucket we did not declare
  select count(*) into n from storage.buckets b
    where not (declared ? b.id);
  if n <> 0 then
    raise exception 'A2 FAIL | % undeclared bucket(s) exist', n;
  end if;
  raise notice 'A1 PASS | declared buckets exact';
  raise notice 'A2 PASS | no undeclared buckets';
end $$;

\echo === Category A complete (2 checks) ===
