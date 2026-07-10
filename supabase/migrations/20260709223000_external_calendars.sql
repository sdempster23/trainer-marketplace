-- ============================================================================
-- M16 — external calendars: subscription + busy blocks + the M12 union
-- (calendar bridge, IMPORT half)
-- ============================================================================
-- A trainer's external calendar (Google/Outlook/Apple secret ICS URL — her
-- ProPet schedule arrives transitively via ProPet→Google) blocks PawMatch
-- bookable slots. ADVISORY sync by strategy ruling: poll lag means we can
-- never fully prevent a conflict; the pending→confirm flow is the designed
-- backstop. We block what we know; we don't promise perfection. The EXCLUDE
-- constraint deliberately does NOT cover external blocks — a hard INSERT
-- rejection would promote advisory to authoritative.
--
-- Five objects: two tables, two new DEFINER lanes, one amend-in-place.
-- All seven investigation-QA rulings (2026-07-09) are implemented here or
-- in the app layers this migration enables.
--
-- ----------------------------------------------------------------------------
-- BLOCKS ARE INSTANTS ONLY — NO TITLES, EVER (ruling 1, argued in full)
-- ----------------------------------------------------------------------------
-- trainer_external_busy_blocks stores (starts_at, ends_at, fetched_at) and
-- NOTHING else — no SUMMARY, no LOCATION, no DESCRIPTION, no attendee data.
--
--   (1) THIRD-PARTY PII: her external feed carries HER CLIENTS' names —
--       people who never agreed to touch PawMatch. There is no product
--       purpose for their names here: the slot math consumes ranges. Data
--       that never lands in our DB can never leak from it, never needs an
--       erasure story, and never widens a breach. This is not minimalism
--       for taste; it is refusing custody of someone else's client book.
--   (2) The M12 disclosure argument applies verbatim: "ranges only — no
--       ids, no parties, no detail." The import side inherits the exact
--       question shape the export side's DEFINER lane already fixed.
--   (3) The trainer already owns the details in her own calendar. PawMatch
--       needing to know "busy 2–3pm" is the entire requirement.
--
-- ----------------------------------------------------------------------------
-- THE URL AT REST (residual ACCEPTED at gate, 2026-07-09)
-- ----------------------------------------------------------------------------
-- The pasted URL is a bearer credential (our M15 export token in reverse),
-- but unlike our token it must be stored RETRIEVABLE — the fetch needs
-- plaintext every poll, so hashing is impossible. Protection at rest:
--   - COLUMN-scoped grants: authenticated may SELECT the metadata columns
--     only; the url column is granted to NO api role at all (the M16 suite
--     pins its ABSENCE per-role — a future table-level GRANT SELECT would
--     silently re-expose it and must fail loud).
--   - Only the DEFINER lanes below touch it; their EXECUTE is
--     service_role-only (retrieval) / authenticated (set, own-row).
--   - The UI never re-displays it; Google's "reset secret address" is the
--     instant source-side revocation; Remove deletes the row (CASCADE).
-- Accepted residual: raw DB access (dump/backup/psql) reads it. LOAD-
-- BEARING ARGUMENT: at that point our own tables — bookings, messages,
-- profiles — are already open, and they dominate the blast radius; the URL
-- adds little marginal blast, grants read-only access to an EXTERNAL
-- system, and recovers via a one-click Google reset. NAMED UPGRADE PATH:
-- app-layer encryption (env-keyed AES-GCM or Supabase Vault). TRIPWIRE:
-- re-argue this residual the day our own tables stop dominating the blast
-- radius (e.g. if richer PII ever moves out of them).
--
-- ----------------------------------------------------------------------------
-- WRITE MODEL (the M15 two-gate variant, extended)
-- ----------------------------------------------------------------------------
-- No INSERT/UPDATE policy or grant exists on either table for any api role:
--   - subscription writes only via set_external_calendar() (authenticated,
--     own-row by auth.uid(), https-shape gate in-body; app layer owns the
--     full SSRF validation — scheme/host/DNS-rebind/caps — before any
--     fetch);
--   - block writes only via refresh_external_blocks() (service_role lane;
--     the fetch-on-read path: blocks exist → serve + after() background
--     refresh on TTL expiry, zero blocks → synchronous fetch, 5s cap —
--     ruling 3 as amended);
--   - DELETE (remove subscription) is deliberately policy'd + granted:
--     an owner action with no server judgement, so it rides RLS. CASCADE
--     clears the blocks; slots unblock — the UI confirm copy says so.
--
-- STALE BEATS NONE, PINNED IN THE DB ITSELF (ruling 6): a failed fetch
-- (fetch_ok=false) NEVER touches existing blocks — refresh_external_blocks
-- only starts/keeps failing_since. A silent unblock is the worst outcome
-- this feature can produce; the invariant lives here, not in app code that
-- might be bypassed. Blocks are replaced only on a successful parse.
-- Retention on persistent failure is INDEFINITE (auto-expiry = silent
-- unblock on a timer, rejected); the UI warns past 24h with the truth:
-- "showing your calendar as of <last_fetched_at>".
--
-- ----------------------------------------------------------------------------
-- M12 RPC AMENDED IN PLACE (ruling 2; the M9/M11 splice precedent)
-- ----------------------------------------------------------------------------
-- trainer_busy_ranges gains a union arm over the external blocks — chosen
-- over an app-side merge because a merge would need the OWNER's session to
-- read another trainer's raw blocks (a queryable relation of her whole
-- external calendar: the exact thing M12 exists to prevent), and because
-- the RPC is the ONE merge authority every present and future consumer
-- inherits. The body below is the live pg_get_functiondef dump with the
-- union arm spliced in; everything else is byte-identical to M12. The M12
-- suite re-runs UNAMENDED as the contract proof (same shape, same order,
-- same future bound); getBusyRanges and computeBookableSlots change by
-- zero lines (external ranges arrive as opaque busy in the same shape;
-- half-open [) overlap already treats partial overlap as total).
--
-- Both new functions carry the C4 posture from day one: SECURITY DEFINER,
-- SET search_path = '' (exact — the M15 review's substring lesson),
-- explicit REVOKE-then-GRANT, direct-RPC-only (NEVER referenced inside a
-- policy — the M11/M12 SIGSEGV). service_role table DML stays {} on BOTH
-- tables (the M14 matrix picks them up automatically; the M16 suite pins
-- them locally).
--
-- Probed rolled-back before this file was written (P1–P6): subscription
-- lifecycle incl. url-column 42501 under RLS, refresh replace/hold/recover
-- semantics, RPC union + future bound + isolation + cascade, the full
-- grant/EXECUTE matrix — all green; rollback clean INCLUDING the RPC
-- reverting to the M12 body (the amend is transactional).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Table: trainer_external_calendars (the subscription; one per trainer)
-- ----------------------------------------------------------------------------
create table public.trainer_external_calendars (
  trainer_id        uuid primary key references public.trainers(id) on delete cascade,
  url               text not null,
  created_at        timestamptz not null default now(),
  last_fetched_at   timestamptz,   -- last SUCCESSFUL fetch (the "as of" truth)
  last_attempted_at timestamptz,   -- last fetch ATTEMPT, success or fail (backoff gate)
  last_fetch_ok     boolean not null default false,
  failing_since     timestamptz
);

comment on table public.trainer_external_calendars is
  'External-calendar subscription for the import half (M16). One row per trainer (v1 — YAGNI); ROW ABSENCE = not subscribed. url is a bearer credential stored retrievable (the fetch needs plaintext; hashing impossible) — column-granted to NO api role; residual + tripwire in the migration header. Writes only via set_external_calendar(); remove = owner-scoped DELETE (CASCADE clears blocks).';
comment on column public.trainer_external_calendars.url is
  'The secret ICS URL (Google "secret address" class). Granted to NO api role — the M16 suite pins per-role ABSENCE so a future table-level GRANT fails loud. Read only by external_calendar_to_fetch() (service_role lane).';
comment on column public.trainer_external_calendars.last_fetched_at is
  'Last SUCCESSFUL fetch. Drives the trainer-facing "showing your calendar as of …" truth copy. NULL = never fetched successfully.';
comment on column public.trainer_external_calendars.last_attempted_at is
  'Last fetch ATTEMPT, success OR failure. The app-side TTL gate reads THIS (not last_fetched_at): a feed that never succeeds still advances it, so a permanently-failing feed backs off to the 15-min TTL cadence instead of re-blocking every read synchronously (the DoS-amplification the review caught). NULL = never attempted → the one synchronous first fetch (ruling 3).';
comment on column public.trainer_external_calendars.failing_since is
  'First failure of the current failing streak; cleared on success. UI warns past 24h. Blocks are NEVER auto-expired on failure — see the stale-beats-none section of the header.';

-- ----------------------------------------------------------------------------
-- 2. Table: trainer_external_busy_blocks (the fetched product; instants only)
-- ----------------------------------------------------------------------------
create table public.trainer_external_busy_blocks (
  trainer_id uuid not null references public.trainer_external_calendars(trainer_id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  fetched_at timestamptz not null default now(),
  constraint external_blocks_positive_range check (ends_at > starts_at)
);

-- The union arm's read path: (trainer, future-bounded end).
create index trainer_external_busy_blocks_read
  on public.trainer_external_busy_blocks (trainer_id, ends_at);

comment on table public.trainer_external_busy_blocks is
  'Expanded busy ranges from the trainer''s external calendar (M16). INSTANTS ONLY — no titles/details by design (third-party PII argument in the migration header). Replaced wholesale per successful fetch by refresh_external_blocks(); never touched by a failed fetch. Enters slot math via the trainer_busy_ranges union arm.';

-- ----------------------------------------------------------------------------
-- 3. RLS + grants — metadata visible to the owner; url visible to nobody
-- ----------------------------------------------------------------------------
alter table public.trainer_external_calendars enable row level security;
alter table public.trainer_external_busy_blocks enable row level security;

create policy "Trainers read their own external-calendar status"
  on public.trainer_external_calendars for select to authenticated
  using (auth.uid() = trainer_id);

create policy "Trainers remove their own external calendar"
  on public.trainer_external_calendars for delete to authenticated
  using (auth.uid() = trainer_id);

create policy "Trainers read their own external busy blocks"
  on public.trainer_external_busy_blocks for select to authenticated
  using (auth.uid() = trainer_id);

-- COLUMN-scoped SELECT: metadata only. url appears in NO grant, for NO
-- role — its per-role absence is a pinned suite case (ruling 1).
grant select (trainer_id, created_at, last_fetched_at, last_fetch_ok, failing_since)
  on public.trainer_external_calendars to authenticated;
grant delete on public.trainer_external_calendars to authenticated;
-- Own-row block reads: the status card's "N busy blocks" count. Her own
-- data — the M12 concern is OTHERS reading a trainer's calendar.
grant select on public.trainer_external_busy_blocks to authenticated;
-- No anon grants. No INSERT/UPDATE grants to any api role, either table.
-- service_role: NOTHING on either table (M14 declared position: {}).

-- ----------------------------------------------------------------------------
-- 4. set_external_calendar(url) — subscribe / replace (authenticated lane)
-- ----------------------------------------------------------------------------
create function public.set_external_calendar(cal_url text)
returns void
language plpgsql
volatile
security definer      -- writes a table the caller holds no write grant on
set search_path = ''
as $$
declare
  v_trainer uuid := auth.uid();
begin
  if v_trainer is null
     or not exists (select 1 from public.trainers t where t.id = v_trainer) then
    raise exception 'Caller is not a trainer';
  end if;
  -- Shape gate only. The FULL SSRF layer (host/IP/DNS-rebind/redirect/cap
  -- validation) is the app fetcher's job at fetch time — the DB cannot
  -- resolve DNS, and a URL that is never fetched leaks nothing.
  if cal_url is null or cal_url !~ '^https://' then
    raise exception 'Calendar URL must be https';
  end if;
  insert into public.trainer_external_calendars (trainer_id, url)
  values (v_trainer, cal_url)
  on conflict (trainer_id) do update
    set url = excluded.url,
        last_fetched_at = null,
        last_attempted_at = null,  -- reset the backoff gate: the new URL
                                   -- gets its one synchronous first fetch
        last_fetch_ok = false,
        failing_since = null;
end;
$$;

revoke execute on function public.set_external_calendar(text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_external_calendar(text) to authenticated;

comment on function public.set_external_calendar(text) is
  'Subscribe (or replace) the caller''s external calendar URL (M16). SECURITY DEFINER, trainer-gated on auth.uid(); https shape-gate in-body, full SSRF validation lives in the app fetcher. Re-paste resets fetch state so the next slot read fetches synchronously. Direct RPC only — NEVER reference inside a policy (M11/M12 journal).';

-- ----------------------------------------------------------------------------
-- 5. external_calendar_to_fetch(t_id) — the url-retrieval lane (service_role)
-- ----------------------------------------------------------------------------
create function public.external_calendar_to_fetch(t_id uuid)
returns table (url text, last_fetched_at timestamptz, last_attempted_at timestamptz, failing_since timestamptz)
language sql
stable
security definer      -- the ONLY read path to the url column
set search_path = ''
as $$
  select c.url, c.last_fetched_at, c.last_attempted_at, c.failing_since
  from public.trainer_external_calendars c
  where c.trainer_id = t_id;
$$;

revoke execute on function public.external_calendar_to_fetch(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.external_calendar_to_fetch(uuid) to service_role;

comment on function public.external_calendar_to_fetch(uuid) is
  'The url column''s only read path (M16): url + staleness inputs for one trainer, for the fetch-on-read refresh decision. SECURITY DEFINER, EXECUTE service_role only. Direct RPC only — NEVER reference inside a policy (M11/M12 journal).';

-- ----------------------------------------------------------------------------
-- 6. refresh_external_blocks(t_id, blocks, fetch_ok) — the write lane
-- ----------------------------------------------------------------------------
create function public.refresh_external_blocks(t_id uuid, blocks jsonb, fetch_ok boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.trainer_external_calendars c where c.trainer_id = t_id) then
    raise exception 'No external calendar subscription for %', t_id;
  end if;

  if not fetch_ok then
    -- STALE BEATS NONE: the failure path may only bookkeep. Blocks are
    -- untouchable here by construction — the invariant lives in the DB.
    -- last_attempted_at ADVANCES (the backoff gate) so a permanently-
    -- failing feed doesn't re-block every read synchronously forever.
    update public.trainer_external_calendars
      set last_attempted_at = now(),
          last_fetch_ok = false,
          failing_since = coalesce(failing_since, now())
      where trainer_id = t_id;
    return;
  end if;

  -- Successful parse: wholesale replace, one transaction. Invalid entries
  -- (missing fields, non-positive range) are dropped, not fatal — one
  -- malformed event must not void an otherwise-good calendar.
  delete from public.trainer_external_busy_blocks where trainer_id = t_id;
  insert into public.trainer_external_busy_blocks (trainer_id, starts_at, ends_at)
  select t_id,
         (e->>'starts_at')::timestamptz,
         (e->>'ends_at')::timestamptz
  from jsonb_array_elements(coalesce(blocks, '[]'::jsonb)) as e
  where (e->>'starts_at') is not null
    and (e->>'ends_at') is not null
    and (e->>'ends_at')::timestamptz > (e->>'starts_at')::timestamptz;

  update public.trainer_external_calendars
    set last_attempted_at = now(),
        last_fetched_at = now(),
        last_fetch_ok = true,
        failing_since = null
    where trainer_id = t_id;
end;
$$;

revoke execute on function public.refresh_external_blocks(uuid, jsonb, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.refresh_external_blocks(uuid, jsonb, boolean) to service_role;

comment on function public.refresh_external_blocks(uuid, jsonb, boolean) is
  'Apply one fetch outcome (M16). fetch_ok=true: atomic wholesale block replace + stamp last_fetched_at + clear failing_since. fetch_ok=false: bookkeeping ONLY — blocks are structurally untouchable on the failure path (stale beats none; a silent unblock is this feature''s worst outcome). SECURITY DEFINER, EXECUTE service_role only. Direct RPC only — NEVER reference inside a policy (M11/M12 journal).';

-- ----------------------------------------------------------------------------
-- 7. trainer_busy_ranges — the M12 RPC, amended in place (union arm)
-- ----------------------------------------------------------------------------
-- Live pg_get_functiondef dump + the union arm; contract to existing
-- callers unchanged (shape, order, future bound). The M12 suite re-runs
-- UNAMENDED as the proof.
CREATE OR REPLACE FUNCTION public.trainer_busy_ranges(t_id uuid)
 RETURNS TABLE(starts_at timestamp with time zone, ends_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select u.starts_at, u.ends_at from (
    select b.starts_at, b.ends_at
    from public.bookings b
    where b.trainer_id = t_id
      -- The M6 EXCLUDE constraint's WHERE list, verbatim — the function must
      -- block exactly the rows the DB would reject an overlap against.
      and b.status in ('PENDING', 'CONFIRMED')
      -- Future-bounded IN-BODY: history is not the caller's business. An
      -- in-progress session (started, not ended) still appears — its tail
      -- still blocks.
      and b.ends_at > now()
    union all
    -- M16: the import half. External blocks are opaque busy — same shape,
    -- same future bound, same disclosure posture (ranges only). ADVISORY:
    -- these ranges block the PICKER; the EXCLUDE constraint deliberately
    -- does not know them (the pending→confirm flow is the backstop).
    select x.starts_at, x.ends_at
    from public.trainer_external_busy_blocks x
    where x.trainer_id = t_id
      and x.ends_at > now()
  ) u
  order by u.starts_at
$function$;

comment on function public.trainer_busy_ranges(uuid) is
  'The slot picker''s busy-times read: future (starts_at, ends_at) ranges for a trainer''s PENDING/CONFIRMED bookings UNION her external-calendar busy blocks (M16) — ranges ONLY (no ids, no parties, no status detail, no event titles). SECURITY DEFINER deliberately (the M8 convention''s access-side exception; M12 argument, inherited verbatim by the M16 arm). Called directly as an RPC — NEVER reference inside a policy (see the M11/M12 journal entries).';
