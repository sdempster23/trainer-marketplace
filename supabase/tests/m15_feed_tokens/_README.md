# M15 feed-tokens — test suite

Tests for migration M15 (`20260709150000_feed_tokens.sql`): the calendar
export arc's DB surface — `trainer_feed_tokens` (hashed secret-URL
credentials, M5 row-absence semantics), `rotate_feed_token()` (the ONLY
write path; plaintext-once), and `trainer_feed_events(token)` (the feed's
DEFINER-as-API read, M12 lane).

## Status

| Category | Cases | Covers |
|---|---|---|
| A — rotate | 4 | first generate (64-hex plaintext once, sha256 at rest, rotated_at null); rotation (in-place hash swap, rotated_at stamped, OLD token dead); owner rejected; jwt-less rejected |
| B — feed read | 6 | right token = exactly the in-window set with names joined + CANCELLED present (ruling 1) in starts_at order; wrong/null token EMPTY not error (ruling 5); cross-trainer isolation; 60-day window exclusion (ruling 2); soft-deleted dog/service still render (history preserved); the §6 valid-but-empty vs invalid fork (feed_token_exists) |
| C — grants/RLS/catalog | 5 | RLS own-row scope; table grant matrix (anon {}, authenticated {SELECT,DELETE} across 7 verbs; **service_role DML {} — the table's declared M14 position**); EXECUTE matrix (rotate → authenticated only, feed_events + feed_token_exists → service_role only); catalog pins (DEFINER + search_path + volatile/stable + exactly 2 authenticated policies); disable via own-row DELETE only |

Total: 15 cases. Fixture: `feed****`-prefixed anchors (collision-safe);
booking rows seeded via the trigger-disable convention (§9 forbids past
`starts_at` through the legal path). `display_name` is set explicitly —
`handle_new_user` copies ONLY role from signup metadata (probe finding).

## Conventions honored

- **EXECUTE denial via `has_function_privilege` ONLY** — never a live
  denied call (the M12 denial-path segfault survives v2.109).
- **The M14 contract**: service_role's position on the new table is
  asserted as DML `{}` here AND lands in the M14 catalog matrix
  automatically (undeclared table ⇒ expected `{}`); housekeeping verbs
  (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN) stay unpinned — the platform's,
  not ours.
- Tokens cross psql→DO-block boundaries via transaction-local GUCs
  (`set_config(..., true)`): psql `:vars` do not interpolate inside
  dollar-quoted bodies.

## Invocation

```bash
docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/m15_feed_tokens/_fixture.sql
for f in supabase/tests/m15_feed_tokens/category_*.sql; do
  docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -f - < "$f"
done
```

Run on a fresh `supabase db reset` (the per-suite reset protocol).
