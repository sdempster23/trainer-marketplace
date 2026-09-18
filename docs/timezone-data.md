# Timezone data for Canada and UK bookings

## Local setup — ready, 2026-09-18

PawMatch bundles official IANA **2026d** rules compiled into ICU resources at
`data/timezones/2026d/le`. Normal development commands load them automatically:

```sh
pnpm check:timezones
pnpm test
pnpm build
pnpm dev
```

`dev`, `start`, `build`, `test`, `test:watch`, and `test:e2e` run through
`scripts/with-timezone-data.mjs`. It verifies the bundled SHA-256 hashes,
starts a fresh Node process with an absolute `ICU_TIMEZONE_FILES_DIR`, checks
the loaded version/clock/calendar behavior, and then starts the requested
command. No global environment edit, new npm dependency, or system Node change
is required. The bundle supports little-endian machines, including this Mac
and ordinary Linux x64/ARM64 deployments.

The unmodified Node 22.23.2 binary contains ICU 78.2 / IANA 2026a. The wrapper
updates its timezone data to 2026d without replacing Node. Direct commands
such as `node scripts/check-timezones.mjs` inspect whichever data that process
actually loaded; use the normal package scripts to load PawMatch's bundle.
An explicit startup `ICU_TIMEZONE_FILES_DIR` overrides the bundled directory
for an intentional, verified future update.

Vercel uses the separate `build:vercel` command selected in `vercel.json`.
Its `--bundled` flag always resolves the checked-in resources on the build
machine, even when the hosting environment supplies a different absolute
path for the deployed function. Ordinary local commands still honor an
explicit override. `package.json` pins `engines.node` to `22.x`, matching
`.nvmrc` and the verified runtime; the project dashboard was observed selecting
24.x before this release, so confirm that the new build reports Node 22.

## Why this is needed

Vancouver, Edmonton, and Inuvik changed their clock rules in 2026. With the
old runtime, a November 9am booking is stored one hour late and imported
recurrences also shift incorrectly. A timezone dropdown alone cannot fix it.

PawMatch stores booking instants in UTC and trainers' IANA zone names.
Scheduling, booking/email formatting, and all-day calendar anchoring use
Node's native `Intl`. Installed `node-ical` 0.26.1 uses `temporal-polyfill`
0.3.2 and `rrule-temporal` 1.6.0, which also rely on native `Intl` rules.
Updating their shared data keeps them consistent, including historical rules.
No manual Canadian DST exceptions or fixed-offset substitutes were added.

Viewer-local message and calendar-status timestamps still use the user's
browser timezone data. A server update cannot refresh an older browser.
Booking slot labels and booking/email dates are formatted on the server.

## Hosted verification — preview passed, production pending

**The preview has been verified; production release is pending.** Vercel can start a function without running
the package `start` script, so local wrapper success does not configure it.
The Node-only `instrumentation.ts` startup guard checks the actual loaded
version, offsets, and three synthetic calendar recurrences; it refuses to
serve the app with stale timezone rules.
This is deliberate: a deployment must not silently accept incorrect bookings.

Both build commands also execute the emitted `.next/server/instrumentation.js`
through `scripts/check-built-timezones.mjs`. This catches dependency packaging
errors that compilation and native-module unit tests cannot detect. The
calendar parser remains external to Webpack so Node resolves its CommonJS
Temporal/JSBI dependencies correctly. An isolated Next production build
reproduced the initial hosted `BigInt is not a function` error, then passed
with this correction; stale timezone data still refuses startup.

Local production-build evidence on 2026-09-18: all 27 emitted app traces
contained all four resources, and each traced path resolved to an existing file.
The production server started successfully through the wrapper. This proves
local packaging/startup, not a Vercel function's layout or runtime configuration.

Before an authorized preview/production release:

1. Create a protected preview from this branch. Confirm its build uses
   `pnpm build:vercel` and Node 22. Keep the four `.res` files and
   `provenance.json` in each relevant Node function bundle; `next.config.ts`
   explicitly includes them using `outputFileTracingIncludes`. Inspect the
   emitted trace and deployment bundle to verify their presence. The earlier
   local build evidence above predates the new provenance-file inclusion.
2. Request a dynamic page on the preview and inspect its **function logs**
   for `[TIMEZONE_STARTUP]`. A build log is insufficient. The server reports
   its actual working directory, candidate resource directory, each file's
   SHA-256 match, loaded Node/ICU/IANA versions, and clock/calendar check
   results before refusing stale rules. The first request may therefore fail
   while still providing the required packaging evidence. These checks use
   synthetic data and do not create bookings or contact external services.
