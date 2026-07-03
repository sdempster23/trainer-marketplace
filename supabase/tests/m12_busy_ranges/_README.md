# M12 busy-ranges — test suite

Tests for migration M12 (`20260703230000_busy_ranges.sql`): the slot picker's
busy-times read — the codebase's first deliberate DEFINER-as-API.

| Check | Covers |
|---|---|
| M12-1 | parties-only RLS intact (direct read 0 rows) + the DEFINER answer (1 range) — the live positive proof |
| M12-2 | exactly PENDING + CONFIRMED block (all four statuses seeded via the M6 trigger-disable convention) — EXCLUDE-list parity |
| M12-3 | past-ended absent; in-progress present (its tail still blocks) |
| M12-4 | function ranges equal the table rows exactly, ordered |
| M12-5 | catalog pins: **prosecdef = TRUE** (the deliberate inversion of the M10-D2 INVOKER pin), STABLE, pinned empty search_path |
| M12-6 | grant matrix — authenticated + service_role only, anon and PUBLIC nothing. **Catalog-only**: the local stack (CLI v2.90 / PG 17.6) SIGSEGVs on any permission-denied function CALL (environment finding, M12 journal); the grant STATE is the thing under test, and the granted path is live-proven by M12-1 |

6 checks. Then the full M6–M11 regression (premise-shift watch on).

## Invocation

```bash
docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/m12_busy_ranges/_fixture.sql
docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/m12_busy_ranges/busy_ranges.sql
```
