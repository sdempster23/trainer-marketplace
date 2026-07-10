-- ============================================================================
-- Category C — trainer_busy_ranges: the M16 union arm
-- ============================================================================
-- 4 cases, each BEGIN/ROLLBACK. The M12 suite re-runs UNAMENDED in the
-- regression chain — that is the contract-to-existing-callers proof; these
-- cases cover only what M16 ADDED.
--
--   C1  union: booking + external ranges, one ordered stream, same shape
--   C2  future bound holds on the external arm (past block excluded;
--       in-progress block's tail still blocks)
--   C3  cross-trainer isolation (A's blocks never in B's ranges)
--   C4  remove subscription → CASCADE → RPC returns to bookings-only
--
-- Acceptance: all 4 PASS.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === C1: union — booking + external, ordered, same shape ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"ec160002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.set_external_calendar('https://example.com/a.ics');
reset role;
select public.refresh_external_blocks('ec160002-0000-0000-0000-000000000002',
  jsonb_build_array(
    jsonb_build_object('starts_at',(now()+interval '1 day')::text,'ends_at',(now()+interval '1 day 1 hour')::text),
    jsonb_build_object('starts_at',(now()+interval '3 days')::text,'ends_at',(now()+interval '3 days 1 hour')::text)
  ), true);
do $$
declare n int; r record; prev timestamptz := '-infinity';
begin
  select count(*) into n from public.trainer_busy_ranges('ec160002-0000-0000-0000-000000000002');
  if n <> 3 then
    raise exception 'C1 FAIL | % ranges (want 3: 1 booking + 2 external)', n;
  end if;
  for r in select * from public.trainer_busy_ranges('ec160002-0000-0000-0000-000000000002') loop
    if r.starts_at < prev then raise exception 'C1 FAIL | not ordered'; end if;
    if r.ends_at <= r.starts_at then raise exception 'C1 FAIL | non-positive range'; end if;
    prev := r.starts_at;
  end loop;
  raise notice 'C1 PASS | 3 ranges, one ordered stream, positive ranges, no source distinction';
end $$;
rollback;

\echo
\echo === C2: future bound on the external arm ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"ec160002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.set_external_calendar('https://example.com/a.ics');
reset role;
select public.refresh_external_blocks('ec160002-0000-0000-0000-000000000002',
  jsonb_build_array(
    -- ended yesterday: must NOT appear
    jsonb_build_object('starts_at',(now()-interval '1 day 1 hour')::text,'ends_at',(now()-interval '1 day')::text),
    -- in progress (started 30m ago, ends in 30m): tail still blocks
    jsonb_build_object('starts_at',(now()-interval '30 minutes')::text,'ends_at',(now()+interval '30 minutes')::text)
  ), true);
do $$
declare n int; n_past int;
begin
  select count(*) into n from public.trainer_busy_ranges('ec160002-0000-0000-0000-000000000002');
  select count(*) into n_past from public.trainer_busy_ranges('ec160002-0000-0000-0000-000000000002')
    where ends_at <= now();
  if n = 2 and n_past = 0 then
    raise notice 'C2 PASS | past external excluded; in-progress tail blocks (booking + 1)';
  else
    raise exception 'C2 FAIL | n=% past=%', n, n_past;
  end if;
end $$;
rollback;

\echo
\echo === C3: cross-trainer isolation ===
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
do $$
declare n int;
begin
  select count(*) into n from public.trainer_busy_ranges('ec160003-0000-0000-0000-000000000003');
  if n = 0 then
    raise notice 'C3 PASS | trainer B''s ranges contain none of A''s blocks or bookings';
  else
    raise exception 'C3 FAIL | leaked % ranges', n;
  end if;
end $$;
rollback;

\echo
\echo === C4: remove subscription — cascade returns RPC to bookings-only ===
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
set local role authenticated;
delete from public.trainer_external_calendars
  where trainer_id = 'ec160002-0000-0000-0000-000000000002';
reset role;
do $$
declare n_blocks int; n_ranges int;
begin
  select count(*) into n_blocks from public.trainer_external_busy_blocks
    where trainer_id = 'ec160002-0000-0000-0000-000000000002';
  select count(*) into n_ranges from public.trainer_busy_ranges('ec160002-0000-0000-0000-000000000002');
  if n_blocks = 0 and n_ranges = 1 then
    raise notice 'C4 PASS | remove cascaded blocks away; RPC = bookings-only again (slots unblock)';
  else
    raise exception 'C4 FAIL | blocks=% ranges=%', n_blocks, n_ranges;
  end if;
end $$;
rollback;

\echo
\echo === Category C complete (4 cases) ===
