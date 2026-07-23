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

- **message_threads** — ✅ DONE, delivered by M8 (commits `e7c428a` migration,
  `2353f1d` tests). It landed under the M7 baseline exactly as intended — the
  first tables to auto-grant nothing, REVOKE-then-GRANT explicit. See the M8
  entry below.

---

## M8 — `message_threads` + `messages` (commits `e7c428a` + `2353f1d`)

Owner↔trainer in-app messaging: two tables, freestanding (any owner↔trainer
pair, not booking-gated) with an optional booking association. The first
feature table since bookings, and the first built under the M7 grant
convention.

**Outcome:** `message_threads` (participants-only, identity columns immutable)
+ `messages` (immutable append-only record). A 26-case suite, verified in a
101-case full-chain run (M6's 72 + M7's 3 + M8's 26) proving composition across
the complete M1→M8 schema.

**Notable — the security thinking moved as early as it can go.** All four
findings were caught in the *design conversation*, before any SQL was written.
The trend across the phase: M6 surfaced its findings during test design, M7
during pre-investigation catalog queries, M8 during design review itself. Each
migration pushed the discovery point earlier.

### Findings (all surfaced pre-draft)

**1. (4b) sender forgery.** The initial "sender ∈ thread participants" design
let a participant post a message attributed to the *other* party, corrupting
the permanent record. Fixed: `sender_id = auth.uid()` (§6, INVOKER, no
cross-table read). *Lesson:* for an append-only record, "is the actor a valid
party" is weaker than "is the actor THIS actor" — author-as-self is the
anti-forgery invariant.

**2. (4c) owner-role validation is integrity, not access (the headline).** An
INVOKER trigger would have silently forced owner-only thread initiation: a
trainer cannot see the owner's profile under their own RLS, so the role-EXISTS
would wrongly reject trainer-initiated threads. Made SECURITY DEFINER
(search_path pinned empty, all refs schema-qualified, documented in COMMENT) so
the integrity check sees true global state. C1 pins the contract empirically —
a trainer creates a thread while the owner is provably invisible to them
(`count=0`) — with a DEFINER-regression trap that fires if the function is ever
flipped to INVOKER.

**3. (4d) thread reassignment exposure.** `authenticated` UPDATE (needed for the
updated_at bump) with a participation-only WITH CHECK let a participant
`SET owner_id = another_owner`, stay a participant, and expose the *entire
message history* to a stranger. Worse than 4b — it leaks an existing record,
not just corrupts a new one. Fixed: §5 BEFORE UPDATE trigger freezes
owner_id/trainer_id/booking_id/created_at; only updated_at may change. The M6
§10a immutability pattern generalizing.

**4. (4a) updated_at bump.** AFTER INSERT trigger on messages (INVOKER) bumps
the parent thread; trigger graph confirmed acyclic.

### Conventions established

- **Integrity-vs-access trigger security context (the M8 headline).**
  Integrity-validating triggers ("does this reference a valid X?") use SECURITY
  DEFINER, documented in COMMENT ON FUNCTION with the reason + search-path
  hardening. Access-gating logic uses INVOKER + RLS. M6 conflated these (its
  INVOKER trigger did integrity + cross-tenant isolation as an incidental side
  effect — it worked, but by accident); M8 separates them deliberately. A
  DEFINER function MUST pin search_path empty and schema-qualify every reference
  (prevents search-path hijacking of the elevated context).
- **Author-as-self for append-only records.** Enforce `actor = auth.uid()`
  rather than `actor ∈ valid-set` — forgery is impossible and no cross-table
  read is needed.
- **Column-immutability guard on participant-updatable rows.** When
  `authenticated` holds UPDATE and the WITH CHECK only verifies participation,
  freeze the identity columns with a BEFORE UPDATE trigger — or the row can be
  reassigned out from under its data.
- **Per-migration fixtures with shared UUID anchors can't co-load** if one's
  teardown removes rows another depends on (M6's `service_b` hangs off a trainer
  M8's teardown deletes). Run each suite against its own fresh reset;
  composition is proven by the shared full schema, not a combined fixture load.
  Same class of environment gotcha as the zsh word-splitting and `\echo`
  ASCII-only rules.

### Forward items

- **Account deletion / profile erasure (Phase 13).** M8's `sender_id ON DELETE
  RESTRICT` blocks deleting any profile that has sent a message; combined with
  M6's R3 trainer-soft-delete note, erasure needs a deliberate design
  (soft-delete + anonymize, or reassign authored messages to a tombstone
  sender). Cross-references the same concern from two tables now.
- **Read-state / unread counts** — ✅ DELIVERED in M9 (below).
- **Phase-1 schema status.** With messaging in, the Phase-1 data model
  (identity, dogs, trainers, services/availability, stripe accounts, bookings,
  grant-hardening, messaging) is approaching complete. Remaining Phase-1 work is
  primarily application-layer (the Next.js surfaces over these tables) plus the
  deferred read-state migration; confirm the build board for the next table, if
  any, before starting M9.


## M9 — `message_threads` read-state (unread tracking)

The "A" in the A-then-C plan: a small schema close-out finishing the messaging
feature, before the pivot to the application layer. Adds per-participant
last-read timestamps to `message_threads` — the lightweight approach (unread
badges + per-thread unread counts, which is what the messaging UI renders), NOT
per-message receipts (a future migration if ever needed).

**Outcome:** two nullable columns (`owner_last_read_at`, `trainer_last_read_at`;
NULL = never read) + an IN-PLACE amendment to the M8 §5 immutability trigger.
Unread is computed at query time (`any message with created_at > my
last_read_at`) — no stored counter to drift. No grant/RLS/index change (all
verified, not assumed). A 9-case suite; the amendment re-verified by re-running
M8's full 26-case suite unchanged (35 green total).

**The whole migration is one amendment.** Like the M3 PostGIS edit, M9
deliberately edits prior-migration work: `message_threads_validate_update()`
gains the read-state authorship rule in the same BEFORE UPDATE function that
holds the M8 identity freeze. No new trigger, no new policy, no new grant.

### Findings / decisions (all surfaced in pre-investigation)

**1. Denylist semantics make the amendment safe by construction.** The M8
trigger *rejects* four named identity columns and permits everything else by
omission — that is why `updated_at` was always allowed. The two new columns are
therefore permitted with zero new "allow" logic; the amendment only ADDS reject
clauses (author-as-self), leaving the four identity-freeze checks byte-for-byte
untouched. The 4d thread-hijack guard is preserved without being retested by
M9 — M8 category D now runs against the amended function and is that guard.

**2. Author-as-self MUST be a trigger, not RLS (the load-bearing structural
fact).** A participant may write only their OWN last_read column. RLS `WITH
CHECK` sees only the NEW row, never OLD, so it cannot detect that
`trainer_last_read_at` *changed* — the OLD-vs-NEW comparison is a trigger's job.
This is the read-state analog of M8's `sender_id = auth.uid()` anti-forgery
rule; without it a participant could mark the OTHER party's messages read.

**3. Gate ordering — freeze above author-as-self.** The freeze checks run first,
so by the time the author clauses evaluate, `OLD.owner_id`/`OLD.trainer_id` are
proven to equal NEW and are trustworthy as the true participant identities. A
combined `owner_id`-change + wrong-`last_read` UPDATE is rejected by the freeze,
not the author clause (A6 asserts this ordering and fails if it inverts).

**4. Marking-as-read does NOT bump updated_at.** `updated_at` is "last activity"
for thread-list ordering; reading is not activity and must not reorder the list.
The denylist trigger allows `updated_at` to change but never requires it, so a
read that touches only `*_last_read_at` leaves ordering intact (B1). The M8 §7
message-insert bump still composes with the amended trigger (B2).

### Error taxonomy pinned

Author-as-self raises **P0001** (trigger business rule), matching the identity
freeze it sits beside — deliberately NOT **42501**, which is reserved for
grant/RLS privilege denial (M8 category F). The outsider case is neither: RLS
`USING` makes the row invisible, so an outsider's mark-as-read is a silent
0-row no-op (C1). Three distinct rejection signatures, one per layer.

### Forward items

- **Regenerate `types/supabase.ts`.** Stale since before M8 (it predates
  `message_threads` entirely) — this schema-only phase doesn't regenerate types
  per migration. Regenerate at the start of the application layer (the "C"
  step), which sweeps in M8 + M9 together.
  *(Resolved before M10: the app-layer PR #12 regenerated types through M9.
  M10's RPC makes them stale again — regenerate during the directory build.)*

---

## M10 — `nearby_trainers` RPC + function-grant hardening

The project's first **function-as-API**: `nearby_trainers(search_lat,
search_lng, radius_miles)` — the trainer directory's proximity search
("trainers within X miles of a point, nearest first"). SQL, STABLE, SECURITY
INVOKER, `search_path` pinned empty with every PostGIS reference
schema-qualified (`extensions.*`), wide return (directory-card fields +
specialties array + lat/lng doubles + `distance_meters`).

**Why an RPC at all:** PostgREST's filter grammar has no PostGIS operators —
proven empirically with a curl against `/rest/v1/trainers` using an
`st_dwithin`-shaped filter, which fails to parse (`PGRST100`). Proximity math
must live in a database function exposed at `/rest/v1/rpc/nearby_trainers`.

**Outcome:** a 19-case suite (categories A–E), verified green from a clean
`db reset`, followed by the FULL M6–M9 suites as regression (72 + 3 + 26 + 9 =
110) — **129/129 total**, across four clean resets that each re-proved the
M1→M10 syntax gate.

### Security model — access-gating → INVOKER (the M8 convention, applied)

The function is pure access (reading rows on behalf of a caller), so it runs
under the CALLER's RLS. The `profiles` INNER join (for `display_name`) carries
soft-delete + trainer-role gating through RLS composition: a trainers row is
only policy-visible when its profile is live, so the join cannot drop rows the
caller could otherwise see. D1 proves the gate live — anon sees a trainer
through the RPC, postgres soft-deletes its profile in-transaction, anon's next
call excludes it while the table row provably still exists underneath. D1
doubles as the DEFINER-regression trap: postgres owns both tables, so a
DEFINER flip would bypass RLS inside the body and leak the soft-deleted row.
D2 pins the catalog (`prosecdef=false`, `provolatile='s'`, empty search_path).

### Wide return, deliberately

Thin `(id, distance)` would force a second PostgREST query whose `id=in.(…)`
results come back unordered — client re-sort plus N+1 specialty stitching. The
hybrid ("thin + resource embedding") is *impossible*: PostgREST embeds only on
functions returning `SETOF <table>`, and the computed distance column forces
`RETURNS TABLE(...)`. INVOKER makes wide RLS-safe by construction — every
joined table is read under the caller's own policies, so the function can
never return a field the caller couldn't SELECT directly. Accepted cost:
`RETURNS TABLE` cannot be reshaped by `CREATE OR REPLACE`; adding fields later
(pricing, ratings) is a DROP+CREATE in a future migration.

### Empirical findings (both caught before or by the first apply)

**1. Functions are born PUBLIC-executable, and per-schema default-privilege
entries CANNOT mask that.** Unlike tables, functions carry a built-in
EXECUTE-to-PUBLIC grant. Per-schema `ALTER DEFAULT PRIVILEGES` entries compose
*additively* with the global defaults — a per-schema REVOKE only undoes
per-schema GRANTs; only the **global (schema-less) form** overrides the
built-in default. §3's first draft used the per-schema form alone (mirroring
M7) and was **half-taken**: the platform ACL's explicit anon/authenticated
auto-grants were stripped, but new functions still arrived with `=X` (PUBLIC),
which anon/authenticated inherit. Caught by test E3 on the first apply — 
15 other cases were already green. This is precisely why M7's per-schema-only
TABLE guard was clean (tables have no built-in PUBLIC default) while the same
shape failed for functions. Fix: the global + per-schema pair, both kept,
gotcha documented in the migration.

**2. GENERATED-column/EXCLUDE evaluation checks the DML caller's EXECUTE;
trigger firing does not.** Two rolled-back pre-draft probes: (a) an
authenticated INSERT into a probe table failed with `permission denied for
function` when the GENERATED-column/EXCLUDE function had its EXECUTE revoked —
so a blind sweep of `_bookings_ends_at` would have broken every authenticated
bookings INSERT/UPDATE; (b) the same INSERT through a BEFORE trigger whose
function had ZERO grants succeeded — trigger EXECUTE is checked against the
trigger creator at `CREATE TRIGGER` time, never the DML caller. Hence §4's
shape: the 8 RETURNS-trigger functions swept bare (inert grants, hygiene);
`_bookings_ends_at` policy-matched (authenticated keeps EXECUTE — it IS the
bookings DML audience). Proven at scale by the full M6–M9 regression
post-apply (M6's H/I/K exercise real bookings DML through both mechanisms).

### Conventions established

- **Function grants are explicit from M10** — M7's REVOKE-then-GRANT extended
  to functions. Every future function carries its own explicit EXECUTE block;
  the §3 forward guard (global + per-schema default-privilege pair) makes a
  forgotten grant fail loud (uncallable by API roles) instead of silently
  PUBLIC-callable. Existing functions swept in-band (§4), so the convention
  holds with no asterisk.
- **Specialties return in enum-declaration order** — the project-wide
  canonical order. The app's SPECIALTIES const derives from the enum in
  declaration order and the onboarding form displays in it; directory cards
  must match the form. (`array_agg(order by specialty)` on an enum sorts by
  ordinal — the first test draft wrongly expected alphabetical; the migration
  was right, the test was fixed.)
- **Boundary tests on float geodesics use a ± band, not exact equality.**
  ST_DWithin and ST_Distance take different code paths, so the M6
  transaction-stable-`now()` trick has no float analog; B5 pins inclusive `<=`
  at D ± 0.5 m.

### Forward items

- **Regenerate `types/supabase.ts`** during the directory build — picks up the
  RPC under `Functions` (typed `supabase.rpc('nearby_trainers', …)`).
- **The listable floor stays app-level** (e.g. `display_name is not null`) —
  supabase-js can chain filters on `rpc()` results; verify that chaining
  empirically when the directory surface is built.
- **Directory data gaps** (from the pre-build investigation): nothing
  populates `profiles.display_name` (owner: the onboarding display_name step),
  `trainer_services` / pricing has no write surface, and the dev DB needs the
  trainer-population seed. All queued in the directory build plan, after M10.

---

## M11 — booking enablers (nullable payment intent, counterparty read, pagination, grant parity)

The Arc-C migration: four backlog items, every one carried in the scratch
investigations since its discovery, probed against the live DB before
drafting (P1–P4: trigger text verbatim, the dogs policy verbatim, the
circularity probe, NULLS-DISTINCT + DROP/CREATE confirmation).

**Outcome:** §1 `stripe_payment_intent_id` nullable + a one-shot,
SYSTEM-PATH-ONLY NULL→value attach spliced in place into the §10 trigger
(M9 precedent — the amendment was spliced into a `pg_get_functiondef` dump,
not retyped); §2 the counterparty profile read (`TO authenticated`, the
dogs-policy mirror) plus the trigger-ization of the profiles role freeze;
§3 deliberate service_role EXECUTE on `_bookings_ends_at`; §4
`nearby_trainers` pagination params via DROP+CREATE with full grant
re-issue (clamped 1..100 / ≥0 in-body — it is a public anon-callable API).
Verified **152/152**: the new 23-case M11 suite, the amended 19-case M10
suite, and the full M6–M9 regression (72+3+26+9), each from its own fresh
reset.

### Findings (four — a record for one migration)

**1. The squat scenario (§1's actor scoping).** The spec said "permit
NULL→value once"; the draft added "…and only via the system path" after
walking the failure: the parties hold UPDATE on their booking, so an owner
could write a garbage value into the payment-intent column pre-Phase-8 —
and immutable-once-set would then PROTECT the squat, permanently blocking
the real payment attach. Immutability guarantees are only as good as the
rules about who may perform the one permitted write. A6 pins the rejection.

**2. A policy mirror without its GRANT-CONTEXT mirror is not a mirror.**
§2's first draft copied the M6 dogs-policy structure without a `TO` clause
(defaulting to PUBLIC, M7's old lesson). Tests B4/D1 caught it: profiles
SELECT policies are OR'd, so anon evaluated the new qual — which reads
bookings, where anon holds ZERO grants — and every logged-out profiles
read (the entire public directory) died with "permission denied for table
bookings". The dogs original never detonates only because dogs has no anon
SELECT at all: same policy shape, different grant context, opposite
outcome. Fixed with `TO authenticated`; B6 pins the anon directory read
with a booking present as the standing trap.

**3. The recursion pair — and the remedy that segfaulted.** With the
counterparty policy in place, EVERY authenticated profiles UPDATE raised
42P17 "infinite recursion detected". The recursion partner was the old
UPDATE policy's WITH CHECK role-freeze SELF-SUBQUERY
(`role = (select role from profiles …)`) — a policy on profiles
subquerying profiles, tolerated until a second table-subquerying SELECT
policy joined the expansion. M9's own recorded lesson already said
OLD-vs-NEW enforcement is a TRIGGER's job; the freeze moved to a BEFORE
UPDATE trigger (`profiles_validate_update`, swept bare per the M10
function-grant convention, firing for every actor including system —
deliberately stronger) and the WITH CHECK simplified to plain
self-scoping. A correction to convention, not a workaround.
**Considered and rejected:** wrapping the counterparty EXISTS in a
SECURITY DEFINER helper INSIDE the policy — probed live, it bypassed the
planner's 42P17 guard into runtime recursion and the backend died with
**SIGSEGV**. Postgres cannot even fail that construction safely;
DEFINER-inside-policy is never the remedy.
*[M12 annotation: the segfault itself is now attributed to a LOCAL-STACK
bug, not to the construction — M10's own default-privileges guard made the
in-transaction probe helper GRANTLESS, the evaluating role hit the
permission-DENIED call path, and that path segfaults on this environment
for ANY function (M12's T1–T5 isolation). Verdict unchanged: the 42P17
recursion stands on its own and DEFINER-inside-policy stays rejected — but
"cannot fail it safely" is environment-qualified, not a Postgres property.]* (A DEFINER RPC called directly
— never inside policy expansion — remains a legitimate future shape, but
was unnecessary once the real anomaly was corrected.)

**4. Visibility migrations shift older suites' PREMISES, not just
assertions.** M8's C1 proves the thread trigger must be DEFINER by first
demonstrating "the owner is invisible to the trainer" — using the fixture
pair that shares a booking. M11 makes booked counterparties visible BY
DESIGN, so the premise check (not the contract) broke. Repointed at a
no-booking pair (owner_c): the DEFINER trap stays armed, and C1 now also
documents the M11 boundary — with-booking pairs are policy-visible,
without-booking pairs are not, and freestanding threads must work for
both. Related: the M10 fixture predates the SEED (PR #16), whose Nashville
cluster contaminated its expected sets on every post-#16 reset — the
fixture now tears down `5eed%` rows at load. When a suite's premises
encode world-state, later migrations and later seeds both move the world.

### Conventions established / extended

- **Actor-scope the exceptional write.** A "permitted once" transition
  names WHO may perform it, or the permission is a squat vector.
- **`TO authenticated` on any policy whose qual reads tables anon cannot.**
  The PUBLIC default is only safe for quals evaluable by every role that
  can reach the table.
- **No self-subqueries in policies, ever** — OLD/NEW comparisons and
  role checks against the policy's own table belong in triggers (M9's
  lesson, now enforced by having removed the last violation).
- **Signature changes are DROP+CREATE + full grant re-issue** (CREATE OR
  REPLACE would overload; the M10 guard means new signatures are born
  grantless). C3 pins "no overload left behind".

### Forward items

- Regenerate `types/supabase.ts` for the 5-arg RPC when the booking-flow
  arc starts (the 3-arg call sites keep working via defaults).
- Hosted push pending (M11 is local-only until the push decision).
- Phase 8 attaches real payment intents via the system path §1 built for
  it; whether the column returns to NOT NULL afterward is a Phase-8 call.

---

## M12 — `trainer_busy_ranges` (the slot picker's busy-times read)

One function: the booking flow's missing read. Bookings RLS is parties-only,
so a slot picker fed from owner-visible rows offers taken slots at any
trainer with a second client. `trainer_busy_ranges(t_id)` returns future
`(starts_at, ends_at)` for a trainer's PENDING/CONFIRMED bookings — ranges
only: no ids, no parties, no status detail, future-bounded in-body (an
in-progress session still appears; its tail still blocks).

**Outcome:** 6/6 M12 checks + the full M6–M11 regression (23+19+72+3+26+9)
— **158/158**, no premise shifts (function-only migration).

### The first deliberate DEFINER-as-API (the M8 convention's access-side exception)

The M8 rule is integrity → DEFINER, access → INVOKER. This is access, but
the ANSWER requires rows the caller must never see — "an aggregate answer
over invisible rows," the integrity shape generalized. The alternative
(INVOKER over a new narrow SELECT policy) was rejected on leak shape: a
policy grants ROW visibility — even column-scoped, policy-visible rows are a
queryable RELATION, and PostgREST would let anyone filter/aggregate a
trainer's full booking history (volume curves, scrapeable analytics). The
function grants ANSWER visibility: fixed question shape, fixed time window,
strictly less. It also leaves the bookings policy graph untouched (the M11
recursion lesson makes every new bookings policy an interaction surface).
Posture: STABLE, pinned-empty search_path, COMMENT with the reason,
**direct-RPC-only — never referenced inside a policy** (M11's rule), and
M12-5 pins `prosecdef = TRUE` — the deliberate inversion of the M10-D2
INVOKER pin, because an INVOKER flip would silently return zero ranges to
every non-party. Grants: authenticated + service_role; **anon revoked as
deliberate minimalism** (v1's picker lives behind the owner guard; widening
later is a one-line ride-along — the reverse asymmetry of the wide-return
trade).

### Environment finding: the permission-denied call path segfaults locally

Probing the suite's "anon denied" case crashed the local backend — and
isolation (T1–T5, minimal repros) showed the real shape: on this local stack
(supabase CLI v2.90 image, PG 17.6), **any function call by a role lacking
EXECUTE segfaults** — committed or in-transaction, DEFINER or plain SQL,
anon or authenticated; only the DENIED path crashes, the granted path is
clean. Hosted is unaffected (M11's remote verification called functions
live). Consequences: (1) the M11 finding-3 annotation above — the
"DEFINER-inside-policy segfault" was this bug wearing a costume (the M10
guard made the probe helper grantless); (2) **suites assert EXECUTE denial
via `has_function_privilege` only, never a live denied call** — which is the
right test anyway: the grant STATE is the thing under test, and the granted
path is live-proven (M12-1); (3) the CLI upgrade (v2.90 → v2.109) is a
deliberate POST-ARC item with the denial-path repro as its fixed-or-not
test (recorded in the scratch backlog).

### Forward items

- Regenerate `types/supabase.ts` (M11's 5-arg RPC + M12 together) at the
  booking-flow build's start — next group.
- Hosted push pending the standard decision.
- If a logged-out picker preview ever ships, the anon grant is the one-line
  ride-along noted in the migration.

## M13 — thread counterparty profile read (the messaging arc's enabler)

One additive SELECT policy on profiles: trainers read the profiles of owners
they share a `message_thread` with — M11 §2's counterparty read mirrored onto
the freestanding-messaging relationship. Ruled at the messaging arc's Group-1
review: M8 threads are deliberately booking-free (pre-booking inquiries are
product), but the only trainer→owner profile path was M11's BOOKING-scoped
policy, so a booking-less inquiry rendered "An owner" — proven live in the
Group-1 work (real GoTrue token: `profiles: null` on the trainer side of a
thread with no booking). Disclosure reasoning matches M11: opening a thread
IS deliberate contact.

**Outcome:** 7/7 M13 checks + the full M6–M12 regression under the
fresh-reset-per-suite protocol — **161 PASS** with exactly 3 failures, all
one pre-existing environment drift (below), none caused by M13 (control
probe: the failures persist with the M13 policy dropped in-transaction).

### The M11 lessons, applied at draft time (the point of writing them down)

TO authenticated (anon holds profiles SELECT but ZERO message_threads grants
— a PUBLIC-scoped qual would detonate the public directory exactly like the
M11 B4/D1 draft) and the recursion pair checked BEFORE drafting: the
message_threads quals are pure `auth.uid() = column` comparisons (no
profiles subquery — the thread-INSERT owner-role check reads profiles from a
SECURITY DEFINER trigger, which is not a policy and cannot join the
expansion). Candidate probed rolled-back before the file was written: party
read, stranger exclusion, anon intact, UPDATE + INSERT recursion probes all
clean. The suite pins each as a standing trap (A4 = the B6 mirror, A5/A6 =
the 42P17 traps, A7 = the roles={authenticated} catalog pin).

### Findings

**1. NAMEDATALEN truncates policy names at 63 chars — caught in the probe.**
The first draft's name ("…they share a message thread with") was silently
cut mid-word by Postgres (identifier truncation NOTICE). Shortened to fit.
A truncated name would have broken the A7 catalog pin and every future
`drop policy` referencing the documented name.

**2. ENVIRONMENT: the v2.90→v2.109 CLI upgrade changed service_role's
default table ACL (the M11 §3 drift class, now platform-wide).** On a fresh
reset under v2.109, EVERY table shows `service_role=Dxtm` — TRUNCATE/
REFERENCES/TRIGGER/MAINTAIN only, no SELECT/INSERT/UPDATE/DELETE. Three
suite cases assert the v2.90-era artifact and now FAIL: M6 J4, M7-2, M8 G2
("service_role retains full DML"). M12's 158/158 ran under v2.90; this is
the upgrade surfacing on first fresh reset, not a regression in any
migration. LEFT FAILING DELIBERATELY: the remedy is a decision, not a
ride-along — either M11 §3's pattern (a deliberate-grants migration for
whatever service_role actually needs; Phase 8's system transition path needs
bookings UPDATE per J4's own rationale) or amending the three cases to pin
the new reality. Local now matches hosted's "service_role grants are never
platform-conferred" (the M11 finding), which argues for the deliberate-
grants migration before Phase 8.

**3. The M12 denial-path segfault SURVIVES v2.109** (the recorded
fixed-or-not test, run post-upgrade): an anon call to a function without
EXECUTE still crashes the backend into recovery. The M12 convention stands —
suites assert EXECUTE denial via `has_function_privilege` only, never a live
denied call.

**4. Premise watch (the M8 C1 lesson, applied).** M13 changes profile
visibility for THREAD pairs the way M11 did for booking pairs. M8 C1's
invisibility precondition still holds — it is checked BEFORE the case's
thread INSERT — but that ordering is now load-bearing from two directions
(M11: no booking; M13: no thread yet). No test edits needed; noted in the
M13 README and here.

**5. The fresh-reset-per-suite protocol is not optional.** m9-after-m8 in
one database hits the documented fixture co-load collision (M8's lesson:
shared anchors, persisting fixture bookings). The full chain was re-run with
a reset before each suite; every non-drift case passes.

### Forward items

- **service_role deliberate-grants migration (pre-Phase-8)** — the drift
  finding's remedy decision; until then M6 J4 / M7-2 / M8 G2 fail on fresh
  local resets and document the drift.
- Hosted push pending the standard decision (expect the lightest
  classification — one additive policy).
- Group 2 of the messaging arc builds on this: the "An owner" fallback stays
  in code as defense; the live proof exercises real names on a pre-booking
  inquiry.

### M13 hosted push + remote verification (2026-07-05, post-merge)

Pushed clean — the only pending migration (hosted was already at M12; the
manual-steps "at M10" note was stale, corrected). Verification, all
read-only:

1. **Catalog pin ✅** (via `supabase db dump --linked`): the policy exists
   under its full untruncated name, `FOR SELECT TO "authenticated"`, qual
   byte-matching the migration.
2. **Anon spot-check ✅**: anon profiles read returns trainer rows only
   (200, no detonation), `nearby_trainers` evaluates clean (200). Hosted
   has no owner profiles, so anon-cannot-read-an-owner is vacuous there —
   suite-proven locally (A4).
3. **Authenticated counterparty read — not exercisable on hosted**: no
   participant credentials, and (finding 4) service_role cannot even count
   thread rows. Group 2's live proof is the real evidence, as ruled.
4. **THE ACL FACT, CITED (replaces "local now matches hosted" inference):**
   hosted grants service_role exactly `REFERENCES, TRIGGER, TRUNCATE,
   MAINTAIN` on bookings, message_threads, and profiles (pg_dump GRANT
   statements) — identical to local v2.109's `Dxtm`. Demonstrated live:
   service-role PostgREST reads of message_threads AND profiles both return
   42501 on hosted TODAY. The current app is unaffected (its only
   service-role surface is the auth admin API — lib/supabase/admin.ts), but
   any Phase-8 system-path table write via service_role is broken until the
   deliberate-grants migration. The forward item is now grounded in cited
   fact, not environment inference.

### Rulings closed by the messaging arc (2026-07-05, post-#30)

- **service_role deliberate-grants migration — RULED IN**, pre-Phase-8, as
  its own arc after messaging. The cited ACL fact (above) confirmed local
  matches hosted, so the remedy is a real migration, not a suite amendment.
  **M6 J4 / M7-2 / M8 G2 stay failing on fresh resets until that arc lands
  and amends them together** — not before; the failures document the drift
  and are the arc's acceptance targets.
- **Hosted positive counterparty read — ACCEPTED RESIDUAL.** M13's
  authenticated trainer-reads-owner path was never exercised on hosted (no
  participant credentials; service_role can't count thread rows). It is
  suite-proven locally (M13 A1) and live-proven end-to-end on the local
  stack (the #30 finale: real name on a booking-less inquiry). **The first
  real hosted thread is the de facto proof, and the first suspect if hosted
  messaging ever misbehaves.**

---

## M14 — deliberate service_role table grants (the drift remedy, pre-Phase-8)

Two additive GRANTs and nothing else: `bookings → SELECT, UPDATE` and
`trainer_stripe_accounts → SELECT, INSERT, UPDATE` to service_role. The
remedy the M13 arc ruled in: the v2.90→v2.109 CLI upgrade removed
service_role's platform-default DML (every table `service_role=Dxtm`),
matching hosted's provisioned-from-day-one state — the M13 hosted
verification's CITED ACL FACT. Grants are never platform-conferred for
service_role; M14 is the declaration of what the server actually needs.

**Scope was ruled at investigation QA (2026-07-08), minimal per-table, NOT
blanket ALL:** every verb maps to a system path the schema already declares
— the M6 §10 trigger's `v_is_system` branch (PENDING→CANCELLED by system,
CONFIRMED→COMPLETED cron), the M11 §1 payment-intent attach (NULL→value,
system-only), and M5's two-gate design under which service_role is
`trainer_stripe_accounts`' ONLY writer (Phase-7 onboarding INSERT, Phase-8
`account.updated` UPDATE). SELECT rides along as mechanics, not widening:
Postgres requires SELECT on columns an UPDATE's WHERE clause reads, and the
webhook/cron must resolve rows. The absences are design and now pinned:
no bookings INSERT (entry is owner-only via §9), no bookings DELETE
(cancellation is a transition, never a row removal — J2), no
trainer_stripe_accounts DELETE (row absence is a first-class state), and
nothing on any other table (the app's entire service-role surface is the
auth admin API; blanket ALL would recreate M6 Category J's founding defect
— unconsidered privileges — pointed at the one role that bypasses RLS).
Precedent extended: M11 §3/§4's "deliberate, both envs" for function
EXECUTE, now applied to table DML.

**Outcome:** full M6–M14 chain under the fresh-reset-per-suite protocol —
**167 PASS, 0 failures** (m6 72, m7 3, m8 26, m9 9, m10 19, m11 23, m12 6,
m13 7, m14 2). The arc's definition of done: the three deliberately-red
drift documents (M6 J4 / M7-2 / M8 G2) are green as declared-set pins, and
zero pre-existing-failure carve-outs remain anywhere in the chain. (One
known cosmetic psql quirk, pre-existing since M9/PR #11 and untouched by
this arc: category A's A5 `\echo` label contains an apostrophe, which psql
reports as "unterminated quoted string" — the case itself passes.)

### The acceptance targets, amended together (the ruling, executed)

M6 J4 / M7-2 / M8 G2 — the three cases that pinned the v2.90 platform
artifact ("service_role retains full DML") and stayed deliberately red on
fresh resets since 2026-07-05 — flipped in the same change from over-revoke
guards to DECLARED-SET pins, asserting both directions: J4 pins bookings
`{SELECT,UPDATE}` with INSERT/DELETE absent; M7-2 pins
trainer_stripe_accounts `{SELECT,INSERT,UPDATE}` (DELETE absent) and dogs
empty; G2 pins messaging's set as EMPTY (absence is now the assertion — a
stray grant would hand the RLS-bypassing role a surface no designed path
uses).

### The M14 suite's contract (pinned in its README so it survives)

**Assert what we DECLARE; stay silent on platform-default housekeeping.**
The new suite is a catalog-driven matrix — EVERY public table ×
{SELECT,INSERT,UPDATE,DELETE} for service_role, table list from pg_class,
so a future table that never declares its service_role position is asserted
`{}` automatically and fails loud. It deliberately never asserts
TRUNCATE/REFERENCES/TRIGGER/MAINTAIN: those are the platform's to shuffle
(v2.90→v2.109 already did, once, silently), and pinning them would
re-couple the suite to the exact drift class M14 cures. A second check pins
declaration integrity (a rename/drop can't silently orphan a declared table
out of the matrix).

### Findings

**1. M5's grants comment held a stale assumption, corrected in M14's header
(applied migrations are never edited).** M5 §5 says service_role "has
implicit table-level privileges via the Supabase grants chain" — true under
the platform default M5 shipped against, false on hosted since provisioning
and false locally since v2.109. The two-gate design's WRITE path silently
depended on a platform default the platform then removed; the design was
right, its grant assumption wasn't. M14 is the deliberate replacement.

**2. The state-file "local stack up" note was stale** — the stack was down
at session start (Docker running, zero containers). Started fresh; the ACL
fact re-confirmed live before any work: all 12 tables `service_role=Dxtm`,
zero DML, byte-matching the journal's cited hosted state. Pause snapshots
record the moment of pause, not the moment of resume — environment notes
get re-verified, not trusted.

**3. Probe discipline paid out again:** the rolled-back probe (BEGIN → the
two GRANTs → 12-tables×4-verbs matrix → ROLLBACK) confirmed the ACLs land
exactly on the declared set (`bookings service_role=rwDxtm`,
`trainer_stripe_accounts=arwDxtm`) and revert clean, before the migration
file was written.

**4. The pre-PR review surfaced a real unreconciled declaration (and three
suite hardenings).** M11 §4 grants service_role EXECUTE on
`nearby_trainers` — SECURITY INVOKER (the M10-D2 pin), body reads
trainers/profiles/trainer_specialty_assignments, all service_role-SELECT-
less under M14's declaration. Verified live: a service-role call fails
42501 ("permission denied for table trainers") INSIDE the body — and did
before M14; the same drift that removed service_role's DML removed the
SELECTs that made it work under v2.90. Not a regression, not a grant to
add: no code path calls it via service_role (single call site is the
directory page under the session client). M11 §4's grant stands as
grant-LAYER parity only; a real service-role caller, if one ever appears,
makes the SELECT set a deliberate-grants decision then. Reconciled in the
M14 header. The suite hardenings from the same review: `relkind IN
('r','p','f')` so partitioned/foreign tables can't slip the fails-loud
matrix, `has_table_privilege` on pg_class oids so quoted identifiers are
checked rather than detonating the DO block, one shared declared-set
source for both checks, and the per-table `ok` line gated on that table
actually matching. Declined (contradicts the ruling): retiring J4/M7-2/G2
as redundant with the capstone — they are the acceptance targets, amended
in place, and per-suite self-containment is deliberate.

### Forward items (both ruled at investigation QA, 2026-07-08)

- **profiles SELECT for webhook-context mail — DEFERRED to the Phase 8
  arc.** Phase 8's webhook emails need counterparty display names with no
  user session (today's transition mail reads profiles under the acting
  user's session — impossible in a webhook). Grant or DEFINER function,
  decided against the real webhook code; grants ride with the feature that
  needs them (the M10 convention).
- **Phase 8 open design item: who confirms a booking.** The build plan's
  "webhook confirms booking" line predates PR #27's trainer-answers design;
  the §10 trigger gives PENDING→CONFIRMED to the trainer only. Lean:
  PR #27's trainer-only design is the spec (payment success does not
  auto-confirm). Either way the verb is UPDATE — no M14 impact. Also new
  Phase-8 tables (idempotency ledger, refunds) declare their own
  service_role position in their own migrations.

---

## M15 — trainer feed tokens + the ICS feed (calendar bridge, EXPORT half)

The arc: every trainer gets a secret per-trainer URL that puts their
PawMatch bookings into Google/Apple/Outlook via calendar subscription —
demand-gen's "fits into the tools you already use," product not demo. DB
surface: `trainer_feed_tokens` (sha256 at rest, plaintext-once, M5
row-absence semantics — a TABLE, never a column on anon-readable trainers,
the investigation's standout catch), `rotate_feed_token()` as the ONLY
write path (no INSERT/UPDATE policy or grant exists for any api role — a
client-chosen token is impossible by construction), and two DEFINER-as-API
reads in the M12 lane (`trainer_feed_events`, `feed_token_exists`),
EXECUTE service_role only. App surface: the repo's first route handler
(`/api/calendar/[token]`, text/calendar, no-store) over ical-generator
(new dep: zero hard dependencies, TS-native; ICS is all edge cases —
CRLF, 75-octet folding, escaping), and the /account trainer card
(generate/rotate/disable, plaintext-once UX, inline two-step confirms).

All five investigation-QA rulings (2026-07-09) applied: CANCELLED emitted
as STATUS:CANCELLED in-window (never silent omission, same UID);
FEED_WINDOW_PAST_DAYS = 60 as the named constant in the RPC — the window
has ONE owner, re-filtered nowhere; full display names with rotation as
the privacy remedy; hashed at rest, shown once, one-button rotation;
DEFINER-as-API with EMPTY-not-error on bad tokens.

**Outcome:** full fresh-reset M6–M15 chain **182 PASS, 0 failures** (m6
72, m7 3, m8 26, m9 9, m10 19, m11 23, m12 6, m13 7, m14 2, m15 15); the
M14 catalog matrix picked up the new table and asserted its `{}`
service_role position AUTOMATICALLY — the fails-loud contract's first
real exercise, unedited. 80/80 unit tests incl. byte-level golden ICS.

### Findings

**1. The §6 corollary (caught drafting the route, probed rolled-back,
amended into M15 pre-merge):** "bad token → EMPTY" makes an invalid token
indistinguishable from a valid feed with zero in-window bookings — and
valid-but-empty is exactly the first real trainer's day one. Serving them
404 would present as broken in Google. `feed_token_exists()` gives the
route the fork: invalid → 404 (byte-identical for wrong/nonexistent/
malformed), valid-but-empty → 200 empty calendar.

**2. handle_new_user copies ONLY role from signup metadata** —
display_name is app-set later. Surfaced by the M15 probe's first run
(NULL owner name); every fixture that needs names must set them the way
the app would.

**3. supabase gen types is OPTIMISTIC about RETURNS TABLE nullability:**
the generated row type claims owner_display_name: string, but the column
mirrors nullable profiles.display_name. The widened type lives in ONE
place (lib/feed/ics.ts, imported type-only by the admin module) and the
"An owner" fallback is load-bearing, not decorative.

**4. Review gates (two high-effort workflow reviews, 7 + 10 findings,
all applied after dedup; the second review's synthesize step died on a
session limit — findings arrived unmerged and were triaged by hand):**
- The C4 catalog pin matched ANY search_path value (`like
  '%search_path=%'` blesses `search_path=public` — the DEFINER shadowing
  surface the pin exists to forbid). Now an exact `@> array
  ['search_path=""']` pin. THE LESSON: a security pin that substring-
  matches its target isn't a pin.
- getFeedEvents ran exists-then-events: two round trips on the
  unauthenticated hot path AND a rotate race serving 200-empty for a
  just-rotated token (Google would wipe the trainer's events for that
  cycle). Events-FIRST closes both: non-empty proves the token in one
  call; only the empty case pays for the existence fork.
- The route's `?? ""` siteUrl fallback shipped dead relative Manage
  links on a misconfigured deploy; now null → line omitted + loud log.
- UI state model: stale rotate state outliving a newer disable (dead URL
  rendered as live), an armed "Rotate now" left under a fresh URL,
  "Copied ✓" surviving a rotation, and the page swallowing the
  status-read error — which would render an ENABLED feed as "Generate"
  and bypass the rotate warning entirely. All restructured: one view
  value updated in completion order (last action wins), tri-state
  enabled/disabled/UNKNOWN from the server (a failed read degrades to
  read-only, never to Generate).

### Forward items

- **Import half (busy-block sync)** — separate arc, seams verified open:
  external blocks enter slot math via the M12 RPC (UNION in-body) or
  merged in getBusyRanges; token table stays export-specific; import
  needs an ICS parser (ical-generator generates only).
- Google poll cadence is the client's (~12-24h, no force-refresh):
  onboarding copy sets the expectation; REFRESH-INTERVAL is advisory.
- cloudflared added to dev tooling (live proof needs Google's servers to
  reach the local stack; accountless quick tunnels).

### M15 live proof (2026-07-09, pre-PR — the arc's definition of "works")

Two-part proof, HTTP layer scripted + product lane by hand, through a
cloudflared quick tunnel so Google's servers could reach the local stack
(tunnel killed immediately after; dev-only tooling).

**HTTP legs (scripted, real GoTrue session — the server action's exact
lane):** password login as the seeded proof trainer → rotate_feed_token →
64-hex; the PUBLIC tunnel URL served `200 text/calendar; charset=utf-8,
no-store` with both proof bookings (CONFIRMED + TENTATIVE, real
owner/dog/service names, `<booking_id>@pawmatch` UIDs); rotate → the OLD
URL 404s through the tunnel, the new one serves both events.

**Manual legs (Shane, real browser + real Google Calendar):**
1. /account as the proof trainer: the fresh URL rendered EXACTLY once —
   copy button, the existing-subscriptions confirm warning, metadata-only
   after navigating away. Ruling 4's UX, confirmed live.
2. Google Calendar accepted the tunnel URL; both bookings appeared on the
   prompt initial fetch — CONFIRMED solid, PENDING tentative, names and
   services correct.
3. Rotated in the UI, fetched the OLD tunnel URL directly: 404. Rotation
   kills a live subscription's access — the security story end-to-end
   through the real UI lane.
4. Accidental bonus leg: a malformed token (literal placeholder text)
   404'd identically to a wrong token — the validator's no-oracle
   behavior, human-verified.

**Staleness expectation, stated for the record:** Google's UI shows a
dead subscription until its next poll cycle (hours-to-a-day). The direct
404 is the proof; Google catching up is not part of it.

### Forward items (M15 close)

- **FRICTION, fix before the first real trainer (not this arc): the copy
  button hands out a localhost-origin URL in local dev** — useless to any
  calendar service. The URL must be built from the configured site
  origin; verify NEXT_PUBLIC_SITE_URL is set to the real origin on every
  deployed environment (Vercel) and decide the local-dev behavior
  (tunnel-aware or a visible "dev origin" warning).
- Import half (busy-block sync): separate arc; seams recorded above.

---

## M16 — external calendars (calendar bridge, IMPORT half)

The demand-gen promise completed: a trainer's external calendar
(Google/Outlook/Apple secret ICS URL — her ProPet schedule arrives
transitively via ProPet→Google) blocks PawMatch bookable slots.
**ADVISORY sync by strategy ruling** — poll lag can never fully prevent a
conflict; the pending→confirm flow is the designed backstop. We block
what we know; we don't promise perfection, and the EXCLUDE constraint
deliberately does NOT know external blocks (a hard INSERT rejection would
promote advisory to authoritative).

DB surface (M16 migration): `trainer_external_calendars` (subscription,
one per trainer, row-absence semantics; the pasted URL is a bearer
credential stored RETRIEVABLE — column-granted to NO api role, read only
via a service_role DEFINER lane) and `trainer_external_busy_blocks`
(INSTANTS ONLY — no titles, the third-party-PII argument in the header:
her clients' names never touch our DB). Three DEFINER lanes
(`set_external_calendar` authenticated; `external_calendar_to_fetch` +
`refresh_external_blocks` service_role) and the M12 `trainer_busy_ranges`
amended IN PLACE with a union arm (the M9/M11 splice precedent; the M12
suite re-runs UNAMENDED as the contract proof). App surface: an
SSRF-guarded fetcher, a node-ical parser wrapper, fetch-on-read sync, and
the /account "Your calendar" card.

All seven investigation-QA rulings (2026-07-09) implemented. **Outcome:**
fresh-reset M6–M16 **201 PASS, 0 fail** (m16 19; m12 UNAMENDED 6/6; m14
matrix 15 tables — both new tables auto-asserted service_role DML {});
app gates typecheck/lint/**100 tests**/build green; live-proven end to
end against a real Google calendar (below).

### Findings

**1. STALE BEATS NONE is pinned in the DB, not app code.** A failed fetch
(`refresh_external_blocks(fetch_ok=false)`) is structurally unable to
touch blocks — the failure branch only bookkeeps. A silent unblock is
this feature's worst outcome (her real schedule stops being respected
exactly when her calendar host hiccups); the invariant lives where app
code can't bypass it.

**2. The url column's absence is a loud TRIPWIRE.** Column-scoped grants
expose only metadata to the trainer; the `url` column is granted to no
role. The M16 suite asserts `has_column_privilege` false for every role,
so a future table-level `GRANT SELECT` that silently re-exposed it fails
the suite. Verified live: a real trainer reading their own row's `url`
gets 42501. URL residual ACCEPTED (raw-DB access reads it) with the
marginal-blast argument load-bearing (our own tables dominate that blast
radius) and the tripwire: re-argue the day they stop dominating.

**3. Two silent-double-book parser bugs (review, verified vs node-ical's
real output shapes).** (a) Recurring ALL-DAY events carry `datetype=date`
AND an rrule; the all-day branch used to push once and `continue`,
blocking only the first occurrence — a weekly "out of office" left every
later week bookable. (b) `rrule.between(now, …)` drops an occurrence that
STARTED before now but is still in progress, so a client could book
during a live class. Fixed by unifying RRULE expansion across all-day and
timed and expanding from `now − duration` (push() filters the truly
past). LESSON: a recurrence library's `between` is start-exclusive at its
lower bound and does not apply EXDATE — both are the caller's to handle,
and only real-payload testing surfaces the dual-key override storage.

**4. A fetch-on-read DoS, caught in review.** A feed that never succeeds
never advanced `last_fetched_at`, so the never-fetched branch re-ran a
synchronous ≤5s outbound fetch on EVERY public book-page render forever —
an attacker could point a feed at a slow host and tie up handlers 5s at a
time. Fixed with a `last_attempted_at` column that advances on success
AND failure; the app TTL gate reads IT, so a failing feed backs off to
the 15-min cadence. The migration was amended in place (unmerged branch),
probed rolled-back, and the suite pins the invariant. Plus an in-process
in-flight dedup Map against the concurrent-render thundering herd.

**5. supabase gen types is optimistic about RETURNS TABLE nullability
(again — the M15 lesson).** `external_calendar_to_fetch`'s timestamps are
genuinely nullable (never-fetched / never-attempted / not-failing);
widened at the one admin-lane boundary.

### Live proof (2026-07-11 / 2026-07-17) — the arc's definition of "works"

Real Google test calendar (Weekly Class Mon 10:00 CDT from 7/20, the 7/27
occurrence deleted via EXDATE, the 8/03 occurrence MOVED to 8/04, plus an
all-day 7/21), captured to `tests/fixtures/google-proof-calendar.ics`
(Shane rotated the secret address post-capture; the committed .ics body
carries no secret).

- **Golden**: the captured payload through the real parser yields exactly
  the expected instants (weekly minus the EXDATE'd one, the moved
  instance ONCE at its new time via dual-key dedup, the all-day's exact
  Chicago-zone UTC range, no titles), stable under four server timezones.
- **App layer (real network fetch)**: `fetchIcsSafely` → parse →
  `computeBookableSlots` proves the 7/20 Monday slot BLOCKED, the 7/27
  EXDATE'd Monday SURVIVES, the 8/03 moved-away Monday SURVIVES, the 8/04
  moved-to Tuesday BLOCKED.
- **DB lane**: subscribed the real URL through the real authenticated
  `set_external_calendar` (204), the url-column tripwire held live
  (42501), the real parsed blocks landed in `trainer_busy_ranges`.
- **Stale-hold**: a real post-reset (dead-token) URL failed cleanly
  through the fetcher; `refresh_external_blocks(fetch_ok=false)` HELD all
  three blocks, set `failing_since`, advanced `last_attempted_at`
  (backoff). The visual browser legs (UI subscribe, Google-side reset)
  are the trainer-facing confirmation; the mechanism is proven here.

The live-proof harness (`lib/feed/external-live-proof.test.ts`) is gated
behind `LIVE_PROOF=1` + `EXTCAL_URL`, so CI never depends on Google.

### Forward items

- **P5 advisory residual (ACCEPTED, ruled)**: within the 15-min TTL a
  slot the trainer just blocked externally can still be offered; the
  confirm backstop covers it. This IS the advisory design — not a bug.
- **The always-paid admin RPC** on the book path (one PK-indexed lookup
  even for unsubscribed trainers) is unavoidable at that seam (the owner's
  session can't see the trainer's sub row under RLS); denormalizing a
  flag onto the public trainers row is a future optimization.
- Import authenticates by pasted ICS URL only; an OAuth-based source
  (Google API push, sub-minute freshness) would be a later arc if the
  advisory cadence proves too slow.

---

## M17 + Front Door — the arc a STRANGER meets (payment info, origin, homepage, signup)

The last arc before the first real trainer onboards: the product as a
stranger first meets it. Four threads under one theme.

**M17 — trainer_payment_info (off-platform payments, INFO DISPLAY ONLY).**
A trainer says how they take payment; the owner sees it after a booking
is CONFIRMED. PawMatch never touches the money.

DEVIATION FROM THE RULING, confirmed at the gate: ruling 6 said
`trainers.payment_instructions` columns. The probe showed that breaks
anti-harvest — a payment column on the anon-readable `trainers` table
(M7's anon table-SELECT) can only be hidden from anon by converting that
grant to column-scoped, which flips `has_table_privilege(anon, trainers,
SELECT)` false and breaks the M7-1 contract. A dedicated table gets
anti-harvest BY CONSTRUCTION (no anon grant — the M5 trainer_stripe_
accounts sibling) and leaves M7 untouched. Shane confirmed: "the
deviation is the ruling's intent surviving the probe."

Read model = the M11 booking-scoped counterparty precedent (house rule:
floor ≠ view spec): the owner reads a trainer's payment IFF they hold a
CONFIRMED booking (EXISTS over bookings — pure column comparisons, no
42P17). Trainer reads/writes own row. anon nothing; a non-client
authenticated user harvests ZERO. Handles are validated SLUGS (CHECK
charset); the app builds the href from a fixed host (venmo.com/u/,
paypal.me/) — no user-supplied url to sanitize. 11-case suite; M14
matrix now 16 tables (service_role DML {} auto-asserted).

**siteOrigin() — the localhost-origin bug, fixed at the root (ridden
since M15).** One origin source with precedence NEXT_PUBLIC_SITE_URL >
VERCEL_URL > localhost, unit-tested, never empty. All four construction
sites migrated (the feed copy URL, the in-feed Manage link, six
transactional-email deep links — the `?? ""` one had emitted BARE
RELATIVE links into email — and the email-confirm redirect). Falls back
to localhost only off-Vercel with nothing set, and then logs LOUD in
production (the alarm the ad-hoc guards had).

**Homepage.** The Phase-0 scaffold (theme card, dead buttons) → a real
front door: owner hero → /trainers, a truthful three-capability strip,
the trainer pitch verbatim + free-for-founding-trainers → /sign-up. The
header carries a STANDING truthful-copy contract: no reviews, no in-app
payment, no social-proof/volume claims until built (there are no real
trainers yet — the point of the launch).

**Signup hardening** (the flow only admin-created users had exercised):
Turnstile bot gate (fail closed + visible — a missing/spent/invalid
token, a Cloudflare outage, or an unset secret all block signup with a
message, never fail-open); a BLOCKING name step (/welcome, one field, no
skip) enforced in MIDDLEWARE across every authed surface (the review
caught that a per-page /account bounce was bypassable by direct URL);
the email-verification path made complete (resend with no enumeration
oracle, confirm route origin fixed). Verification-ON itself is a Supabase
dashboard toggle + the config below.

### Review (high-effort workflow, 21 agents, 8 distinct findings, all
### applied except one consciously declined)

- **The blocking name step was bypassable** — only /account bounced; a
  nameless user could deep-link to /messages, /owner/bookings,
  /trainer/bookings and transact (the counterparty then saw "An owner").
  Fixed in middleware: a display_name check on the authed-surface
  prefixes (public browse and the auth flow exempt), the real chokepoint.
  LESSON: "blocking, no skip" means one enforced chokepoint, not N
  per-page guards that miss a page.
- **Turnstile token is single-use** — never reset after a failed submit,
  so a legit human was permanently blocked after any downstream signup
  error (email taken, weak password). Fixed: the widget resets on a
  parent reset signal; it also renders idempotently on mount (SPA
  soft-nav where onLoad won't refire).
- **/welcome dead-end** — no escape if the name-write kept failing
  (missing profiles row). Added a sign-out escape hatch (mirrors
  /account's).
- **siteOrigin silently emitting localhost** — the old per-site guards
  omitted the link + logged loudly; the helper now restores the loud
  production alarm.
- Cleanups: resend gained its zod boundary; owner/bookings' two
  independent reads now Promise.all. DECLINED: dedup the two
  display-name actions — they diverge in post-condition (redirect vs
  success), a shared helper would net-neutral.

### Outcome + config gate

Fresh-reset M6→M17: **213 PASS, 0 fail** (m17 12; m7/m12 unamended;
m14 matrix 16 tables). App gates typecheck/lint/113 tests/build green.
Five clean commits (M17 db / origin / home / signup / payment).

External deps Shane completed pre-proof: domain live
(https://joinpawmatch.com, SSL/DNS), prod NEXT_PUBLIC_SITE_URL set,
Turnstile keys in Vercel Production, redeployed. REMAINING: the Supabase
auth config (email-confirmation toggle + template + redirect allow-list;
exact values in docs/manual-steps.md §Auth). The arc's live proof — a
COMPLETE STRANGER WALKTHROUGH on the deployed site — runs after that
config lands, and precedes PR #35 (live-proof-before-PR).

### Front Door — hosted push + production walkthrough (2026-07-23)

**M17 hosted push + catalog verification — ALL ✅** (heavier class: new
table + RLS + CHECKs). From hosted pg_dump: `trainer_payment_info`
present, RLS enabled; exactly 4 policies all `TO authenticated`
(booking-owner read, trainer own read/insert/update); grants
authenticated {SELECT,INSERT,UPDATE}, **anon NONE** (anti-harvest by
construction), **service_role housekeeping-only = DML {}** (M14 contract,
remote); all 3 CHECKs present. Sweep: only bookings +
trainer_stripe_accounts hold service_role DML across 16 tables. Anti-
harvest confirmed live: anon reading trainer_payment_info via the public
API → 401.

**Production walkthrough on joinpawmatch.com — the HOSTED POSITIVE PROOF**
(the rehearsal was the pre-merge proof; this closes it). A complete
stranger funnel, zero admin hands, Shane driving browser + inbox, with
backend evidence verified per leg:
- **L1** homepage + real CTAs.
- **L2** signup — the REAL Turnstile challenge appeared and passed →
  auth.users created UNCONFIRMED, role=owner (proves confirmation is
  genuinely on; admin API).
- **L3** confirmation email arrived, link origin = joinpawmatch.com (the
  siteOrigin fix, live) → email_confirmed_at set after the click.
- **L4 — the name gate (the review-fixed bypass, proven closed on prod):**
  landed on /welcome (not /account); BOTH deep-links (/owner/bookings,
  /messages) bounced to /welcome.
- **L5** name set → /account (staying there is itself proof the write
  landed — a null name re-bounces).
- **L6** browse (Willow Creek K9 the only listable trainer) → message →
  thread opened.
- **L7** a CONFIRMED booking → the "How to pay" block + app-built
  venmo.com/u/ + paypal.me/ links rendered to the owner (booking-scoped
  RLS), long-press-verified.
- **L8** (resend + bad-token error surface) — covered by the rehearsal.

**LESSON — hosted seeds use the REAL lifecycle, never trigger-disable.**
Leg 7's first seed used `ALTER TABLE ... DISABLE TRIGGER` (fine locally)
to insert a CONFIRMED booking directly. On the hosted Supavisor pooler
the DDL did not take and the whole transaction ROLLED BACK — yet the
in-session SELECT (evaluated before the rollback) printed
"SEEDED | CONFIRMED", masking the failure; /owner/bookings then showed
nothing. Independent REST read-back (service_role SELECT on bookings —
one of the two tables M14 leaves it readable) exposed the empty table.
Fix: seed via the genuine lifecycle — insert PENDING (passes the insert
trigger), then confirm AS THE TRAINER via a scoped `request.jwt.claims`
GUC (the trigger's real trainer path). Two rules banked: (1) hosted
seeds never disable triggers — drive the real flow; (2) an in-session
SELECT is not persistence proof — always read back on a fresh connection.

**Residual CLOSED** (M13/M15/M16 pattern, one notch further): the
rehearsal made the funnel a near-certainty; this production walkthrough
is the hosted positive proof. The Front Door arc — and the pre-first-
trainer launch readiness — is complete.
