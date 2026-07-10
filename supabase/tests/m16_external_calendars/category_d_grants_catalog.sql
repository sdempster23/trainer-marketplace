-- ============================================================================
-- Category D — grants, the url tripwire, EXECUTE lanes, catalog pins
-- ============================================================================
-- 5 checks. EXECUTE denial via has_function_privilege ONLY (M12 segfault
-- convention); column privileges via has_column_privilege.
--
--   D1  THE URL TRIPWIRE (ruling 1): url column SELECT absent for EVERY
--       api role — a future table-level GRANT SELECT flips these to true
--       and fails loud. Metadata columns present for authenticated only.
--   D2  table matrices: anon {} both tables; authenticated calendars
--       {DELETE + column-scoped SELECT}, blocks {SELECT} only;
--       service_role DML {} both (the M14 position)
--   D3  EXECUTE matrix: set → authenticated only; to_fetch + refresh →
--       service_role only
--   D4  C4-posture pins: all three M16-touched functions (two new + the
--       amended trainer_busy_ranges) SECURITY DEFINER with the EXACT
--       search_path="" pin; volatility as declared
--   D5  policy set: exactly 3 policies across the two tables, all
--       roles={authenticated}, cmds as declared
--
-- Acceptance: all 5 PASS.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === D1: url ABSENT for every role; metadata for authenticated only ===
do $$
declare
  r text; c text; fails int := 0;
  -- The UI-facing metadata columns authenticated may read. last_attempted_at
  -- is deliberately NOT here: it is backoff-internal, read only via the
  -- service_role DEFINER lane (external_calendar_to_fetch), never by the card.
  meta_cols text[] := array['trainer_id','created_at','last_fetched_at','last_fetch_ok','failing_since'];
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if has_column_privilege(r, 'public.trainer_external_calendars', 'url', 'SELECT') then
      raise warning 'D1 TRIPWIRE | % can SELECT url (table-level grant leaked it?)', r;
      fails := fails + 1;
    end if;
  end loop;
  foreach c in array meta_cols loop
    if not has_column_privilege('authenticated', 'public.trainer_external_calendars', c, 'SELECT') then
      raise warning 'D1 MISSING | authenticated lacks SELECT on metadata col %', c;
      fails := fails + 1;
    end if;
    if has_column_privilege('anon', 'public.trainer_external_calendars', c, 'SELECT') then
      raise warning 'D1 STRAY | anon can SELECT %', c;
      fails := fails + 1;
    end if;
  end loop;
  if fails = 0 then
    raise notice 'D1 PASS | url invisible to anon/authenticated/service_role; metadata authenticated-only';
  else
    raise exception 'D1 FAIL | % problems', fails;
  end if;
end $$;

\echo
\echo === D2: table matrices (anon {}, authenticated minimal, service_role {} DML) ===
do $$
declare p text; fails int := 0;
begin
  foreach p in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if has_table_privilege('service_role','public.trainer_external_calendars',p) then
      raise warning 'D2 STRAY | service_role % on calendars', p; fails := fails + 1;
    end if;
    if has_table_privilege('service_role','public.trainer_external_busy_blocks',p) then
      raise warning 'D2 STRAY | service_role % on blocks', p; fails := fails + 1;
    end if;
    if has_table_privilege('anon','public.trainer_external_calendars',p)
       or has_table_privilege('anon','public.trainer_external_busy_blocks',p) then
      raise warning 'D2 STRAY | anon % somewhere', p; fails := fails + 1;
    end if;
  end loop;
  -- authenticated: calendars DELETE yes, INSERT/UPDATE no (writes are
  -- function-only); blocks SELECT yes, everything else no.
  if not has_table_privilege('authenticated','public.trainer_external_calendars','DELETE') then
    raise warning 'D2 MISSING | authenticated DELETE on calendars'; fails := fails + 1;
  end if;
  foreach p in array array['INSERT','UPDATE'] loop
    if has_table_privilege('authenticated','public.trainer_external_calendars',p) then
      raise warning 'D2 STRAY | authenticated % on calendars', p; fails := fails + 1;
    end if;
  end loop;
  if not has_table_privilege('authenticated','public.trainer_external_busy_blocks','SELECT') then
    raise warning 'D2 MISSING | authenticated SELECT on blocks'; fails := fails + 1;
  end if;
  foreach p in array array['INSERT','UPDATE','DELETE'] loop
    if has_table_privilege('authenticated','public.trainer_external_busy_blocks',p) then
      raise warning 'D2 STRAY | authenticated % on blocks', p; fails := fails + 1;
    end if;
  end loop;
  if fails = 0 then
    raise notice 'D2 PASS | anon {} + service_role DML {} on both; authenticated exactly {col-SELECT,DELETE}/{SELECT}';
  else
    raise exception 'D2 FAIL | % mismatches', fails;
  end if;
