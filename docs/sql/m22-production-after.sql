-- Read-only M22 production read-back. Run BEFORE releasing the new app, on
-- the same verified project as m22-production-before.sql. No fixture writes.
begin read only;
set local statement_timeout = '15s';

select version from supabase_migrations.schema_migrations where version = '20260918120000';

-- Compare these counts/fingerprints with the pre-migration result. New columns
-- are removed from the hash, so M22 itself should leave every old field intact.
-- Concurrent real user activity can change fingerprints and needs review;
-- a mismatch is not permission to restore, rewrite, or delete live records.
select 'trainers' as relation, count(*) as rows,
       md5(coalesce(string_agg((to_jsonb(t) - 'country_code' - 'postal_area')::text, E'\n' order by id), '')) as old_fields_fingerprint
from public.trainers t
union all
select 'trainer_services', count(*),
       md5(coalesce(string_agg((to_jsonb(t) - 'currency')::text, E'\n' order by id), ''))
from public.trainer_services t
union all
select 'bookings', count(*),
       md5(coalesce(string_agg((to_jsonb(t) - 'currency')::text, E'\n' order by id), ''))
from public.bookings t;

select 'trainers_us_with_unknown_postal_area' as check_name,
       count(*) filter (where country_code = 'US' and postal_area is null) as expected_rows,
       count(*) as total_rows
from public.trainers
union all
select 'services_usd', count(*) filter (where currency = 'USD'), count(*) from public.trainer_services
union all
select 'bookings_usd', count(*) filter (where currency = 'USD'), count(*) from public.bookings;

do $$
declare
  r record;
  role_name text;
  fn regprocedure := to_regprocedure('public.nearby_trainers_v2(double precision,double precision,integer,text)');
begin
  if fn is null or to_regprocedure('public.nearby_trainers(double precision,double precision,double precision,integer,integer)') is null
  then raise exception 'M22 new/legacy proximity function missing'; end if;
  if enum_range(null::public.currency_code)::text[] is distinct from array['USD','CAD','GBP']
  then raise exception 'M22 currency enum mismatch'; end if;
  if not exists (select 1 from pg_proc where oid = fn and not prosecdef and provolatile = 's'
                 and proconfig = array['search_path=""'])
  then raise exception 'M22 proximity function security posture mismatch'; end if;
  if exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a where p.oid = fn and a.grantee = 0)
  then raise exception 'M22 proximity function has PUBLIC EXECUTE'; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if not has_function_privilege(role_name, fn, 'EXECUTE')
    then raise exception 'M22 proximity EXECUTE missing: %', role_name; end if;
    if has_function_privilege(role_name, 'public.trainer_services_validate_currency()', 'EXECUTE')
    then raise exception 'M22 trigger exposed to API role: %', role_name; end if;
  end loop;
  for r in select * from (values
    ('trainers', 'country_code', 'text', true),
    ('trainers', 'postal_area', 'text', false),
    ('trainer_services', 'currency', 'currency_code', true),
    ('bookings', 'currency', 'currency_code', true)
  ) as expected(table_name, column_name, type_name, not_null) loop
    if not exists (
      select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace join pg_type t on t.oid = a.atttypid
      where n.nspname = 'public' and c.relname = r.table_name and a.attname = r.column_name
        and not a.attisdropped and t.typname = r.type_name and a.attnotnull = r.not_null
    ) then raise exception 'M22 column mismatch: %.%', r.table_name, r.column_name; end if;
  end loop;
  if (select count(*) from pg_constraint where conrelid = 'public.trainers'::regclass
      and conname in ('trainers_country_code_check','trainers_postal_area_check') and convalidated) <> 2
  then raise exception 'M22 country/postal constraints missing'; end if;
  if exists (select 1 from pg_class where oid in (
      'public.trainers'::regclass, 'public.trainer_services'::regclass, 'public.bookings'::regclass
    ) and not relrowsecurity)
  then raise exception 'M22 protected tables must retain RLS'; end if;
  for r in select * from (values
    ('trainers', 'country_code', '''US'''),
    ('trainer_services', 'currency', '''USD'''),
    ('bookings', 'currency', '''USD''')
  ) as expected(table_name, column_name, value_literal) loop
    if not exists (
      select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where n.nspname = 'public' and c.relname = r.table_name and a.attname = r.column_name
        and position(r.value_literal in pg_get_expr(d.adbin, d.adrelid)) > 0
    ) then raise exception 'M22 legacy INSERT default missing: %.%', r.table_name, r.column_name; end if;
  end loop;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O'
      and (tgrelid, tgname, tgfoid) in (
        ('public.trainer_services'::regclass, 'trg_trainer_services_validate_currency', 'public.trainer_services_validate_currency()'::regprocedure),
        ('public.bookings'::regclass, 'trg_bookings_validate_insert', 'public.bookings_validate_insert()'::regprocedure),
        ('public.bookings'::regclass, 'trg_bookings_validate_update', 'public.bookings_validate_update()'::regprocedure)
      )) <> 3
  then raise exception 'M22 currency/booking triggers are not all enabled'; end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.trainer_services_validate_currency()'::regprocedure)
     is distinct from 'a7cf34ae279318a80dab9e18cd8a84eb'
  then raise exception 'M22 reviewed function body mismatch: trainer_services_validate_currency'; end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.bookings_validate_insert()'::regprocedure)
     is distinct from '66cfd5d26841f564c0b07170d5ec1411'
  then raise exception 'M22 reviewed function body mismatch: bookings_validate_insert'; end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.bookings_validate_update()'::regprocedure)
     is distinct from '7f9a64b660008a51a72cee6fde0f0494'
  then raise exception 'M22 reviewed function body mismatch: bookings_validate_update'; end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.nearby_trainers_v2(double precision,double precision,integer,text)'::regprocedure)
     is distinct from '905c579ea9280274f2308083af406aac'
  then raise exception 'M22 reviewed function body mismatch: nearby_trainers_v2'; end if;
  raise notice 'M22 catalog and reviewed function bodies verified';
