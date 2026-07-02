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
