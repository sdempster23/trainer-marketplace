# M22 production database release

Shane authorized publishing the Canada/UK update. This procedure applies the
database expansion before the new application is released. It does not create
test accounts, services, bookings, or messages on production.

The reviewed migration is `20260918120000_international_listings.sql`, SHA-256
`7c27032c451c5d9d6ae4332354b31c614cdfa03dacb022655a9ba2c652f4f661`.
The known production project reference is `iomaiasjqozunjbvsdsk`. Its historical
name includes “dev”; verify the reference against the actual deployed app and
current hosting configuration, rather than relying on that name.

1. Confirm the current production site/hosting settings target that project.
   The publication script also checks the Supabase host embedded in the live
   site's public JavaScript immediately before its dry run.
2. In that project's SQL editor, run `docs/sql/m22-production-before.sql`.
   Keep the migration list, row counts, and fingerprints in the release notes.
   The script reads data in a read-only transaction and returns no personal rows.
3. The isolated implementation checkout starts without hosted link metadata.
   After confirming the target, link **this checkout** if necessary:

   ```sh
   supabase link --project-ref iomaiasjqozunjbvsdsk
   ```

   Use the CLI's normal credential prompt when needed. Do not paste credentials
   into source files, commands, chat, or `.env.local`. Linking is local setup;
   the migration below is the authorized production change.
4. From the implementation checkout, run:

   ```sh
   bash scripts/publish-international-db.sh --apply
   ```

   It checks the exact project link, cached connection identity, migration hash,
   live application database host, and that the CLI dry run's pending section
   lists **only M22**. Skipped files and already-applied migration notices are
   not pending migrations. Cached connections must use the verified project's
   direct Supabase host or a Supabase pooler, with the expected database/user.
   It then uses `supabase db push --linked`, with no seed, role, reset, or history
   repair options. It stops if M22 is already applied or another migration is
   pending; inspect the actual state before taking another action. Do not modify
   the guards merely to force the script past a failure.
5. In the same project's SQL editor, run `docs/sql/m22-production-after.sql`
   **before deploying the new app**. Check M22 is recorded, all three row counts
   and old-field fingerprints match the baseline, and existing trainer/service/
   booking rows have US/unknown-postal-area/USD defaults. The script checks the
   enum/columns, enabled triggers, exact reviewed function bodies, retained old
   RPC, new RPC privileges/security context, M14 grants, and anonymous reads.
   It is read-only and runs no local fixture suites.

Real users can change records between baseline and read-back. A difference
needs investigation; it is not authorization to restore or rewrite those rows.
The verified migration itself adds default columns without updating old fields.

After successful read-back, continue the separately coordinated application
release, including the hosted timezone runtime checks in `docs/timezone-data.md`.
Use public browsing for production smoke checks unless live account writes
have separately agreed scope. A website rollback can leave M22 installed:
the old RPC remains, and old US service/booking inserts still default to USD.
Do not try to reverse the migration by deleting live columns or records.

The runner's shell syntax and refusal paths were checked with mocked commands.
Those checks do not mean the production migration or SQL read-back has run.
