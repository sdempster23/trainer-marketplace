-- ============================================================================
-- Category A — set_external_calendar(): the subscription lifecycle
-- ============================================================================
-- 5 cases, each BEGIN/ROLLBACK.
--
--   A1  trainer subscribes: row created, metadata readable under RLS, and
--       the url column DENIED live (42501 — table/column privilege denial
--       is the clean-error class; only function EXECUTE denial segfaults)
--   A2  non-trainer (owner) rejected
--   A3  jwt-less rejected
--   A4  re-paste replaces url and RESETS fetch state (forces the
--       synchronous first fetch on next read — ruling 3)
--   A5  non-https URL rejected (shape gate; full SSRF layer is app-side)
--
-- Acceptance: all 5 PASS.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === A1: subscribe — metadata readable, url column denied live ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"ec160002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.set_external_calendar('https://calendar.google.com/calendar/ical/t/private-abc/basic.ics');
do $$
declare md record;
begin
  select trainer_id, last_fetch_ok, failing_since, last_fetched_at into md
    from public.trainer_external_calendars where trainer_id = auth.uid();
  if md.trainer_id is null or md.last_fetch_ok or md.failing_since is not null
     or md.last_fetched_at is not null then
    raise exception 'A1 FAIL | metadata wrong at birth';
  end if;
  begin
    perform url from public.trainer_external_calendars where trainer_id = auth.uid();
    raise exception 'A1 FAIL | url column readable by authenticated';
  exception when insufficient_privilege then
    raise notice 'A1 PASS | row born unfetched; metadata readable; url denied (42501)';
  end;
end $$;
rollback;

\echo
\echo === A2: non-trainer (owner) cannot subscribe ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"ec160001-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    perform public.set_external_calendar('https://example.com/cal.ics');
    raise exception 'A2 FAIL | owner subscribe succeeded';
  exception when others then
    if sqlerrm like '%not a trainer%' then
      raise notice 'A2 PASS | owner rejected | MSG=%', sqlerrm;
    else raise;
    end if;
  end;
end $$;
rollback;

\echo
\echo === A3: no JWT cannot subscribe ===
begin;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin
    perform public.set_external_calendar('https://example.com/cal.ics');
    raise exception 'A3 FAIL | jwt-less subscribe succeeded';
  exception when others then
    if sqlerrm like '%not a trainer%' then
      raise notice 'A3 PASS | jwt-less rejected | MSG=%', sqlerrm;
    else raise;
    end if;
  end;
end $$;
rollback;

\echo
\echo === A4: re-paste replaces url and resets fetch state ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"ec160002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.set_external_calendar('https://old.example.com/a.ics');
reset role;
-- age the row as if it had fetched and then started failing
update public.trainer_external_calendars
  set last_fetched_at = now() - interval '2 hours',
      last_attempted_at = now() - interval '2 hours',
      last_fetch_ok = true,
      failing_since = now() - interval '1 hour'
  where trainer_id = 'ec160002-0000-0000-0000-000000000002';
set local role authenticated;
select public.set_external_calendar('https://new.example.com/b.ics');
reset role;
do $$
declare md record; v_url text;
begin
  select last_fetched_at, last_attempted_at, last_fetch_ok, failing_since into md
    from public.trainer_external_calendars
    where trainer_id = 'ec160002-0000-0000-0000-000000000002';
  select url into v_url from public.trainer_external_calendars
    where trainer_id = 'ec160002-0000-0000-0000-000000000002';
  -- both timestamps reset → the new URL gets its one synchronous first fetch
  if md.last_fetched_at is null and md.last_attempted_at is null
     and md.last_fetch_ok = false
     and md.failing_since is null and v_url = 'https://new.example.com/b.ics' then
    raise notice 'A4 PASS | re-paste reset fetch AND attempt state (sync-first-fetch forced)';
  else
    raise exception 'A4 FAIL';
  end if;
end $$;
rollback;

\echo
\echo === A5: non-https rejected at the shape gate ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"ec160002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    perform public.set_external_calendar('http://example.com/cal.ics');
    raise exception 'A5 FAIL | http accepted';
  exception when others then
    if sqlerrm like '%must be https%' then
      raise notice 'A5 PASS | http rejected | MSG=%', sqlerrm;
    else raise;
    end if;
  end;
end $$;
rollback;

\echo
\echo === Category A complete (5 cases) ===
