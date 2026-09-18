# Canada and UK implementation status

Release preparation record, 2026-09-18. **Local checks and hosted timezone preview passed; production release pending.**

## What changed

- Trainers can choose the US, Canada, or UK and enter the appropriate postal
  code. Nearby search includes country and approximate postal areas, including
  Northern Ireland. Canadian distances display kilometres.
- New Canadian services use CAD; UK services use GBP; US services use USD.
  Prices, bookings, and emails explicitly identify currency. Existing services
  and bookings retain their currency when a trainer moves.
- Owners can browse freely and create accounts when they want to message or
  book. Owner signup has no new postal-code requirement.
- Canadian and UK time zones are supported, with bundled current rules for
  scheduling and imported calendars. No new account, paid service, or payment
  processing was added.

Location remains approximate. The UK data is a dated snapshot rather than an
exhaustive current postal register; unknown areas show an error. Existing US
records receive US/USD defaults in the prepared migration without changing
their saved points or amounts.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | Passed on pinned Node 22.23.2 |
| ESLint | Passed |
| Complete unit/component suite | 339 passed; 2 existing tests skipped after the live-database verification repair |
| Independent review | Country-switch timezone defect found and fixed; regression passed |
| Scheduling/import/startup suite | 62 tests passed under UTC and Chicago |
| Bundled timezone data | 5,434 comparisons against independently compiled official rules matched |
| UK data | Pinned source hash checked; generated data reproduced; all 2,978 code shapes/coordinates checked |
| Database runner | Syntax and five mocked refusal paths passed |
| M22/M14 SQL and schema type generation | Passed in Shane's Terminal; M22 applied locally and actual generated types inspected |
| Full production build | Passed in Shane's Terminal; BUILD_ID and serving production output verified |
| Timezone packaging | All 27 app traces contain all four existing timezone resources |
| Public browser walkthrough | Passed: US browse/profile/USD price, CA km search, Northern Ireland search, full-code shortening, invalid suffix error, login links |
| Authenticated Canadian/UK listing and booking browser flows | Both Chromium tests passed in 40.5 seconds, including fixture cleanup |
| CI | All gates passed on `c563b13`, run 35390620003, including compiled startup |
| Compiled startup regression | Isolated Next production build reproduced the hosted error; native calendar-package loading fixes it and the new post-build check passes |
| Hosted preview | `CZVm4R8YqBBRKvn9WaoaXwNrzoR7` passed actual function startup: Node 22.23.2, IANA 2026d, four resource hashes, 11 clock checks, 3 calendar checks; login rendered successfully |
| Hosted migration, production deployment, live walkthrough | Not performed |

Shane supplied the complete successful local runner output: legacy backfill
rehearsal rolled back, M22 applied through the local migration ledger, all M22
checks passed, and the M14 matrix matched all 18 tables. Schema types were
regenerated from that database; their actual file diff was inspected and the
application typecheck passed again. No browser success is inferred from SQL or
mocked tests. Shane then ran the two browser regressions from Terminal: CA passed
in 18.1 seconds and GB in 16.7 seconds. The local Playwright last-run artifact
also records `status: passed` and no failed tests. Both workflows cover actual
onboarding, invalid postal input, service creation, anonymous country/proximity
discovery, login gates, owner booking requests, and preserved CAD/GBP booking
snapshots after service repricing. Their cleanup hooks completed successfully.

## Working copy

Application changes are isolated on `codex/canada-uk-support` at:

```text
/Users/shanedempster/Code/trainer-marketplace/docs/scratch/canada-uk-implementation
```

The original checkout's Git metadata is read-only, so its application files
were not overwritten. This working copy contains all changed/new source files,
SQL, tests, and documentation. Its local `node_modules` is a symlink to the
original installed dependencies; it must not be committed. No dependencies were
added or upgraded. Shane started this working copy's production preview on
127.0.0.1:3001 in his Terminal; leave that user-owned process running. The
browser regression's temporary accounts and associated rows were removed by its
successful cleanup hooks. Anonymous local search events remain, as documented.