end $$;

\echo
\echo === D3: EXECUTE matrix (has_function_privilege only) ===
do $$ begin
  if     has_function_privilege('authenticated','public.set_external_calendar(text)','EXECUTE')
     and not has_function_privilege('anon','public.set_external_calendar(text)','EXECUTE')
     and not has_function_privilege('service_role','public.set_external_calendar(text)','EXECUTE')
     and has_function_privilege('service_role','public.external_calendar_to_fetch(uuid)','EXECUTE')
     and not has_function_privilege('anon','public.external_calendar_to_fetch(uuid)','EXECUTE')
     and not has_function_privilege('authenticated','public.external_calendar_to_fetch(uuid)','EXECUTE')
     and has_function_privilege('service_role','public.refresh_external_blocks(uuid, jsonb, boolean)','EXECUTE')
     and not has_function_privilege('anon','public.refresh_external_blocks(uuid, jsonb, boolean)','EXECUTE')
     and not has_function_privilege('authenticated','public.refresh_external_blocks(uuid, jsonb, boolean)','EXECUTE') then
    raise notice 'D3 PASS | set: authenticated only; to_fetch + refresh: service_role only';
  else
    raise exception 'D3 FAIL | EXECUTE matrix off the ruled lanes';
  end if;
end $$;

\echo
\echo === D4: C4-posture pins (DEFINER + exact empty search_path + volatility) ===
do $$
declare r record; fails int := 0;
begin
  for r in
    select * from (values
      ('set_external_calendar',      'v'),
      ('external_calendar_to_fetch', 's'),
      ('refresh_external_blocks',    'v'),
      ('trainer_busy_ranges',        's')   -- still DEFINER+pinned after the amend
    ) as m(fname, vol)
  loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = r.fname
        and p.prosecdef
        and p.provolatile = r.vol
        and p.proconfig @> array['search_path=""']  -- EXACT pin (M15 lesson)
    ) then
      raise warning 'D4 OFF | % posture wrong', r.fname;
      fails := fails + 1;
    end if;
  end loop;
  if fails = 0 then
    raise notice 'D4 PASS | all four functions DEFINER + search_path="" exact + declared volatility';
  else
    raise exception 'D4 FAIL | % functions off-posture', fails;
  end if;
end $$;

\echo
\echo === D5: policy set pins ===
do $$
declare n int;
begin
  select count(*) into n from pg_policies
  where schemaname='public'
    and tablename in ('trainer_external_calendars','trainer_external_busy_blocks');
  if n <> 3 or exists (
       select 1 from pg_policies
       where schemaname='public'
         and tablename in ('trainer_external_calendars','trainer_external_busy_blocks')
         and roles <> '{authenticated}') then
    raise exception 'D5 FAIL | policy set drifted (% policies)', n;
  end if;
  if not exists (select 1 from pg_policies where tablename='trainer_external_calendars' and cmd='SELECT')
     or not exists (select 1 from pg_policies where tablename='trainer_external_calendars' and cmd='DELETE')
     or not exists (select 1 from pg_policies where tablename='trainer_external_busy_blocks' and cmd='SELECT') then
    raise exception 'D5 FAIL | expected cmd set missing';
  end if;
  raise notice 'D5 PASS | exactly 3 authenticated policies with the declared cmds';
end $$;

\echo
\echo === Category D complete (5 checks) ===
