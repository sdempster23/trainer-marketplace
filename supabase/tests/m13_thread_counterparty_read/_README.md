# M13 thread-counterparty-read — test suite

Tests for migration M13 (`20260705150000_thread_counterparty_read.sql`): the
one additive profiles SELECT policy letting trainers read the profiles of
owners they share a `message_thread` with — the M11 §2 counterparty read
mirrored onto the freestanding-messaging relationship.

## Status

| Category | Cases | Covers |
|---|---|---|
| A — counterparty read | 7 | thread-party trainer reads the owner, booking-free (A1); no-thread trainer excluded — no leak via someone else's thread (A2); owner side unchanged, own + public trainer reads (A3); anon unchanged with a thread present incl. the nearby_trainers INVOKER join — the B6-style PUBLIC-default detonation trap (A4); thread INSERT under the live policy — the standing 42P17 trap (A5); own display_name UPDATE survives — the B8 mirror (A6); catalog pin cmd=SELECT roles={authenticated} qual reads message_threads (A7) |

Total: 7 cases. Fixture: d*-anchors (collision-checked); trainer_d sits in
SEATTLE so the anon RPC assertion sees exactly one row regardless of which
other fixtures (Denver, east-coast seed) are resident.

## Premise notes for older suites

M13 changes profile-visibility semantics for THREAD pairs, the same way M11
did for booking pairs. M8 C1's invisibility precondition (trainer cannot see
owner_c) still holds because it is checked BEFORE the thread INSERT in the
same rolled-back case — but the check's ordering is now load-bearing from two
directions (M11: no booking; M13: no thread yet). Watched in the full-chain
run; see the journal.

**PINNED:** C1's premise is now ORDERING-dependent. If it ever breaks (e.g. a
future fixture leaves a persistent thread between its pair), the fix is a
dedicated no-thread fixture pair for the invisibility check — NEVER reordering
the check relative to the INSERT (the before-INSERT position is the premise).

## Invocation

```bash
docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/m13_thread_counterparty_read/_fixture.sql
for f in supabase/tests/m13_thread_counterparty_read/category_*.sql; do
  docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -f - < "$f"
done
```

Acceptance: 7/7 PASS, then the full M6–M12 regression (premise-shift watch).
