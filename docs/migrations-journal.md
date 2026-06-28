# Migrations Journal

Engineering record for PawMatch database migrations — architectural findings,
defects caught, and conventions established. One entry per migration that
produced a lesson worth keeping. The goal is institutional memory: why a thing
is the way it is, what almost went wrong, and what convention it set for the
migrations that follow.

> Migrations M1–M5 predate this journal. Their rationale lives in their PR
> descriptions (`#3`–`#7`) and commit history. This journal begins at M6, the
> first migration whose test process produced a rich enough record to warrant
> a dedicated write-up.

---

## M6 — `bookings` (squash commit `7709335`, PR #8)

The architectural keystone of Phase 1: a two-sided booking table with a
four-layer defense-in-depth design (CHECK constraints, EXCLUDE-using-gist,
BEFORE INSERT/UPDATE triggers, RLS Category 4) and a 72-case test matrix.

**Outcome:** 72 cases across categories A–F, H, I, J, K — all four defense
layers plus the grant layer and exact time-gate boundaries verified, green in
a single coherent pass from a clean `db reset`. The test process earned its
keep *architecturally*, not just as regression coverage: all four findings
below came from test-design pressure, not code review.

### Architectural findings (surfaced by test design)

**1. System time-gate gap.**
The §10 system `CONFIRMED → COMPLETED` path had no `starts_at` floor — a buggy
Phase 8 cron could complete a session before it started. Caught during
category-B planning; fixed in M6 by mirroring the trainer COMPLETE gate
(`now() < OLD.starts_at → reject`).
*Lesson:* defense-in-depth is against your own future system code, not just
external actors. The system/cron path deserves the same guards as human actors.

**2. EXCLUDE fires at INSERT, not at CONFIRM.**
The `EXCLUDE USING gist` partial-WHERE scope (`PENDING + CONFIRMED`) means an
overlapping booking is rejected at the *INSERT of the second booking*, not at
the second booking's CONFIRM. Caught during category-C planning. This is a
stronger invariant than originally assumed — the slot is reserved the moment a
second PENDING overlaps, closing the race earlier than the state machine alone.

**3. SECURITY INVOKER cross-tenant isolation (the headline finding).**
`bookings_validate_insert` is SECURITY INVOKER (the default), so its `EXISTS`
against `profiles` runs under the *caller's* RLS context. M1's `profiles` RLS
hides other owners' profiles from trainers — which makes the §9 owner-role gate
enforce cross-owner INSERT isolation **as a side effect**: a trainer can't
INSERT a booking for any other `owner_id` because §9 can't see that profile and
raises `23503` before the §11 RLS WITH CHECK is ever reached. The §11 INSERT
WITH CHECK is therefore *pure backstop* in production.
Contrast with **category I**, where the *same* mechanism worked *for* the §12
dogs policy: the trainer IS a party to their own booking, so the nested EXISTS
resolves and dog visibility works. Same mechanism, opposite consequences —
depending on whether the policy's nested check needs visibility the caller has.
*Convention:* default to SECURITY INVOKER; document any SECURITY DEFINER in
`COMMENT ON FUNCTION` with the reason, because DEFINER changes whose RLS the
function's internal cross-table queries see.