end $$;

-- M14 declaration matrix, catalog-only. No DML or forbidden function calls.
do $$
declare
  -- THE single source of truth for this suite. Adding a declared table?
  -- Add it here, once — both checks derive from this object.
  declared constant jsonb := jsonb_build_object(
    'bookings',                jsonb_build_array('SELECT','UPDATE'),
    'trainer_stripe_accounts', jsonb_build_array('SELECT','INSERT','UPDATE'),
    'analytics_events',        jsonb_build_array('INSERT')
  );
  r record;
  p text;
  expected boolean;
  actual boolean;
  tbl_fails int;
  fails int := 0;
  n_tables int := 0;
  missing text;
begin
  -- --------------------------------------------------------------------------
  -- M14-2: declaration integrity (first — the matrix trusts this)
  -- --------------------------------------------------------------------------
  select string_agg(k, ', ') into missing
  from jsonb_object_keys(declared) as k
  where not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p','f') and c.relname = k
  );

  if missing is not null then
    raise exception 'M14-2 FAIL | declared table(s) missing from catalog: %', missing;
  end if;
  raise notice 'M14-2 PASS | all declared tables exist';

  -- --------------------------------------------------------------------------
  -- M14-1: the matrix — all public tables x 4 DML verbs vs the declared set
  -- --------------------------------------------------------------------------
  for r in
    select c.oid as reloid,
           c.relname as tbl,
           array(select jsonb_array_elements_text(declared -> c.relname)) as granted
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p','f')
    order by c.relname
  loop
    n_tables := n_tables + 1;
    tbl_fails := 0;
    foreach p in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      expected := p = any(r.granted);
      actual := has_table_privilege('service_role', r.reloid, p);
      if actual <> expected then
        raise warning 'M14-1 MISMATCH | service_role | % | % | expected=% actual=%',
          r.tbl, p, expected, actual;
        tbl_fails := tbl_fails + 1;
      end if;
    end loop;
    if tbl_fails = 0 then
      raise notice 'M14-1 ok | % = {%}', r.tbl, array_to_string(r.granted, ', ');
    else
      fails := fails + tbl_fails;
    end if;
  end loop;

  if fails = 0 then
    raise notice 'M14-1 PASS | % public tables x 4 DML verbs match the declared set exactly', n_tables;
  else
    raise exception 'M14-1 FAIL | % mismatch(es) against the declared set (see warnings)', fails;
  end if;
end $$;

-- Exercise public reads only. Empty CA/GB results before launch are expected.
set local role anon;
select 'US' as country, count(*) as results, coalesce(bool_and(country_code = 'US'), true) as country_matches
from public.nearby_trainers_v2(36.1627, -86.7816, 40234, 'US')
union all
select 'CA', count(*), coalesce(bool_and(country_code = 'CA'), true)
from public.nearby_trainers_v2(43.65, -79.39, 50000, 'CA')
union all
select 'GB', count(*), coalesce(bool_and(country_code = 'GB'), true)
from public.nearby_trainers_v2(54.5833, -5.9333, 40234, 'GB');
select count(*) as legacy_rpc_results from public.nearby_trainers(36.1627, -86.7816, 25);
commit;
