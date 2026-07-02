# M10 nearby_trainers — test suite

Tests for migration M10 (`20260701160000_nearby_trainers.sql`): the
`nearby_trainers(search_lat, search_lng, radius_miles)` RPC (the project's
first function-as-API), its explicit EXECUTE grants, the default-privileges
guard extended to functions, and the ride-along sweep of the 9 pre-M10
functions.

## Status

| Category | Cases | Covers |
|---|---|---|
| A — result shape & distance | 5 | zero distance at the search point + ascending order (A1); distance self-consistency vs direct ST_Distance (A2); real-world bands — the transposition trap (A3); lat/lng exact round-trip + orientation (A4); display_name, sorted specialties, `{}` not NULL, NULL-name row survives (A5) |
| B — radius filtering | 5 | 1 mi (B1), 5 mi (B2), 25 mi (B3), 250 mi full order pinned (B4); inclusive `<=` boundary at D ± 0.5 m (B5) |
| C — NULL exclusion | 1 | NULL `service_point` absent even at 25,000 mi while all located trainers present (C1) |
| D — RLS gating / INVOKER | 3 | soft-delete paired control — visible → soft-deleted → gone, table row intact underneath; doubles as the live DEFINER-leak trap (D1); catalog pins prosecdef/provolatile/search_path (D2); anon ↔ authenticated parity (D3) |
| E — grant layer | 5 | exact EXECUTE matrix + no-PUBLIC aclitem (E1); §4 sweep matrix incl. `_bookings_ends_at` policy-match (E2); default-priv capstone probe, M7-3 pattern (E3); service_role over-revoke guard, M7-2 pattern (E4); trigger-firing survival under zero grants (E5) |

Total: 19 cases.

## Verification mechanisms

| Category | Discriminator |
|---|---|
| A/B/C | result-set equality on `array_agg(id ORDER BY distance_meters)` (both missing and extra rows fail); distance tolerance 1 mm vs an independently computed ST_Distance; real-world mile bands catch axis transposition that self-consistency cannot |
| B5 | boundary at D ± 0.5 m, NOT exact float equality — ST_DWithin and ST_Distance take different code paths, so bit-exact boundary equality is not guaranteed (unlike M6's transaction-stable `now()`) |
| D | before/after visibility through the RPC with the underlying row proven intact from the owner context; `pg_proc` catalog pins |
| E | `has_function_privilege()` matrices + `proacl` aclitem inspection (`'=X/%'` = a PUBLIC grant); rolled-back CREATE FUNCTION probe for the default-ACL guard |

## Two empirical facts this suite pins (found during M10 pre-draft probes)

1. **Trigger firing does NOT check the DML caller's EXECUTE** (checked against
   the trigger creator at `CREATE TRIGGER` time) — so §4's sweep of the 8
   trigger functions is inert by construction. E5 proves it in-suite; the full
   M6–M9 rerun proves it at scale.
2. **GENERATED-column / EXCLUDE evaluation DOES check the DML caller's
   EXECUTE** — a blind sweep of `_bookings_ends_at` would have broken every
   authenticated bookings INSERT/UPDATE. Hence its policy-matched grant
   (authenticated only), asserted by E2 and guarded by the M6 regression run.

## Fixture

`_fixture.sql` — five trainers anchored on downtown Nashville
(36.1627, -86.7816): t_downtown (a1111111, at the search point),
t_east (a2222222, ~2 mi), t_franklin (a3333333, ~17 mi, zero specialties),
t_memphis (a4444444, ~196 mi, NULL display_name), t_noloc (a5555555, NULL
service_point). All soft-delete mutations happen per-case inside
`BEGIN/ROLLBACK`; the fixture leaves every profile live. Idempotent; safe to
re-run. Distinct `a*` UUID anchors — no overlap with M6/M8/M9 fixtures.

## Regression requirement (per the §4 sweep)

After applying M10, run the FULL M6–M9 suites from a clean `db reset`:
M6's fixture + H/I/K categories prove bookings DML still evaluates
`_bookings_ends_at`; every fixture's `auth.users` insert proves
`handle_new_user` still fires; M8/M9 prove the messaging triggers. Trigger
firing should not check the acting user's EXECUTE — we prove it, not assume it.

## Invocation

```bash
# fixture once
docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/m10_nearby_trainers/_fixture.sql
# each category in order
for f in supabase/tests/m10_nearby_trainers/category_*.sql; do
  docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -f - < "$f"
done
```

Acceptance: all 19 cases PASS, zero halts — then the M6–M9 regression run.