**4. Platform-default GRANT defect (the capstone — a real security hole caught before merge).**
Supabase's `pg_default_acl` auto-grants ALL 7 privileges to **both** `anon` and
`authenticated` on every public-schema table. §13's `grant select, insert,
update to authenticated` was therefore *inert* (those privileges already
existed), and both roles silently held DELETE/TRUNCATE/REFERENCES/TRIGGER. Not
an active breach — RLS is enabled, neither role has BYPASSRLS, and no DELETE
policy exists so RLS default-denies DELETE — but the grant layer was provably
doing nothing, making the four-layer defense-in-depth claim *false at the
privilege layer*. A future disabled or misconfigured RLS policy would have
exposed full CRUD to `anon`.
Found via category J's pre-investigation grant query (J asserts the grant layer
in isolation; every prior category tested *through* RLS, which masked the
defect). Fixed in-band (commit `93c558a`): `REVOKE all from anon`, `REVOKE
delete/truncate/references/trigger from authenticated`. `authenticated` now
holds exactly SELECT/INSERT/UPDATE; `anon` holds nothing. Verified to survive a
clean `db reset` (the REVOKE is in the migration, not ad-hoc).
*The same defect is project-wide* (profiles, dogs, trainers, services) — a
dedicated grant-hardening migration (**M7**) is queued as the immediate next
migration, sequenced before `message_threads`, to sweep all existing public
tables and establish a REVOKE-then-GRANT convention.

### Engineering lessons / conventions

- **PostGIS phantom state (M3 amendment).** M3 referenced
  `extensions.geography(...)` but PostGIS had been enabled via the Supabase
  dashboard, not a migration — phantom state outside migration history that
  broke clean DBs (local Docker, fresh environments). Fixed by amending M3 in
  place (a one-time exception to forward-only, justified by the original being
  functionally broken on a clean DB). *Lesson:* ALL schema setup goes through
  migrations, never the dashboard — including extension installs.

- **`timestamptz + interval` is STABLE, not IMMUTABLE.** Postgres marks the
  operator STABLE in general (month/year intervals are timezone-dependent),
  which blocks its use in a GENERATED column / EXCLUDE index. Fixed with the
  `_bookings_ends_at` IMMUTABLE wrapper built on `make_interval(mins => N)`
  (minute-level intervals are genuinely immutable). *Lesson:* wrap timestamp
  arithmetic in an IMMUTABLE function when feeding a GENERATED column or an
  EXCLUDE constraint.

- **Four-pattern gate-ordering matrix.** When two defense layers can both
  reject the same input, write *paired* tests: one for the production ordering
  (which layer fires first), one isolating the deeper layer (via
  trigger-disable). The four proven instances:
  - `F8` — §10 immutability before UNIQUE (trigger-before-constraint, UPDATE)
  - `H6a` — §9 owner-role before RLS WITH CHECK (trigger-before-RLS, INSERT)
  - `H8` — §10 immutability before RLS WITH CHECK (trigger-before-RLS, UPDATE)
  - `I5` — RLS USING before §10 trigger (RLS-before-trigger, UPDATE)

  General Postgres ordering: BEFORE-row triggers fire before RLS WITH CHECK on
  INSERT/UPDATE; RLS USING filters the target scan before any BEFORE-row
  trigger sees the row. Convention for M7+ migrations with layered defenses.

- **Transaction-stable `now()` for exact-boundary tests.** `now()` =
  `transaction_timestamp()` is constant within a transaction, so a seed row's
  `starts_at = now()` and a gate's later `now()` re-evaluation are
  *bit-identical* (same cached transaction-start value), not merely close. This
  enables deterministic exact-boundary testing — the true `<` vs `<=` operator
  flip — with zero clock-skew. Used throughout category K. (The naive concern
  that second-level epsilon is flaky applies only across transactions or with
  `clock_timestamp()`.)

- **psql `\echo` straight-ASCII only.** psql meta-commands tokenize quotes; a
  bare apostrophe in `\echo` opens an unterminated quoted string (emits an
  error, truncates the echo, pollutes an otherwise-clean `ON_ERROR_STOP=1`
  run). PL/pgSQL string literals inside DO blocks are unaffected — `''` escapes.
  So the rule is meta-command-only.

### Test infrastructure conventions (established across A–K)

- **`BEGIN ... ROLLBACK` per case** — no state persists between cases; the
  fixture is loaded once and never mutated by a category file.
- **JWT-clearing prelude per case** — `set local role 'postgres'; set local
  request.jwt.claims to ''` opens each case, making the actor explicit and
  preventing session-state leakage. Authenticated cases then switch to
  `set local role authenticated` + a `sub` claim.
- **One violation isolated per case** — predicate-trace comments show which
  constraint fires and why others pass. Multi-violation rows are avoided
  (non-deterministic `constraint_name` capture).
- **Trigger-disable for backstop/seed setup** — disable only the trigger NOT
  under test (e.g. disable `trg_bookings_validate_insert` to seed a near-now or
  non-PENDING row whose state §9 would reject), leave the gate under test
  enabled; `ROLLBACK` reverts the disable.
- **Empty-`constraint_name` discriminator** — proves a *trigger* raised
  (`raise ... using errcode`) versus a real FK/CHECK violation (which carries a
  constraint name). Used to distinguish §9/§10 raises from genuine constraint
  hits.
- **Named-constraint discriminator** — where the named constraint is the
  point (category E's iff-CHECKs), assert the exact `constraint_name` so a
  future consolidation of separate constraints fails visibly.
- **Two RLS verification modes** — silent filtering (SELECT `count(*)` / UPDATE
  `ROW_COUNT`) for USING, `SQLSTATE 42501` for WITH CHECK denial.
- **Full-suite-run gate** — the final category isn't done until the whole suite
  runs green from a clean `db reset` + a single fixture load in one pass. This
  proves no fixture-ordering dependency and no cross-category state leakage —
  failure modes that per-category runs (which shift DB state between them)
  cannot surface.

### Persisted agent memory (cross-references)

These findings are also captured as durable agent-memory for future sessions
(project memory store, not in-repo):

- `project-security-invoker-trigger-rls` — finding #3 + the INVOKER/DEFINER
  convention.
- `project-gate-ordering-paired-tests` — the F8/H6a/H8/I5 matrix as an M7+
  convention.
- `project-grant-revoke-sweep-next-migration` — finding #4's project-wide M7
  follow-on (flagged as the immediate next migration, not backlog).
- `feedback-psql-echo-ascii-only` — the `\echo` tokenization gotcha.
- `feedback-security-tight-migration-style` — header framing for security-tight
  migrations (predates M6).

### Forward items

- **M7 — grant-hardening sweep.** ✅ DONE — delivered by M7 (commits `410ec6a`
  migration, `5d6a38c` tests). Project-wide REVOKE-then-GRANT of the permissive
  platform-default ACL plus an `ALTER DEFAULT PRIVILEGES` forward-guard. See the
  M7 entry below.

---

## M7 — grant-hardening sweep (commits `410ec6a` + `5d6a38c`)

The project-wide generalization of M6's finding #4. The platform-default ACL
(`pg_default_acl`, grantor postgres) auto-grants all 7 table privileges to both
`anon` and `authenticated` on every public-schema table; M6 hardened `bookings`,
M7 sweeps the rest and stops the recurrence.

**Outcome:** policy-matched REVOKE-then-GRANT across the 9 remaining Phase-1
tables, plus an `ALTER DEFAULT PRIVILEGES FOR ROLE postgres … REVOKE` forward-
guard so future tables start from zero. A 3-check / 126-assertion test suite
(`supabase/tests/m7_grant_hardening/`). Verified in a 75/75 full-suite run
(M6's 72 + M7's 3) from a clean `db reset` — which also proved M7's tightened
`authenticated` grants did not break M6's authenticated-path tests (H bookings,
I dogs, K trainer-UPDATE). The full-suite-run gate caught the cross-migration
interaction *before* commit, not after.

### Pre-investigation findings (the "query reality" pass reshaped the migration)

The memory note carried a "blanket revoke" sketch. A J-style catalog
investigation before drafting reshaped it into a policy-matched sweep and
surfaced three findings:

**1. Scope was 9 tables, not the 4 the note sketched.** The note was a sketch,
not an inventory — querying the catalog surfaced the full set (it had missed
`trainer_availability`, `trainer_availability_exceptions`,
`trainer_certifications`, `trainer_specialty_assignments`). *Lesson:* a
memory-note scope is a starting hypothesis; verify the actual object inventory
before acting.

**2. anon SELECT is intentional on the 7 public-read tables (the production-break
this caught).** The M1–M5 policies were written without a `TO` clause, so they
default to `PUBLIC` (includes `anon`), with `USING` quals that don't depend on
`auth.uid()` — that *is* the logged-out marketplace browse (M3's public-read
RLS). A blanket revoke-all-from-anon would have broken it. So grants are matched
to each table's actual RLS access model, not blanket-applied. *Lesson:*
hardening ≠ product change — gating browse behind login is a separate policy
decision, out of scope for a grant sweep.

**3. REVOKE grantor must be verified or the REVOKE can silently no-op.** The
migration role `postgres` is non-superuser here, and REVOKE only removes grants
made by the current role (or a superuser). Confirmed grantor = `postgres` via
catalog query *and* a dry REVOKE (dogs anon 7→0, rolled back) before relying on
it. A postgres-run REVOKE against `supabase_admin`-granted privileges would
silently no-op — the dangerous-direction failure (looks applied, isn't).
*Lesson:* for REVOKE migrations, verify the grantor first.

### Conventions established

- **Policy-matched grants.** Derive each table's grant set from its actual RLS
  policies (which roles, which operations), table by table. Never blanket-grant
  or blanket-revoke across tables with differing access models.
- **REVOKE-then-GRANT, explicit.** Every table REVOKEs all from
  anon+authenticated, then GRANTs back exactly the intended set. With §2's
  default-privilege baseline, future tables start from zero and must GRANT
  explicitly — a forgotten grant fails loud (table-inaccessible) instead of
  silently over-exposing.
- **`ALTER DEFAULT PRIVILEGES` explicit `FOR ROLE`.** State `FOR ROLE postgres`
  explicitly rather than relying on the `current_user` default — self-
  documenting scope, robust to role context. Same principle as naming
  constraints and documenting DEFINER.
- **DELETE grant only where a hard-delete policy exists.** Verified against the
  `deleted_at` column: soft-delete tables (dogs, profiles, trainer_services)
  get no DELETE grant even where authenticated otherwise self-manages.
- **zsh word-splitting in test-runner loops.** zsh does not word-split an
  unquoted `$files`, so a newline-joined file list becomes one bad filename.
  Glob directly in the `for`-loop (zsh-safe) rather than expanding an unquoted
  variable. Same class of environment-gotcha as the `\echo` ASCII-only rule.

### Persisted agent memory (cross-references)

- `project-grant-revoke-sweep-next-migration` — **delivered by M7.** The
  follow-on it flagged is now complete; M7 is the migration it described.
- (M6's `project-security-invoker-trigger-rls`, `project-gate-ordering-paired-
  tests`, `feedback-psql-echo-ascii-only` remain the standing conventions M7
  built on.)

### Forward items

- **message_threads** — the in-app owner↔trainer messaging table (the work M7
  was sequenced ahead of). It inherits the M7 baseline: the platform default no
  longer auto-grants, so its migration must REVOKE-then-GRANT explicitly per the
  convention above.
