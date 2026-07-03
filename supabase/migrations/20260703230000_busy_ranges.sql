-- ============================================================================
-- M12 — trainer_busy_ranges: the slot picker's busy-times read
-- ============================================================================
-- The booking flow's one missing read: the slot picker must exclude a
-- trainer's existing PENDING/CONFIRMED bookings, but bookings RLS is
-- parties-only — an owner's client cannot see other clients' bookings, so a
-- picker fed from owner-visible rows OFFERS TAKEN SLOTS at any trainer with
-- a second client.
--
-- THE FIRST DELIBERATE DEFINER-AS-API — the M8-convention exception, argued:
-- the M8 rule is integrity → DEFINER, access → INVOKER. This is access, but
-- the ANSWER requires rows the caller must never see — the M8 "integrity
-- sees global truth" shape generalized to "an aggregate answer over
-- invisible rows."
--
-- WHY NOT INVOKER over a new narrow SELECT policy: a policy grants ROW
-- visibility; a DEFINER function grants ANSWER visibility. Even
-- column-scoped, policy-visible rows are a queryable RELATION — PostgREST
-- would let anyone filter/aggregate/paginate a trainer's booking history
-- (volume curves, per-day patterns: scrapeable analytics). This function
-- fixes the question shape (ranges only — no ids, no parties, no status
-- detail) and the time window (future-bounded in-body). Strictly less
-- leaks, and the bookings policy graph stays untouched (the M11 recursion
-- lesson makes every new bookings policy an interaction surface).
--
-- DIRECT-RPC-ONLY, forever: this function must NEVER be referenced inside
-- any policy — the M11 probe of DEFINER-inside-policy ended in a backend
-- SIGSEGV (recorded in the M11 journal entry; the M12 entry adds the
-- environment cross-check). Policies and this function stay disjoint.
-- ============================================================================


create function public.trainer_busy_ranges(t_id uuid)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable                -- read-only; PostgREST can serve it via GET
security definer      -- the exception, argued above; posture hardened below
set search_path = ''  -- DEFINER discipline: everything schema-qualified
as $$
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
  order by b.starts_at
$$;

comment on function public.trainer_busy_ranges(uuid) is
  'The slot picker''s busy-times read: future (starts_at, ends_at) ranges '
  'for a trainer''s PENDING/CONFIRMED bookings — ranges ONLY (no ids, no '
  'parties, no status detail). SECURITY DEFINER deliberately (the M8 '
  'convention''s first access-side exception): the answer requires rows the '
  'caller must never see; a policy would expose a queryable relation, this '
  'fixes the question shape. Called directly as an RPC — NEVER reference '
  'inside a policy (see the M11/M12 journal entries).';


-- ----------------------------------------------------------------------------
-- Grants — explicit both ways (the M10/M11 discipline)
-- ----------------------------------------------------------------------------
-- authenticated + service_role ONLY. anon is revoked as DELIBERATE
-- MINIMALISM: v1's slot picker lives behind the owner guard on
-- /trainers/[id]/book, so no anonymous caller exists; widening to anon later
-- (a logged-out picker preview) is a one-line ride-along — the reverse
-- asymmetry of the wide-return trade, where narrowing later would break
-- callers.
revoke execute on function public.trainer_busy_ranges(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.trainer_busy_ranges(uuid)
  to authenticated, service_role;
