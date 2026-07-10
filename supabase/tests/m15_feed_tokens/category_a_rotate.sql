-- ============================================================================
-- Category A — rotate_feed_token(): the only write path
-- ============================================================================
-- 4 cases, each BEGIN/ROLLBACK. Tokens cross psql/DO boundaries via
-- transaction-local GUCs (set_config(..., true)) — psql :vars do not
-- interpolate inside dollar-quoted bodies.
--
--   A1  first generate: 64-hex plaintext returned; sha256 (and ONLY the
--       sha256) at rest; rotated_at NULL
--   A2  rotate: hash swaps in place, rotated_at stamps, OLD token dead
--       (feed read returns empty for it)
--   A3  owner (non-trainer) rotate rejected
--   A4  no-JWT rotate rejected (auth.uid() null)
--
-- Acceptance: all 4 PASS.
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

\echo
\echo === A1: first generate — plaintext once, sha256 at rest ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"feed0002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.rotate_feed_token() as tok \gset
select set_config('m15.tok', :'tok', true);
reset role;
do $$ begin
  if length(current_setting('m15.tok')) = 64
     and current_setting('m15.tok') ~ '^[0-9a-f]{64}$'
     and exists (select 1 from public.trainer_feed_tokens
                 where trainer_id = 'feed0002-0000-0000-0000-000000000002'
                   and token_hash = extensions.digest(current_setting('m15.tok'),'sha256')
                   and rotated_at is null) then
    raise notice 'A1 PASS | 64-hex plaintext returned once; sha256 at rest; rotated_at null';
  else
    raise exception 'A1 FAIL';
  end if;
end $$;
rollback;

\echo
\echo === A2: rotation swaps hash, stamps rotated_at, kills the old URL ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"feed0002-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.rotate_feed_token() as tok1 \gset
select set_config('m15.tok1', :'tok1', true);
select public.rotate_feed_token() as tok2 \gset
select set_config('m15.tok2', :'tok2', true);
reset role;
do $$ begin
  if current_setting('m15.tok1') <> current_setting('m15.tok2')
     and exists (select 1 from public.trainer_feed_tokens
                 where trainer_id = 'feed0002-0000-0000-0000-000000000002'
                   and token_hash = extensions.digest(current_setting('m15.tok2'),'sha256')
                   and rotated_at is not null)
     and (select count(*) from public.trainer_feed_tokens
          where trainer_id = 'feed0002-0000-0000-0000-000000000002') = 1
     and (select count(*) from public.trainer_feed_events(current_setting('m15.tok1'))) = 0
     and (select count(*) from public.trainer_feed_events(current_setting('m15.tok2'))) > 0 then
    raise notice 'A2 PASS | in-place swap, rotated_at set, old token serves nothing';
  else
    raise exception 'A2 FAIL';
  end if;
end $$;
rollback;

\echo
\echo === A3: non-trainer (owner) cannot rotate ===
begin;
select set_config('request.jwt.claims',
  '{"sub":"feed0001-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    perform public.rotate_feed_token();
    raise exception 'A3 FAIL | owner rotate succeeded';
  exception when others then
    if sqlerrm like '%not a trainer%' then
      raise notice 'A3 PASS | owner rotate rejected | MSG=%', sqlerrm;
    else raise;
    end if;
  end;
end $$;
rollback;

\echo
\echo === A4: no JWT (auth.uid() null) cannot rotate ===
begin;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin
    perform public.rotate_feed_token();
    raise exception 'A4 FAIL | jwt-less rotate succeeded';
  exception when others then
    if sqlerrm like '%not a trainer%' then
      raise notice 'A4 PASS | jwt-less rotate rejected | MSG=%', sqlerrm;
    else raise;
    end if;
  end;
end $$;
rollback;

\echo
\echo === Category A complete (4 cases) ===
