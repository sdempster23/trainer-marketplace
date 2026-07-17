# M16 external-calendars — test suite

Tests for migration M16 (`20260709223000_external_calendars.sql`): the
import half's DB surface — `trainer_external_calendars` (subscription;
url column granted to NOBODY), `trainer_external_busy_blocks` (instants
only, no titles), `set_external_calendar()` / `external_calendar_to_fetch()`
/ `refresh_external_blocks()` (the DEFINER lanes), and the
`trainer_busy_ranges` union arm (M12 amended in place).

## Status

| Category | Cases | Covers |
|---|---|---|
| A — subscription | 5 | subscribe (metadata readable, url column 42501-denied LIVE); owner rejected; jwt-less rejected; re-paste resets fetch state (forces sync first fetch); non-https rejected |
| B — refresh | 5 | success = wholesale replace + stamps; **FAILURE holds blocks + starts failing_since (stale-beats-none, the safety keystone)**; recovery clears; malformed entries dropped not fatal; unsubscribed refresh errors loud |
| C — RPC union | 4 | booking + external in one ordered stream (no source distinction); future bound on the external arm (in-progress tail blocks); cross-trainer isolation; remove → CASCADE → bookings-only (slots unblock) |
| D — grants/catalog | 5 | **the url TRIPWIRE: column SELECT absent for EVERY role — a future table-level GRANT flips it and fails loud (ruling 1)**; table matrices (anon {}, service_role DML {} both — the M14 position; authenticated minimal); EXECUTE lanes as ruled; C4-posture pins incl. the amended trainer_busy_ranges; policy set |

Total: 19 cases. Fixture: `ec16****` anchors; one future CONFIRMED
booking (trigger-disable convention) feeds the union cases;
subscriptions/blocks are minted in-case via the M16 functions themselves.

## Conventions honored

- **M12 suite re-runs UNAMENDED** in the regression chain — the
  contract-to-existing-callers proof for the amend-in-place. Category C
  covers only what M16 added.
- EXECUTE denial via `has_function_privilege` only; column privileges
  via `has_column_privilege`; the ONE live denial exercised (A1's url
  read) is table/column-privilege class — clean 42501, not the
  function-EXECUTE segfault class.
- search_path pins are EXACT (`@> array['search_path=""']`) — the M15
  review's substring lesson.
- service_role table DML {} on both tables: pinned here AND picked up
  automatically by the M14 catalog matrix (15 tables now).

## Invocation

```bash
docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/m16_external_calendars/_fixture.sql
for f in supabase/tests/m16_external_calendars/category_*.sql; do
  docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -f - < "$f"
done
```

Run on a fresh `supabase db reset` (the per-suite reset protocol).
