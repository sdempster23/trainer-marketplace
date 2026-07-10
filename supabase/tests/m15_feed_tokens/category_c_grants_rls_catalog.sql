-- ============================================================================
-- Category C — grants, RLS scope, and catalog pins
-- ============================================================================
-- 5 cases. EXECUTE denial asserted via has_function_privilege ONLY — never
-- a live denied call (the M12 segfault convention, still standing under
-- v2.109).
--
--   C1  RLS: each trainer reads exactly their own token row
--   C2  table grant matrix: anon {} and authenticated {SELECT,DELETE}
--       across all 7 verbs (M7-1 shape); service_role DML {} — the M14
--       contract's declared position for this table
--   C3  EXECUTE matrix: rotate = authenticated only; feed_events =
--       service_role only
--   C4  catalog pins: both functions SECURITY DEFINER, search_path='',
--       rotate VOLATILE / feed_events STABLE; exactly the two declared
--       policies on the table, both roles={authenticated}
--   C5  disable: trainer deletes own row (feed dies); cannot delete the
--       other trainer's row
--
-- Acceptance: all 5 PASS.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === C1: RLS — own token row only ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"feed0002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.rotate_feed_token() as tok_a \gset
reset role;
select set_config('request.jwt.claims',
  '{"sub":"feed0003-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select public.rotate_feed_token() as tok_b \gset
do $$
declare n int; own int;
begin
  select count(*),
         count(*) filter (where trainer_id = 'feed0003-0000-0000-0000-000000000003')
    into n, own
  from public.trainer_feed_tokens;
  if n = 1 and own = 1 then
    raise notice 'C1 PASS | with two token rows present, trainer B sees exactly their own';
  else
    raise exception 'C1 FAIL | saw % rows (% own)', n, own;
  end if;
end $$;
rollback;

\echo
\echo === C2: table grant matrix (M7-1 shape; service_role = the M14 {} position) ===
do $$
declare
  r record; priv text; expected boolean; actual boolean; fails int := 0;
  all_privs text[] := array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
begin
  for r in
    select * from (values
      ('anon',          array[]::text[]),
      ('authenticated', array['SELECT','DELETE'])
    ) as m(role_name, granted)
  loop
    foreach priv in array all_privs loop
      expected := priv = any(r.granted);
      actual := has_table_privilege(r.role_name, 'public.trainer_feed_tokens', priv);
      if actual <> expected then
        raise warning 'C2 MISMATCH | % | % | expected=% actual=%', r.role_name, priv, expected, actual;
        fails := fails + 1;
      end if;
    end loop;
  end loop;
  -- service_role: DML-only assertion (the M14 contract — housekeeping
  -- verbs are the platform's, not ours to pin)
  foreach priv in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if has_table_privilege('service_role', 'public.trainer_feed_tokens', priv) then
      raise warning 'C2 STRAY | service_role holds % (declared position is {})', priv;
      fails := fails + 1;
    end if;
  end loop;
  if fails = 0 then
    raise notice 'C2 PASS | anon {}; authenticated {SELECT,DELETE}; service_role DML {} (M14 position)';
  else
    raise exception 'C2 FAIL | % mismatches', fails;
  end if;
end $$;

\echo
\echo === C3: EXECUTE matrix (has_function_privilege only — M12 convention) ===
do $$ begin
  if     has_function_privilege('authenticated','public.rotate_feed_token()','EXECUTE')
     and not has_function_privilege('anon','public.rotate_feed_token()','EXECUTE')
     and not has_function_privilege('service_role','public.rotate_feed_token()','EXECUTE')
     and has_function_privilege('service_role','public.trainer_feed_events(text)','EXECUTE')
     and not has_function_privilege('anon','public.trainer_feed_events(text)','EXECUTE')
     and not has_function_privilege('authenticated','public.trainer_feed_events(text)','EXECUTE')
     and has_function_privilege('service_role','public.feed_token_exists(text)','EXECUTE')
     and not has_function_privilege('anon','public.feed_token_exists(text)','EXECUTE')
     and not has_function_privilege('authenticated','public.feed_token_exists(text)','EXECUTE') then
    raise notice 'C3 PASS | rotate: authenticated only; feed_events + token_exists: service_role only';
  else
    raise exception 'C3 FAIL | EXECUTE matrix off the ruled lanes';
  end if;
end $$;

\echo
\echo === C4: catalog pins — DEFINER, search_path, volatility, policy set ===
do $$
declare
  n_policies int;
begin
  if not (select p.prosecdef and p.provolatile = 'v'
              and p.proconfig @> array['search_path=""']  -- EXACT empty pin:
              -- a substring match would bless search_path=public — the
              -- DEFINER shadowing surface this pin exists to forbid
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.proname='rotate_feed_token') then
    raise exception 'C4 FAIL | rotate_feed_token catalog posture off';
  end if;
  if not (select p.prosecdef and p.provolatile = 's'
              and p.proconfig @> array['search_path=""']  -- EXACT empty pin:
              -- a substring match would bless search_path=public — the
              -- DEFINER shadowing surface this pin exists to forbid
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.proname='trainer_feed_events') then
    raise exception 'C4 FAIL | trainer_feed_events catalog posture off';
  end if;
  if not (select p.prosecdef and p.provolatile = 's'
              and p.proconfig @> array['search_path=""']  -- EXACT empty pin:
              -- a substring match would bless search_path=public — the
              -- DEFINER shadowing surface this pin exists to forbid
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.proname='feed_token_exists') then
    raise exception 'C4 FAIL | feed_token_exists catalog posture off';
  end if;
  select count(*) into n_policies
  from pg_policies
  where schemaname='public' and tablename='trainer_feed_tokens';
  if n_policies <> 2 or exists (
       select 1 from pg_policies
       where schemaname='public' and tablename='trainer_feed_tokens'
         and roles <> '{authenticated}') then
    raise exception 'C4 FAIL | policy set drifted (% policies)', n_policies;
  end if;
  raise notice 'C4 PASS | DEFINER+search_path pinned; volatile/stable; exactly 2 authenticated policies';
end $$;

\echo
\echo === C5: disable — delete own row only; feed dies with it ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"feed0002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.rotate_feed_token() as tok_a \gset
select set_config('m15.tok_a', :'tok_a', true);
reset role;
select set_config('request.jwt.claims',
  '{"sub":"feed0003-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select public.rotate_feed_token() as tok_b \gset
-- Trainer B tries to delete A's row (RLS: 0 rows), then deletes their own.
delete from public.trainer_feed_tokens
  where trainer_id = 'feed0002-0000-0000-0000-000000000002';
delete from public.trainer_feed_tokens
  where trainer_id = 'feed0003-0000-0000-0000-000000000003';
reset role;
do $$
declare a_alive int; b_alive int; a_feed int;
begin
  select count(*) into a_alive from public.trainer_feed_tokens
    where trainer_id = 'feed0002-0000-0000-0000-000000000002';
  select count(*) into b_alive from public.trainer_feed_tokens
    where trainer_id = 'feed0003-0000-0000-0000-000000000003';
  select count(*) into a_feed from public.trainer_feed_events(current_setting('m15.tok_a'));
  if a_alive = 1 and b_alive = 0 and a_feed = 3 then
    raise notice 'C5 PASS | cross-trainer delete no-ops (RLS); own delete disables own feed only';
  else
    raise exception 'C5 FAIL | a_alive=% b_alive=% a_feed=%', a_alive, b_alive, a_feed;
  end if;
end $$;
rollback;

\echo
\echo === Category C complete (5 cases) ===
