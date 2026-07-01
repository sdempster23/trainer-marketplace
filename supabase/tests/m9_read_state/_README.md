# M9 read-state — test suite

Tests for migration M9 (`20260701143000_message_threads_read_state.sql`):
per-participant last-read timestamps on `message_threads`, the schema close-out
that finishes the M8 messaging feature. M9's design work is concentrated in the
IN-PLACE amendment to the M8 §5 immutability trigger — so is this suite.

## Status

| Category | Cases | Covers |
|---|---|---|
| A — author-as-self | 6 | owner/trainer each mark only their OWN column (A1/A2); cross-writes rejected (A3 owner→trainer, A4 trainer→owner); per-participant independence (A5); gate ordering — identity freeze precedes author-as-self (A6) |
| B — updated_at interaction | 2 | mark-as-read does NOT bump updated_at (B1); the M8 §7 message-insert bump still composes with the amended §5 (B2) |
| C — RLS still gates | 1 | outsider mark-as-read is a silent 0-row no-op (RLS USING), M9 added no hole (C1) |

Total: 9 cases.

## Verification mechanisms

| Category | Discriminator |
|---|---|
| A | success: post-UPDATE column SELECT (set vs NULL / preserved). reject: `SQLSTATE P0001` + specific message (`'owner may not modify trainer_last_read_at'` / `'trainer may not modify owner_last_read_at'`). A6 asserts `'owner_id is immutable'` surfaces (freeze first), and explicitly FAILS if the author-as-self message appears instead (ordering inverted). |
| B | `updated_at` before/after equality (B1 unchanged; B2 strictly advanced) + no-exception guard on the message insert. |
| C | `GET DIAGNOSTICS ROW_COUNT = 0` (silent RLS USING) + `owner_last_read_at IS NULL` confirmed from a `postgres` context. |

## Error taxonomy (why P0001, not 42501)

Author-as-self is a **trigger business rule** → `raise exception` → **P0001**,
matching the M8 identity-freeze checks it sits beside. `42501` is reserved for
**privilege denial** at the grant/RLS layer (see M8 category F). Keeping these
distinct means a test can tell *which layer* rejected an operation. Category C's
outsider case is neither: RLS USING makes the row invisible, so the UPDATE is a
silent 0-row no-op — no exception at all.

## What M9 did NOT change (covered by re-running M8's suite)

M9 altered the M8 `message_threads_validate_update()` function body in place, so
**M8 category D (thread immutability) now runs against the amended function** and
is the regression guard that the four identity-freeze checks still fire. M9's
category A6 additionally proves the freeze runs *before* the new clauses. Grants
and RLS were untouched (verified post-apply); M8 categories E/G remain valid.

## Fixture

`_fixture.sql` — principals only (no dog/service/booking; read-state needs
none). Participants: owner_a (1111), trainer_a (2222). Outsiders: trainer_b
(3333), owner_c (8888). Same UUID anchors as the M8 fixture — these suites run
against their own fresh reset, never co-loaded. Threads are created per-case
inside `BEGIN/ROLLBACK`. Idempotent; safe to re-run.

## Invocation

```bash
# fixture once
docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/m9_read_state/_fixture.sql
# each category in order
for f in supabase/tests/m9_read_state/category_*.sql; do
  docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -f - < "$f"
done
```

Acceptance: all cases PASS, zero halts.
