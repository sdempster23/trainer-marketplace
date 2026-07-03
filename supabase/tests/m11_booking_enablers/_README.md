# M11 booking-enablers — test suite

Tests for migration M11 (`20260703160000_booking_enablers.sql`): nullable
payment intent + one-shot system-path attach, the counterparty profile read,
the deliberate service_role grants, and nearby_trainers pagination.

## Status

| Category | Cases | Covers |
|---|---|---|
| A — payment intent | 7 | NULL-intent inserts (A1); NULLS-DISTINCT coexistence (A2); system one-shot attach (A3); value→different and value→NULL rejected "immutable once set" (A4/A5); party attach rejected "Only the system path" — the squat scenario (A6); UNIQUE on non-NULLs (A7) |
| B — counterparty read | 8 | trainer reads booked owner (B1); stranger owner invisible (B2); own-read unchanged (B3); anon unchanged even with a booking (B4); the P3 no-recursion probe pinned as a standing 42P17 trap (B5); anon directory read survives — the PUBLIC-default detonation trap (B6); trigger-ized role freeze rejects (B7); own-profile UPDATE survives — the 42P17 trap (B8) |
| C — grants | 4 | _bookings_ends_at matrix incl. deliberate service_role (C1); 5-arg re-issue took (C2); no 3-arg overload left behind (C3); profiles_validate_update swept bare (C4) |
| D — pagination (as anon) | 4 | 3-arg defaults (D1); limit (D2); offset (D3); clamps 1..100 / ≥0 (D4) |

Total: 23 cases. Fixture: b*-anchors; category-D trainers sit in DENVER so the
db-reset seed (~1000 mi east) can never contaminate the expected sets.

## Same-change M10 amendments

M11's DROP+CREATE changed nearby_trainers' signature and §3 made the
service_role grant deliberate — M10's E1/E4 signature strings, E2's
_bookings_ends_at matrix (service_role now positive), and D2's regprocedure
cast were updated in the same commit, each commented with the M11 citation.
M6 needed NO edits: F7/F8 assert `%stripe_payment_intent_id is immutable%`
by substring, which the amended message ("… immutable once set") still
satisfies, and value→different still raises unconditionally.

## Invocation

```bash
docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/m11_booking_enablers/_fixture.sql
for f in supabase/tests/m11_booking_enablers/category_*.sql; do
  docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -f - < "$f"
done
```

Acceptance: 19/19 PASS, then the amended M10 suite, then full M6–M9.
