# M20 analytics_events — test suite

Tests for migration M20 (`20260905120000_analytics_events.sql`): the
append-only Proof north-star event log. Writes are service_role INSERT
only; anon and authenticated hold no DML (no public insert abuse).

## Status

| Check | Covers |
|---|---|
| A1 | RLS enabled; no updated_at (append-only — the documented convention deviation) |
| A2 | grant matrix: anon {}, authenticated {}, service_role INSERT only (M14 declared position) |
| A3 | anon INSERT is 42501 |
| A4 | authenticated INSERT is 42501 (the abuse path) |
| A5 | service_role INSERT of a legal event succeeds |
| A6 | unknown event_name is rejected (CHECK) |
| A7 | trainer_signup / complete_profile are once-per-user (23505 on the second insert) |
| A8 | search may repeat for the same user |
| A9 | profile delete SET NULLs user_id (counts survive, the person does not) |
| A10 | authenticated SELECT is 42501 (events are not a user-facing read) |

Total: 10 checks. A7/A9 mint one auth.users row via the M1 trigger (the
`a20e0001-…` anchor) inside a transaction and roll it back.

## Invocation

```bash
docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/m20_analytics_events/grants_rls.sql
```

Run on a fresh `supabase db reset` (the per-suite reset protocol). Also
re-run the M14 matrix — M20 adds `analytics_events = INSERT` to the
declared set, and a forgotten update there fails loud.
