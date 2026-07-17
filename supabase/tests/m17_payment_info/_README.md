# M17 payment-info — test suite

Tests for migration M17 (`20260717170000_payment_info.sql`): the
off-platform payment-info table — a trainer says how they take payment,
the owner sees it AFTER the booking is CONFIRMED. INFORMATION DISPLAY
ONLY; PawMatch never touches the money.

## Status

| Category | Cases | Covers |
|---|---|---|
| A — booking-scoped read | 5 | trainer reads own; **CONFIRMED-booking owner reads the trainer's payment (the render path); PENDING-only owner sees nothing; no-booking owner harvests ZERO (anti-harvest); a non-party trainer sees nothing** |
| B — write / checks / grants | 6 | trainer writes own; cross-trainer write blocked (RLS); bad handle rejected (CHECK charset); over-280 instructions rejected; **grant matrix (anon {}, service_role DML {} — M14 position, authenticated S/I/U no D)**; updated_at trigger + exactly 4 authenticated policies |

Total: 11 cases. Fixture: `pay1****` anchors — a trainer with payment
info, an owner with a CONFIRMED booking (the reader), an owner with only
a PENDING booking, and a no-booking owner (the anti-harvest control).

## Design notes pinned here

- **Anti-harvest by construction**: no anon grant at all (unlike a column
  on the anon-readable `trainers` table, which would have forced breaking
  M7's anon grant). A dedicated table is the M5 `trainer_stripe_accounts`
  sibling. service_role DML {} is the M14 declared position — pinned in B5
  and auto-asserted by the M14 catalog matrix (16 tables now).
- **Booking-scoped read** = the M11 counterparty precedent: the owner's
  read policy EXISTS-subqueries `bookings` (pure column comparisons there,
  so no 42P17 recursion). The DB enforces what the render intends
  (CONFIRMED only) — defense in depth, not render-gating alone.
- **Handles are validated slugs, not urls** (CHECK charset): the app
  builds the href from a fixed host (venmo.com / paypal.me); there is
  never a user-supplied url to sanitize.

## Invocation

```bash
docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/m17_payment_info/_fixture.sql
for f in supabase/tests/m17_payment_info/category_*.sql; do
  docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -f - < "$f"
done
```

Run on a fresh `supabase db reset`.
