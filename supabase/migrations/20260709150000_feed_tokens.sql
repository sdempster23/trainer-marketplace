-- ============================================================================
-- M15 — trainer feed tokens + the ICS feed's read (calendar bridge, EXPORT)
-- ============================================================================
-- Four objects: the token table, the rotate function, the feed-events read,
-- and the token-existence check. Together they are the entire DB surface of
-- the calendar-export arc:
-- a secret per-trainer URL whose token is the WHOLE credential for an
-- unauthenticated calendar poll (Google/Apple/Outlook present no JWT).
--
-- RULINGS APPLIED (investigation QA'd 2026-07-09, all five):
--   (1) CANCELLED bookings stay in the feed while in-window (the read
--       returns them; the route maps STATUS:CANCELLED — never silent
--       omission, same UID across the transition).
--   (2) Window: rolling 60 days past + all future — FEED_WINDOW_PAST_DAYS,
--       the named constant in trainer_feed_events.
--   (3) Full display names in events; the privacy remedy is ROTATION, not
--       content degradation.
--   (4) Token HASHED at rest (sha256). The plaintext exists only in the
--       rotate function's return value — shown once, never stored, never
--       re-shown. Rotation is one call, no arguments.
--   (5) The counterparty read is DEFINER-as-API (the M12 lane), token
--       hash-validated IN-BODY, EXECUTE to service_role only. A bad token
--       returns EMPTY, not an error — the route 404s identically for
--       wrong vs nonexistent.
--       COROLLARY THAT FORCED §6 (caught drafting the route): "bad token →
--       EMPTY" makes an INVALID token and a VALID-token-with-zero-in-window-
--       bookings indistinguishable from the events read alone — and the
--       valid-empty case is exactly the first real trainer's day one (feed
--       generated, no bookings yet). Serving them a 404 would present as
--       broken in Google. feed_token_exists() (§6) gives the route the
--       distinction: invalid → 404; valid-but-empty → 200 with an empty
--       calendar. Same DEFINER lane, same EXECUTE audience, boolean answer
--       only (deliberately not trainer_id — the route needs existence, not
--       identity; YAGNI).
--
-- WHY A TABLE AND NOT A COLUMN ON trainers (the investigation's standout):
-- trainers is anon-SELECT — the public directory (M7-1 pins
-- trainers/anon = [SELECT]) — and policies are row-level, so any token
-- column there would be readable by the entire internet through the
-- existing directory path. The separate table gets the M5 treatment:
-- ROW ABSENCE IS A FIRST-CLASS STATE (no row = feed not enabled; the
-- route 404s), and disable = the trainer deletes their row.
--
-- THE WRITE MODEL (an M5 two-gate variant): no INSERT or UPDATE policy
-- exists and no INSERT/UPDATE grant exists for ANY api role — a token can
-- only come into existence through rotate_feed_token(), which generates
-- server-side (gen_random_bytes(32) → 64-char hex; ~256 bits). A
-- client-chosen token is impossible by construction, not by review.
-- DELETE is deliberately policy'd + granted to authenticated (own row
-- only): disable is an owner action with no server judgement in it, so it
-- rides RLS rather than a third function. SELECT (own row) exists for the
-- settings surface — the row's METADATA (created_at/rotated_at = "feed
-- enabled since / last rotated"); the hash it also exposes is
-- preimage-resistant and mints nothing.
--
-- service_role position on this table: {} — NOTHING (ruled). The M14
-- catalog matrix asserts it automatically (an undeclared table expects
-- empty), and the M15 suite pins it locally. The feed route reads through
-- trainer_feed_events' EXECUTE, not through table grants.
--
-- THE M12 CONVENTIONS, INHERITED BY BOTH FUNCTIONS:
--   - SECURITY DEFINER with set search_path = '' (everything qualified;
--     pgcrypto's gen_random_bytes/digest live in the extensions schema).
--   - DIRECT-RPC-ONLY, FOREVER: never referenced inside any policy (the
--     DEFINER-inside-policy SIGSEGV, M11/M12 journal entries).
--   - Suites assert EXECUTE denial via has_function_privilege ONLY (the
--     denial-path segfault survives v2.109 — M12 convention).
--
-- trainer_feed_events' DEFINER argument is M12's, near-verbatim: the
-- answer requires rows the caller must never see (all four joined tables
-- are authenticated+party-scoped; the poller is nobody), and a function
-- fixes the QUESTION SHAPE — exactly the feed's field set, window-bounded
-- in-body — where any policy/grant path would expose queryable relations.
-- Joins deliberately do NOT filter deleted_at on dogs/services/profiles:
-- history renders (a completed booking against a since-deleted dog still
-- shows its name — same preserved-history stance as M6's soft-delete
-- design).
--
-- NOTED, NOT MITIGATED: token comparison is a btree probe on sha256
-- digests, not a constant-time compare. An attacker timing hash-equality
-- across HTTPS + PostgREST to recover a digest they'd still have to
-- preimage is not a real adversary for this surface; recorded so the
-- decision is visible.
--
-- Probed rolled-back before this file was written (P1–P6b): generate/
-- rotate lifecycle, non-trainer rejection, right-token rows with joined
-- names, wrong/null-token EMPTY, cross-trainer isolation, 60-day window
-- exclusion, RLS own-row scope, and the full grant/EXECUTE matrix — all
-- green, rollback clean. Probe finding worth keeping: handle_new_user
-- copies ONLY role from signup metadata; display_name is app-set later
-- (fixtures must set it explicitly).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Table: trainer_feed_tokens
-- ----------------------------------------------------------------------------
create table public.trainer_feed_tokens (
  trainer_id uuid primary key references public.trainers(id) on delete cascade,
  token_hash bytea not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

-- Lookup path for the feed read + collision guard (32 random bytes make
-- collisions cosmological; the constraint makes the assumption explicit).
create unique index trainer_feed_tokens_token_hash_key
  on public.trainer_feed_tokens (token_hash);

comment on table public.trainer_feed_tokens is
  'Secret-feed-URL credentials for the ICS calendar export (M15). One row per trainer who enabled the feed — ROW ABSENCE is a first-class state (= feed off; route 404s). token_hash is sha256 of the URL token; plaintext is returned once by rotate_feed_token() and never stored. Writes ONLY via rotate_feed_token() (no INSERT/UPDATE policy or grant exists); disable = owner-scoped DELETE. service_role holds NO privileges here (M14 declared position: {}).';
comment on column public.trainer_feed_tokens.token_hash is
  'sha256 digest of the feed-URL token. Preimage-resistant: reading this column mints no working URL. Rotation replaces it in place; the old URL dies at the calendar app''s next poll.';
comment on column public.trainer_feed_tokens.rotated_at is
  'NULL until the first rotation. UI copy: rotating breaks existing calendar subscriptions — re-subscribe with the new URL.';


-- ----------------------------------------------------------------------------
-- 2. RLS — read own row, delete own row, nothing else
-- ----------------------------------------------------------------------------
alter table public.trainer_feed_tokens enable row level security;

create policy "Trainers read their own feed token row"
  on public.trainer_feed_tokens for select to authenticated
  using (auth.uid() = trainer_id);

create policy "Trainers disable their own feed"
  on public.trainer_feed_tokens for delete to authenticated
  using (auth.uid() = trainer_id);

-- INTENTIONALLY: no INSERT policy, no UPDATE policy (see header — tokens
-- exist only via rotate_feed_token()).


-- ----------------------------------------------------------------------------
-- 3. GRANTs — second gate (M7 convention; explicit, minimal)
-- ----------------------------------------------------------------------------
grant select, delete on public.trainer_feed_tokens to authenticated;
-- No anon grants. No INSERT/UPDATE grants to any api role. No service_role
-- grants AT ALL (ruled): the M14 matrix asserts this table's service_role
-- position as {} — the feed route reads via trainer_feed_events, never
-- via table privileges.


-- ----------------------------------------------------------------------------
-- 4. rotate_feed_token() — generate + rotate, one call, plaintext-once
-- ----------------------------------------------------------------------------
create function public.rotate_feed_token()
returns text
language plpgsql
volatile
security definer      -- writes a table the caller holds no write grant on
set search_path = ''  -- DEFINER discipline: everything schema-qualified
as $$
declare
  v_trainer uuid := auth.uid();
  v_token   text;
begin
  -- Trainer gate: structural evidence (the trainers row), not the profile
  -- role value — matching the M6 FK-asymmetry stance.
  if v_trainer is null
     or not exists (select 1 from public.trainers t where t.id = v_trainer) then
    raise exception 'Caller is not a trainer';
  end if;

  -- ~256 bits, server-generated. A client-chosen token cannot enter the
  -- system: this is the only INSERT/UPDATE path to the table.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.trainer_feed_tokens (trainer_id, token_hash)
  values (v_trainer, extensions.digest(v_token, 'sha256'))
  on conflict (trainer_id) do update
    set token_hash = excluded.token_hash,
        rotated_at = now();

  -- The only moment the plaintext exists outside the caller's URL bar.
  return v_token;
end;
$$;

revoke execute on function public.rotate_feed_token()
  from public, anon, authenticated, service_role;
grant execute on function public.rotate_feed_token() to authenticated;

comment on function public.rotate_feed_token() is
  'Generate-or-rotate the caller''s ICS feed token (M15). SECURITY DEFINER; trainer-gated on auth.uid() against trainers. Returns the PLAINTEXT token exactly once — only the sha256 lands in trainer_feed_tokens. Rotation kills the old URL at the next calendar poll. Direct RPC only — NEVER reference inside a policy (M11/M12 journal).';


-- ----------------------------------------------------------------------------
-- 5. trainer_feed_events(feed_token) — the feed's one read (DEFINER-as-API)
-- ----------------------------------------------------------------------------
create function public.trainer_feed_events(feed_token text)
returns table (
  booking_id         uuid,
  starts_at          timestamptz,
  ends_at            timestamptz,
  status             public.booking_status,
  updated_at         timestamptz,
  owner_display_name text,
  dog_name           text,
  service_name       text
)
language plpgsql
stable                -- read-only
security definer      -- the M12 lane, argued in the header
set search_path = ''
as $$
declare
  -- Ruled 2026-07-09: rolling 60 days past + all future. The feed shows
  -- recent history (incl. in-window CANCELLED — the route maps
  -- STATUS:CANCELLED) without becoming an unbounded archive.
  FEED_WINDOW_PAST_DAYS constant interval := interval '60 days';
begin
  return query
  select b.id, b.starts_at, b.ends_at, b.status, b.updated_at,
         p.display_name, d.name, s.name
  from public.trainer_feed_tokens ft
  join public.bookings b on b.trainer_id = ft.trainer_id
  join public.profiles p on p.id = b.owner_id
  join public.dogs d on d.id = b.dog_id
  join public.trainer_services s on s.id = b.service_id
  where ft.token_hash = extensions.digest(feed_token, 'sha256')
    -- Bad/unknown/null token: the join simply matches nothing — EMPTY,
    -- not an error (ruled: the route 404s identically for wrong vs
    -- nonexistent; no token-space oracle).
    and b.ends_at > now() - FEED_WINDOW_PAST_DAYS
  order by b.starts_at;
end;
$$;

revoke execute on function public.trainer_feed_events(text)
  from public, anon, authenticated, service_role;
grant execute on function public.trainer_feed_events(text) to service_role;
-- service_role ONLY (the M11 §3/§4 lane): the route is server code calling
-- through the admin client — getUserEmail's first sibling. anon holds
-- nothing; the URL token is the credential, not the DB role.

comment on function public.trainer_feed_events(text) is
  'The ICS feed''s read (M15): token-keyed, window-bounded (60d past + future) booking events with owner/dog/service names for one trainer. SECURITY DEFINER (M12 DEFINER-as-API: the answer needs rows the poller must never see; the function fixes the question shape). Bad token returns EMPTY, never an error. EXECUTE: service_role only. Direct RPC only — NEVER reference inside a policy (M11/M12 journal).';


-- ----------------------------------------------------------------------------
-- 6. feed_token_exists(feed_token) — the valid-but-empty distinction
-- ----------------------------------------------------------------------------
-- See the §5 corollary in the header: the events read returns EMPTY for
-- both an invalid token and a valid feed with zero in-window bookings.
-- The route must 404 the first and serve an empty calendar for the second
-- (a new trainer's feed is empty on day one — that must not present as
-- broken). Boolean only: existence, not identity.
create function public.feed_token_exists(feed_token text)
returns boolean
language sql
stable
security definer      -- same lane as trainer_feed_events, same argument
set search_path = ''
as $$
  select exists (
    select 1 from public.trainer_feed_tokens ft
    where ft.token_hash = extensions.digest(feed_token, 'sha256')
  );
$$;

revoke execute on function public.feed_token_exists(text)
  from public, anon, authenticated, service_role;
grant execute on function public.feed_token_exists(text) to service_role;

comment on function public.feed_token_exists(text) is
  'Does any feed token match this plaintext? (M15 §6). Lets the route distinguish invalid token (404) from valid-but-empty feed (200, empty calendar). SECURITY DEFINER, EXECUTE service_role only. Direct RPC only — NEVER reference inside a policy (M11/M12 journal).';
