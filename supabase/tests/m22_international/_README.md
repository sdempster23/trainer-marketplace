# M22 — Canada and UK data invariants

Run only against **local** Supabase. This suite creates unique `22a00000-*`
fixtures inside one transaction and rolls everything back; it does not reset
the database or delete existing rows.

For the complete guarded sequence in an ordinary terminal, run from this
checkout (Docker Desktop and the existing local stack must already be running):

```sh
bash scripts/verify-international-db.sh
```

It checks the local target and email mode, refuses unrelated pending migrations,
rehearses/backfills M22 inside a rollback before applying only M22 through the
Supabase CLI, runs the M22 and M14 checks, then atomically replaces
`types/supabase.ts` with freshly generated local schema types. If M22 is already
applied, it skips the rehearsal/application and reruns verification. It neither
starts/stops containers nor resets data. On 2026-09-18, Shane ran it from Mac
Terminal because the restricted agent session could not access Docker. The
complete supplied output shows the backfill rehearsal, local M22 application,
M22/M14 checks, and type generation passed. The generated type artifact was
inspected and passed typecheck afterward.

Before applying M22, run `international.sql`: its first queries must fail for
the missing columns. A Docker/network failure is not that expected red result.
Apply only the pending local migration, then rerun the suite.

Before applying M22, rehearse its backfill inside a rolled-back transaction:

```sh
cat supabase/tests/m22_international/upgrade_before.sql \
    supabase/migrations/20260918120000_international_listings.sql \
    supabase/tests/m22_international/upgrade_after.sql |
  docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -f -
```

This compares every old field of a trainer, service, and booking before/after
M22, as well as the new US/USD defaults. All fixture rows and schema changes
roll back. Do not run that rehearsal after M22 is already installed.

After the actual local migration, run:

```sh
docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/m22_international/international.sql
```

Coverage: legacy defaults; supported countries and coarse postal areas;
anonymous country filtering before the 50-row limit, ordering, meters, and
soft-delete RLS; old RPC compatibility; explicit grants and INVOKER/STABLE
posture; CAD/GBP service creation and mismatch/immutability guards; owner
booking snapshots and currency mismatches; booking immutability; trainer
moves, repricing, and retirement preserving historical currency and price.
Also run the M14 service-role catalog matrix without adding table grants.

Assert denied function execution **only via catalogs** because this local
PostgreSQL image has a known crash on forbidden function calls.
