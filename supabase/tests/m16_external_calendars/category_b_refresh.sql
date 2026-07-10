-- ============================================================================
-- Category B — refresh_external_blocks(): stale-beats-none, pinned in the DB
-- ============================================================================
-- 5 cases, each BEGIN/ROLLBACK.
--
--   B1  success: wholesale replace + last_fetched_at stamped + ok flags
--   B2  FAILURE: blocks untouched, failing_since starts — the arc's
--       safety keystone (a fetch failure must never silently unblock)
--   B3  recovery: success after failure clears failing_since
--   B4  malformed entries dropped, valid ones kept (one bad event must
--       not void a good calendar)
--   B5  no subscription → loud error (bookkeeping without a subscription
--       is state drift, not a no-op)
--
-- Acceptance: all 5 PASS.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === B1: successful refresh replaces wholesale + stamps metadata ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"ec160002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.set_external_calendar('https://example.com/a.ics');
reset role;
select public.refresh_external_blocks('ec160002-0000-0000-0000-000000000002',
  jsonb_build_array(
    jsonb_build_object('starts_at',(now()+interval '1 day')::text,'ends_at',(now()+interval '1 day 1 hour')::text),
    jsonb_build_object('starts_at',(now()+interval '2 days')::text,'ends_at',(now()+interval '2 days 30 minutes')::text)
  ), true);
select public.refresh_external_blocks('ec160002-0000-0000-0000-000000000002',
  jsonb_build_array(
    jsonb_build_object('starts_at',(now()+interval '5 days')::text,'ends_at',(now()+interval '5 days 1 hour')::text)
  ), true);
do $$
declare n int; md record;
begin
  select count(*) into n from public.trainer_external_busy_blocks
    where trainer_id = 'ec160002-0000-0000-0000-000000000002';
  select last_fetched_at, last_fetch_ok, failing_since into md
    from public.trainer_external_calendars
    where trainer_id = 'ec160002-0000-0000-0000-000000000002';
  if n = 1 and md.last_fetch_ok and md.failing_since is null and md.last_fetched_at is not null then
    raise notice 'B1 PASS | second fetch REPLACED the first (2->1); metadata stamped';
  else
    raise exception 'B1 FAIL | n=% ok=%', n, md.last_fetch_ok;
  end if;
end $$;
rollback;

\echo
\echo === B2: FAILED fetch — blocks untouched, failing_since starts ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"ec160002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.set_external_calendar('https://example.com/a.ics');
reset role;
select public.refresh_external_blocks('ec160002-0000-0000-0000-000000000002',
  jsonb_build_array(
    jsonb_build_object('starts_at',(now()+interval '1 day')::text,'ends_at',(now()+interval '1 day 1 hour')::text)
  ), true);
-- age last_attempted_at so we can prove the failures ADVANCE it (backoff)
update public.trainer_external_calendars
  set last_attempted_at = now() - interval '1 hour'
  where trainer_id = 'ec160002-0000-0000-0000-000000000002';
select public.refresh_external_blocks('ec160002-0000-0000-0000-000000000002', null, false);
select public.refresh_external_blocks('ec160002-0000-0000-0000-000000000002', null, false);
do $$
declare n int; md record;
begin
  select count(*) into n from public.trainer_external_busy_blocks
    where trainer_id = 'ec160002-0000-0000-0000-000000000002';
  select last_fetch_ok, failing_since, last_fetched_at, last_attempted_at into md
    from public.trainer_external_calendars
    where trainer_id = 'ec160002-0000-0000-0000-000000000002';
  if n = 1 and md.last_fetch_ok = false and md.failing_since is not null
     and md.last_fetched_at is not null
     -- the DoS-fix invariant: a FAILED fetch advances last_attempted_at
     -- (so the app backs off to the TTL instead of re-blocking forever)
     and md.last_attempted_at > now() - interval '1 minute' then
    raise notice 'B2 PASS | stale block HELD; failing_since set; last_fetched_at preserved; last_attempted_at ADVANCED on failure (backoff)';
  else
    raise exception 'B2 FAIL | n=% ok=% failing=% attempted=%', n, md.last_fetch_ok, md.failing_since, md.last_attempted_at;
  end if;
end $$;
rollback;

\echo
\echo === B3: recovery clears failing_since ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"ec160002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.set_external_calendar('https://example.com/a.ics');
reset role;
select public.refresh_external_blocks('ec160002-0000-0000-0000-000000000002', null, false);
select public.refresh_external_blocks('ec160002-0000-0000-0000-000000000002',
  jsonb_build_array(
    jsonb_build_object('starts_at',(now()+interval '1 day')::text,'ends_at',(now()+interval '1 day 1 hour')::text)
  ), true);
do $$
declare md record;
begin
  select last_fetch_ok, failing_since into md
    from public.trainer_external_calendars
    where trainer_id = 'ec160002-0000-0000-0000-000000000002';
  if md.last_fetch_ok and md.failing_since is null then
    raise notice 'B3 PASS | success after failure clears failing_since';
  else
    raise exception 'B3 FAIL';
  end if;
end $$;
rollback;

\echo
\echo === B4: malformed entries dropped, valid kept ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"ec160002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.set_external_calendar('https://example.com/a.ics');
reset role;
select public.refresh_external_blocks('ec160002-0000-0000-0000-000000000002',
  jsonb_build_array(
    jsonb_build_object('starts_at',(now()+interval '1 day')::text,'ends_at',(now()+interval '1 day 1 hour')::text),
    jsonb_build_object('starts_at',(now()+interval '2 days')::text,'ends_at',(now()+interval '2 days')::text),
    jsonb_build_object('starts_at',(now()+interval '3 days')::text),
    jsonb_build_object('ends_at',(now()+interval '4 days')::text)
  ), true);
do $$
declare n int;
begin
  select count(*) into n from public.trainer_external_busy_blocks
    where trainer_id = 'ec160002-0000-0000-0000-000000000002';
  if n = 1 then
    raise notice 'B4 PASS | zero-length + partial entries dropped; the 1 valid block stored';
  else
    raise exception 'B4 FAIL | % blocks stored (want 1)', n;
  end if;
end $$;
rollback;

\echo
\echo === B5: refresh without a subscription is a loud error ===
begin;
do $$ begin
  begin
    perform public.refresh_external_blocks('ec160003-0000-0000-0000-000000000003', '[]'::jsonb, true);
    raise exception 'B5 FAIL | refresh without subscription succeeded';
  exception when others then
    if sqlerrm like '%No external calendar subscription%' then
      raise notice 'B5 PASS | unsubscribed refresh rejected | MSG=%', sqlerrm;
    else raise;
    end if;
  end;
end $$;
rollback;

\echo
\echo === Category B complete (5 cases) ===