## Local database step — completed

With Docker Desktop and the existing local Supabase stack running, execute in
Mac Terminal:

```sh
cd /Users/shanedempster/Code/trainer-marketplace/docs/scratch/canada-uk-implementation
bash scripts/verify-international-db.sh
```

This refuses hosted targets and unrelated pending migrations. It rehearses
the migration with rollback, applies only M22 to the local development database,
runs the SQL checks, and regenerates types. It does not reset existing data.
Shane ran this successfully from Terminal because Codex cannot access Docker
here. Do not rerun the migration rehearsal against the already migrated schema;
the guarded runner automatically skips it on subsequent verification runs.

Typecheck was rerun successfully after regeneration and release preparation.
The complete tests and lint passed again after adding hosted startup reporting
and a build command that selects the bundled timezone files on Vercel.
Shane built and started this working copy on port 3001 with pinned Node 22.
The successful BUILD_ID and all 27 app traces were inspected; every trace has
the four timezone resources. Public browser controls and both authenticated
Canadian/UK listing and booking workflows passed against that production build.
Keep email in log mode for local US/Canadian/UK profile, service, public search,
and owner-booking walkthroughs. Do not build while a server uses that checkout's
`.next` directory.

Shane authorized publishing on 2026-09-18. Release preparation is in progress:
verify the hosted timezone resource path and actual function behavior in
[the timezone runbook](timezone-data.md), then follow the guarded
[M22 production procedure](m22-production-release.md) before releasing the app.
The production website and database remain unchanged at this preparation checkpoint.
The startup environment setting is saved for Preview and Production and takes
effect only in new deployments.

Release branch commit `5948e2c` was uploaded from Shane's Terminal, and
[PR #63](https://github.com/sdempster23/trainer-marketplace/pull/63) is open and ready for review.
The initial Vercel preview built with Node 22.23.2, ICU 78.2, and bundled
IANA 2026d, but its dynamic requests failed before the readiness report with
`g.BigInt is not a function` while loading the calendar dependency from
compiled instrumentation. An isolated Next production build reproduced the
exact error. `serverExternalPackages: ["node-ical"]` preserves native CommonJS
resolution for its Temporal/JSBI dependencies and fixes the compiled hook.
Both build commands now run `scripts/check-built-timezones.mjs` against the
actual emitted instrumentation. The corrected build command passes with an
intentionally nonexistent hosting ICU path, while stale 2026a data still
refuses startup. All 62 scheduling/import/startup regressions pass.
Correction `c563b13` passed CI and the corrected hosted preview. Its actual
function report verified `/var/task/data/timezones/2026d/le`; setting
`ICU_TIMEZONE_FILES_DIR` to that directory activated IANA 2026d. The fresh
preview report at 21:55:48 UTC passed all startup checks, and public login
returned 200. The same setting is saved for Production; its own runtime
report must still be checked after release. No hosted booking/account writes
were used for these checks.

The first production migration attempt stopped before the dry run because the
live-site check expected a database address in public login JavaScript. Login
uses a server action, so those public chunks do not contain the address. The
live directory's canonical avatar URLs independently confirmed the expected
project. The corrected check passed against the five actual rendered directory
avatars, 23 regression/refusal tests, and five complete mocked publisher runs.
It still refuses missing or conflicting evidence and unrelated migrations.
M22 has not been applied remotely.

Fresh Vercel dashboard inspection confirms `main` is the production branch;
other branches use Preview. The dashboard selects Node 24, while this release
pins Node 22 in `package.json` to match the tested runtime. Build commands and
root directory have no dashboard overrides. Preview and Production currently
share Supabase and Resend variable scopes, so hosted smoke checks must remain
read-only. No hosted test accounts, bookings, or messages are part of this release.
