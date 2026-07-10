-- ============================================================================
-- Category B — trainer_feed_events(): the feed's one read
-- ============================================================================
-- 6 cases, each BEGIN/ROLLBACK (tokens minted in-case via rotate).
--
--   B1  right token: exactly the 3 in-window fixture bookings, names
--       joined, CANCELLED included (ruling 1), ordered by starts_at
--   B2  wrong + null token: EMPTY, not an error (ruling 5)
--   B3  cross-trainer isolation: trainer B's token sees none of A's rows
--   B4  window: the 70-day-old CANCELLED row is excluded (ruling 2)
--   B5  soft-deleted dog/service still render — history is preserved
--   B6  the valid-but-empty distinction (§6): a real token over zero
--       bookings is exists=TRUE + empty events; a bad token is
--       exists=FALSE — the route's 404-vs-empty-calendar fork
--
-- Acceptance: all 6 PASS.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === B1: right token — 3 in-window rows, names joined, CANCELLED present ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"feed0002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.rotate_feed_token() as tok \gset
select set_config('m15.tok', :'tok', true);
reset role;
do $$
declare
  n int; n_cancelled int; first_row record;
begin
  select count(*) into n from public.trainer_feed_events(current_setting('m15.tok'));
  select count(*) into n_cancelled from public.trainer_feed_events(current_setting('m15.tok'))
    where status = 'CANCELLED';
  select * into first_row from public.trainer_feed_events(current_setting('m15.tok')) limit 1;

  if n = 3 and n_cancelled = 1
     and first_row.booking_id = 'feed0008-0000-0000-0000-000000000008'  -- oldest in-window first
     and first_row.owner_display_name = 'Feed Owner'
     and first_row.dog_name = 'Rex'
     and first_row.service_name = 'Basic obedience'
     and first_row.ends_at = first_row.starts_at + interval '60 minutes' then
    raise notice 'B1 PASS | 3 rows (PENDING+CONFIRMED+in-window CANCELLED), names joined, starts_at order';
  else
    raise exception 'B1 FAIL | n=% cancelled=% first=%', n, n_cancelled, first_row.booking_id;
  end if;
end $$;
rollback;

\echo
\echo === B2: wrong + null token — EMPTY, never an error ===
begin;
do $$
declare n1 int; n2 int;
begin
  select count(*) into n1 from public.trainer_feed_events('deadbeef');
  select count(*) into n2 from public.trainer_feed_events(null);
  if n1 = 0 and n2 = 0 then
    raise notice 'B2 PASS | wrong token 0 rows, null token 0 rows, no error raised';
  else
    raise exception 'B2 FAIL | %/%', n1, n2;
  end if;
end $$;
rollback;

\echo
\echo === B3: cross-trainer isolation — B''s token, none of A''s bookings ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"feed0003-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select public.rotate_feed_token() as tok_b \gset
select set_config('m15.tok_b', :'tok_b', true);
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.trainer_feed_events(current_setting('m15.tok_b'));
  if n = 0 then
    raise notice 'B3 PASS | trainer B''s valid token returns zero of A''s rows';
  else
    raise exception 'B3 FAIL | leaked % rows across trainers', n;
  end if;
end $$;
rollback;

\echo
\echo === B4: the 70-day-old row is outside the 60-day window ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"feed0002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.rotate_feed_token() as tok \gset
select set_config('m15.tok', :'tok', true);
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.trainer_feed_events(current_setting('m15.tok'))
    where booking_id = 'feed0009-0000-0000-0000-000000000009';
  if n = 0 then
    raise notice 'B4 PASS | 70d-old CANCELLED excluded (FEED_WINDOW_PAST_DAYS = 60d holds)';
  else
    raise exception 'B4 FAIL | out-of-window row leaked';
  end if;
end $$;
rollback;

\echo
\echo === B5: soft-deleted dog + service still render (history preserved) ===
begin;
update public.dogs set deleted_at = now()
  where id = 'feed0004-0000-0000-0000-000000000004';
update public.trainer_services set deleted_at = now()
  where id = 'feed0005-0000-0000-0000-000000000005';
select set_config('request.jwt.claims',
  '{"sub":"feed0002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.rotate_feed_token() as tok \gset
select set_config('m15.tok', :'tok', true);
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.trainer_feed_events(current_setting('m15.tok'))
    where dog_name = 'Rex' and service_name = 'Basic obedience';
  if n = 3 then
    raise notice 'B5 PASS | soft-deleted dog/service names still render on existing bookings';
  else
    raise exception 'B5 FAIL | history dropped: % of 3 rows named', n;
  end if;
end $$;
rollback;

\echo
\echo === B6: valid-but-empty feed vs invalid token (the §6 distinction) ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"feed0003-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select public.rotate_feed_token() as tok_b \gset
select set_config('m15.tok_b', :'tok_b', true);
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.trainer_feed_events(current_setting('m15.tok_b'));
  if public.feed_token_exists(current_setting('m15.tok_b')) = true
     and n = 0
     and public.feed_token_exists('deadbeef') = false
     and public.feed_token_exists(null) is not true then
    raise notice 'B6 PASS | valid-but-empty: exists=t + 0 events; bad/null token: exists=f';
  else
    raise exception 'B6 FAIL | exists/events fork broken (n=%)', n;
  end if;
end $$;
rollback;

\echo
\echo === Category B complete (6 cases) ===
