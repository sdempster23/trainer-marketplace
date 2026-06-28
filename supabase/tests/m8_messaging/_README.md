# M8 messaging — test suite

Tests for migration M8 (`message_threads` + `messages`): owner↔trainer in-app
messaging, the first feature table built under the M7 grant convention.

## Status

| Category | Cases | Covers |
|---|---|---|
| A — legal flows | 6 | create (owner & trainer), send (both parties), updated_at bump, one-per-pair UNIQUE, booking association |
| B — sender authenticity (4b) | 2 | `sender_id = auth.uid()` — forge-as-other-participant and forge-as-outsider both rejected |
| C — DEFINER integrity (4c) | 2 | trainer-initiated thread via DEFINER (global-state contract) + non-owner owner_id still rejected |
| D — thread immutability (4d) | 5 | owner_id/trainer_id/booking_id/created_at frozen; updated_at-only allowed |
| E — RLS (§8) | 7 | participant SELECT yes; outsider owner & trainer hidden; messages EXISTS-derived visibility; outsider INSERT denied |
| F — message immutability | 2 | UPDATE/DELETE denied at the grant layer (42501) |
| G — grants | 2 | exact grant matrix (56 checks) + service_role over-revoke guard |

Total: 26 cases.

## Verification mechanisms

| Category | Discriminator |
|---|---|
| A | success-path row-state SELECT / `count`; A5 `SQLSTATE 23505` (UNIQUE) |
| B | `SQLSTATE P0001` + `'sender_id must be the authenticated user'` |
| C | C1 success + DEFINER-regression trap; C2 `SQLSTATE 23503` + empty `constraint_name` + `'is not a profile with role=owner'` |
| D | `SQLSTATE P0001` + `'<col> is immutable'`; D5 success (composition) |
| E | silent RLS: SELECT `count`; E7 `SQLSTATE 42501` (WITH CHECK) |
| F | `SQLSTATE 42501` + `'permission denied'` (absent grant) |
| G | `has_table_privilege` exact-set (no rows/JWT/transaction) |

## Fixture

`_fixture.sql` — principals + one booking. Participants: owner_a (1111),
trainer_a (2222). Outsiders: trainer_b (3333), owner_c (8888). Supporting:
dog Rex (4444), service_a (5555), booking_ab (bbbb…). Threads/messages are
created per-case inside `BEGIN/ROLLBACK`. Idempotent; safe to re-run.

## Invocation

```bash
# fixture once
docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/m8_messaging/_fixture.sql
# each category in order
for f in supabase/tests/m8_messaging/category_*.sql; do
  docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -f - < "$f"
done
```

Acceptance: all cases PASS, zero halts.
