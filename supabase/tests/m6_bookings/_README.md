# M6 bookings — test matrix

Test suite for migration 6 (`bookings`) covering the four defense layers
introduced in the M6 header:

1. Status enum + CHECK constraints (§5, §7) — column-level invariants
2. EXCLUDE USING gist (§6) — race-safe slot reservation
3. BEFORE INSERT/UPDATE triggers (§9, §10) — state machine + cross-table integrity
4. RLS policies (§11, §12) — Category 4 dual-party row gates

## Status

| Category | Cases | What it covers | Status |
|---|---|---|---|
| A — legal transitions | 9 | §10 state machine — every legal transition | ✓ |
| B — illegal transitions | 8 | §10 state machine — every illegal-transition gate + §10b snapshot mutation | ✓ |
| C — EXCLUDE constraint | 3 | §6 race-safety + partial WHERE scope | ✓ |
| D — §9 INSERT gates | 10 | §9 entry-state + cross-table integrity + time gate | ✓ |
| E — CHECK constraints | 10 | §7 snapshot ⇔ status iff-CHECKs + §5 column bounds | ✓ |
| F — immutability | 8 | §10a I1 immutable columns + stripe gate ordering | ✓ |
| H — §11 RLS policies | 9 | Owner/trainer SELECT/INSERT/UPDATE gates + SECURITY INVOKER finding | ✓ |
| I — §12 dogs RLS | 5 | Trainer dog visibility via bookings + non-party caller (deferred from B) | pending |
| J — §13 GRANTs | 3-4 | `authenticated` DML privileges + `anon` denial | pending |
| K — time-gate boundaries | 4-6 | Exact-second boundary on all four time gates | pending |

(Category G — snapshot ⇔ status — is merged into E. The §7 CHECKs *are* the
snapshot ⇔ status invariants, so splitting them would have been double-coverage.)

## Invocation

Load the fixture once before running any category file:

```bash
# Load fixture
docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/m6_bookings/_fixture.sql

# Run every category in order
for f in supabase/tests/m6_bookings/category_*.sql; do
  echo "=== Running $f ==="
  docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -f - < "$f"
done
```

The fixture is idempotent (DELETE-then-INSERT in FK dependency order), so
re-running it is always safe. Each category file is self-contained against
a loaded fixture — it does not recreate fixtures.

Package script / CI integration is intentionally deferred until the matrix
is complete (F-K still pending).

## Project conventions

These were lodged during the M6 test-matrix construction and apply to all
future category files:

### Single-violation rows

Each test case isolates exactly one constraint as the violation target.
Predicate-trace comments inline the algebra showing which constraint fires
and why others pass. Multi-violation rows accept non-deterministic
`constraint_name` capture as a known limitation — avoid them.

### JWT-clearing prelude

Every case opens with explicit:

```sql
set local role 'postgres';
set local request.jwt.claims to '';
```

This prevents session-state leakage between cases. `SET LOCAL` is
transactional, but the prelude makes the actor explicit at every case start
— the same defensive pattern used for B7's mid-transaction revert. Cheap,
deterministic.

### `BEGIN ... ROLLBACK` isolation per case

Each case runs in its own transaction with `ROLLBACK` at end. No state
persists between cases. Exception: legal-transition sequences within one
case (INSERT then UPDATE then UPDATE) run inside the same transaction.

### Trigger-disable for backstop tests

For CHECK-as-backstop tests (category E) and past-time fixture setups
(A8/A9, B4/B5), `ALTER TABLE ... DISABLE TRIGGER` inside `BEGIN` is
automatically reverted by `ROLLBACK`. Safe by transaction scope — if a test
forgets to re-enable, `ROLLBACK` cleans it up regardless.

### Verification mechanism per category

| Category | Discriminator |
|---|---|
| A | Row-state SELECT after action (success path: no exception expected) |
| B | `SQLSTATE='P0001'` + message substring (§10 trigger raises) |
| C | `SQLSTATE='23P01'` + `constraint_name='bookings_no_trainer_double_booking'` |
| D | `SQLSTATE='23503'` or `'23514'` + **empty `constraint_name`** + message substring (proves trigger fired, not real FK/CHECK) |
| E | `SQLSTATE='23514'` + `constraint_name=<specific named constraint>` |
| F | `SQLSTATE='P0001'` + message substring `'<col> is immutable'` (empty `constraint_name`); F8 additionally traps `23505` as a gate-ordering regression |
| H | Two modes: silent RLS (SELECT `count(*)` / UPDATE `ROW_COUNT`) for USING filtering; `SQLSTATE='42501'` for WITH CHECK denial; `'23503'`/`'P0001'` where §9/§10 triggers pre-empt RLS (gate ordering) |

### Acceptance criterion

All cases in a category file must PASS. `ON_ERROR_STOP=1` halts on the
first FAIL. A test that fails with the wrong exception (correct SQLSTATE
but wrong constraint or message) is a silent test gap, not a pass; the
FAIL path captures full diagnostics for debugging.

## Fixture

`_fixture.sql` provides the baseline rows used across all categories.

| Role | UUID |
|---|---|
| owner_a | `11111111-1111-1111-1111-111111111111` |
| trainer_a | `22222222-2222-2222-2222-222222222222` |
| trainer_b | `33333333-3333-3333-3333-333333333333` |
| dog (Rex, owned by owner_a) | `44444444-4444-4444-4444-444444444444` |
| service_a (offered by trainer_a, $120/60min) | `55555555-5555-5555-5555-555555555555` |
| service_b (offered by trainer_b, $120/60min) | `66666666-6666-6666-6666-666666666666` |

Some categories create transient additional fixtures inside their
`BEGIN/ROLLBACK` — these are documented inline with each case and are
discarded by the transaction's rollback.

| Case | Transient |
|---|---|
| D4 | owner_b (`77777777-…`) — leaked-UUID threat model |
| D5 | Rex soft-deleted (`UPDATE dogs SET deleted_at = now()`) |
| D7 | service_a soft-deleted (`UPDATE trainer_services SET deleted_at = now()`) |

## File layout

```
supabase/tests/m6_bookings/
  _fixture.sql                       — idempotent setup
  _README.md                         — this file
  category_a_legal_transitions.sql   — 9 cases
  category_b_illegal_transitions.sql — 8 cases
  category_c_exclude.sql             — 3 cases
  category_d_insert_gates.sql        — 10 cases
  category_e_check_constraints.sql   — 10 cases
  category_f_immutability.sql        — 8 cases
  category_h_rls_policies.sql        — 9 cases
  category_i_*.sql                   — TODO (dogs RLS)
  category_j_*.sql                   — TODO (GRANTs)
  category_k_*.sql                   — TODO (time-gate boundaries)
```
