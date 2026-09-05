# M14 service_role deliberate grants — test suite

Tests for migration M14
(`20260708150000_service_role_deliberate_grants.sql`): the two additive
GRANTs that replace the v2.90-era platform-default service_role DML with a
declared set — `bookings = SELECT,UPDATE`,
`trainer_stripe_accounts = SELECT,INSERT,UPDATE`,
`analytics_events = INSERT` (M20), every other table nothing.

## Status

| Check | Covers |
|---|---|
| M14-2 (runs first) | declaration integrity: every declared table exists (a rename/drop can't silently orphan its row out of the M14-1 matrix) — validated before the matrix trusts the declaration |
| M14-1 | catalog-driven matrix: EVERY public table × {SELECT,INSERT,UPDATE,DELETE} for service_role equals the declared set exactly — presence AND absence. Table list comes from pg_class, so a future table that never declares its service_role position is asserted `{}` automatically and fails loud if it holds any DML |

Total: 2 checks, one DO block — both derive from ONE declared-set source
(the `declared` jsonb), so a declaration added to the matrix cannot miss the
integrity guard. No fixture — the grant layer is static catalog metadata
(the M6-J / M7 pattern): no rows, no JWT, no transaction.

Review-hardened mechanics (high-effort workflow review, 2026-07-08):
`relkind IN ('r','p','f')` so partitioned and foreign tables can't slip the
fails-loud contract (views/matviews deliberately excluded — extension-owned
ones often GRANT TO PUBLIC, which is not ours to pin);
`has_table_privilege` takes the pg_class oid, never `'public.'||relname`,
so a future quoted/mixed-case identifier is checked instead of detonating
the DO block; the per-table `ok` line prints only when that table's four
verbs all matched.

## THE CONTRACT (pinned here so it survives the suite's authors)

**Assert what we DECLARE; stay silent on platform-default housekeeping.**

The suite pins exactly the four DML verbs (SELECT/INSERT/UPDATE/DELETE) in
both directions and never asserts TRUNCATE/REFERENCES/TRIGGER/MAINTAIN.
Those housekeeping verbs are platform-conferred at table creation
(`service_role=Dxtm` under CLI v2.109 and on hosted) and no migration of
ours grants or revokes them. Pinning them would re-couple this suite to the
platform's default ACL — the exact drift class M14 cures: the v2.90→v2.109
upgrade already changed that default once (silently deleting service_role's
DML and breaking three suites that had pinned it), and it can change again
without any migration of ours moving. Declared verbs are ours to assert;
default verbs are the platform's to shuffle.

The same ruling amended the three v2.90-era cases in place: M6 J4, M7-2,
and M8 G2 flipped from "over-revoke guards" (asserting platform-default
full DML) to declared-set pins. This suite is the schema-wide capstone over
those per-table pins.

## Invocation

```bash
docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/m14_service_role_grants/grants.sql
```

Run on a fresh `supabase db reset` (the per-suite reset protocol — see the
journal's M13 entry, finding 5).