3. Require `bundledResources.verified: true`, with four readable matching
   files. Use the reported `bundledResources.directory` as the **actual
   absolute runtime directory** when setting `ICU_TIMEZONE_FILES_DIR` in the
   Preview startup environment. Then redeploy. Do not copy a build-machine
   path, assume `/var/task`, or use shell expressions such as `$PWD`; dashboard
   values are not shell-expanded. The first verified preview path is recorded below.
4. On the fresh preview, request a dynamic page again and require a function
   report with Node 22, IANA 2026d or newer, `ready: true`, passing clock and
   calendar checks, and verified bundled resources. Confirm the configured
   directory matches the verified runtime directory. Exercise a Canadian
   booking and UK DST/import case within the agreed test scope.
5. After preview verification, configure the Production scope and verify its
   own function report before completing the release. Do not assume Preview
   and Production settings or paths match. Do not put the variable in
   Next-loaded `.env.local`, Next configuration, or instrumentation: ICU
   initializes earlier, and application code cannot repair a loaded process.

Actual hosted evidence on 2026-09-18: Preview deployment
`CZVm4R8YqBBRKvn9WaoaXwNrzoR7` from `c563b13` reported Node 22.23.2,
ICU 78.2, IANA 2026d, `ready: true`, all 11 clock checks and all three calendar
recurrences passing, and all four resource hashes matching. Its function logs
at 21:55:48 UTC confirmed both the configured and bundled directory as
`/var/task/data/timezones/2026d/le`. Public login rendered with HTTP 200.
`ICU_TIMEZONE_FILES_DIR` is saved with that value for Preview and Production
(not Development). Production has not yet been deployed with it; verify its
own function report before declaring the release complete. The synthetic
runtime checks created no accounts, bookings, or emails.

The startup log deliberately contains only these runtime facts and synthetic
failures. It is not exposed by a public endpoint and does not print arbitrary
environment variables. `ready` describes the actual clock/calendar rules;
release verification separately requires matching bundle hashes. A future
supported Node runtime with current built-in data may make the override
unnecessary, but prove that using the same checks before simplifying setup.

If the hosting environment cannot provide a stable file location and this
startup variable, use a supported runtime with current built-in data or
reconsider deployment packaging. Do not disable the guard as a workaround.
Hosting environment changes and deployment remain separate authorized actions.

## Verification and updates

The bundled-data startup path and 62 scheduling/display/import/startup tests
passed locally on Node 22.23.2. The generated data also matched independently
compiled IANA offsets for all 418 `zone.tab` zones at 13 instants across
1970–2030 (5,434 comparisons). These checks are not an exhaustive proof of
every historical transition or a claim about an untested hosted runtime.

To repeat focused tests in different server zones:

```sh
PAWMATCH_TEST_TZ=UTC pnpm test lib/trainer/international-timezones.test.ts lib/trainer/timezone-startup.test.ts lib/trainer/schedule.test.ts lib/feed/import.test.ts --environment node
PAWMATCH_TEST_TZ=America/Chicago pnpm test lib/trainer/international-timezones.test.ts lib/trainer/timezone-startup.test.ts lib/trainer/schedule.test.ts lib/feed/import.test.ts --environment node
```

The default test setting remains `America/Anchorage` to catch plain-date
regressions. Normal CI commands use the same bundled-data wrapper; no CI
dashboard variable is needed. Run the complete application checks after any
data update. Stop a task-owned dev server before building the same checkout.

Source commits, licenses, file hashes, generation commands, and update
instructions are retained in [the bundle README](../data/timezones/2026d/README.md)
and `data/timezones/2026d/provenance.json`. Sources came from official GitHub
repositories through the GitHub connector; command-runner DNS restrictions
were not bypassed. The committed resource text allows offline recompilation
with compatible ICU tools. Prefer official precompiled update resources when
available; future changes should be a deliberate data refresh with tests.

Official references:

- [IANA 2026d](https://www.iana.org/time-zones/releases/2026d)
- [ICU timezone updates](https://unicode-org.github.io/icu/userguide/datetime/timezone/#icu4c-tz-update-with-drop-in-res-files-icu-54-and-newer)
- [Unicode source generator](https://github.com/unicode-org/icu-data/tree/main/tzdata)
- [Next file tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Vercel build command](https://vercel.com/docs/project-configuration/vercel-json#buildcommand)
- [Vercel function file paths](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions)
- [Vercel Node version selection](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
