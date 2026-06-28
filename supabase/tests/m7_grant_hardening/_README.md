# M7 grant-hardening — test suite

Verifies the M7 grant-hardening sweep (`20260627143000_grant_hardening.sql`):
the GRANT layer as a real second gate beneath RLS, project-wide.

## What it covers

1. **Exact grant matrix** — for each of the 9 swept tables, `anon` and
   `authenticated` hold *exactly* the policy-matched privilege set and nothing
   more. Checked exhaustively: all 7 table privileges
   (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) asserted
   present-if-intended and absent-otherwise — so the test catches both a
   missing grant and a leftover excess.
2. **Over-revoke guard (J4 pattern)** — `service_role` retains full DML
   (the §1 REVOKEs name only `anon, authenticated`; a typo hitting
   `service_role` would break the server-side / cron paths and is caught here).
3. **Default-privileges capstone** — a throwaway table created as `postgres`
   auto-grants nothing to `anon`/`authenticated`, proving §2's
   `ALTER DEFAULT PRIVILEGES` took (future tables are hardened by default).

## Verification mechanism

`has_table_privilege(role, table, priv)` boolean assertions — the grant layer
is static catalog metadata, so (like M6 category J) there are **no rows, no
JWT, no fixture**. The capstone uses one `BEGIN/ROLLBACK` so its probe table
never persists; the rest are read-only catalog reads.

## Expected grant matrix (post-M7)

| table | anon | authenticated |
|---|---|---|
| profiles | SELECT | SELECT, UPDATE |
| dogs | — | SELECT, INSERT, UPDATE |
| trainers | SELECT | SELECT, INSERT, UPDATE |
| trainer_certifications | SELECT | SELECT, INSERT, UPDATE, DELETE |
| trainer_specialty_assignments | SELECT | SELECT, INSERT, DELETE |
| trainer_services | SELECT | SELECT, INSERT, UPDATE |
| trainer_availability | SELECT | SELECT, INSERT, UPDATE, DELETE |
| trainer_availability_exceptions | SELECT | SELECT, INSERT, UPDATE, DELETE |
| trainer_stripe_accounts | — | SELECT |

(`bookings` is hardened by M6 §13, not M7 — out of scope here.)

## Invocation

No fixture needed. Run the file directly against a DB with M1–M7 applied:

```bash
docker exec -i supabase_db_trainer-marketplace psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/m7_grant_hardening/grants.sql
```

Acceptance: all cases PASS, zero halts.
