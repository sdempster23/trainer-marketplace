# International listing browser regression

Verified on 2026-09-18 against the local production preview: both Chromium
workflows passed (CA 18.1s, GB 16.7s; 40.5s total), including cleanup. Shane ran
the command from Terminal because the agent session could not access Docker.
The local Playwright last-run artifact records passed with no failed tests.

Run from the implementation checkout with Node 22 and the existing dependencies.
Docker Desktop and local Supabase must already be running, with M22 applied.
Use the local production preview built from this checkout; do not rebuild while
that server is running. This spec does not start/stop Docker or reset the database.

Confirm the running preview uses local Supabase (`http://127.0.0.1:54321`) and
email log mode (no Resend key, or the existing `<...>` placeholder). The test
checks this checkout's environment files and shell overrides, but cannot inspect
the environment of an already-running server. `PAWMATCH_E2E_LOCAL_ONLY=1` confirms
that you checked the running server too. Do not set it for a hosted environment.

With the production preview already running on port **3001**, run:

```sh
PAWMATCH_E2E_LOCAL_ONLY=1 PAWMATCH_E2E_APP_MODE=production \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 \
  pnpm test:e2e tests/e2e/international-listings.spec.ts --workers=1 --repeat-each=1 --retries=0
```

The preview must be running first: the shared Playwright configuration's fallback
starts a development server on its default port. For an explicitly prepared
development server, use its loopback address and `PAWMATCH_E2E_APP_MODE=development`.
If Chromium is missing, install the existing pinned Playwright browser with
`pnpm exec playwright install chromium`, then rerun the command above.

The two tests create confirmed `test.local` trainer/owner accounts through the
local database; they do not submit signup terms or send confirmation email. They
exercise Canada (M5V) and Northern Ireland (BT1) onboarding, invalid postal input,
CAD/GBP service creation, unrestricted anonymous browsing and proximity search,
short postal URLs, login gates, booking requests, and immutable booking prices
after trainer repricing. The only available slot is 9am two calendar days ahead
in each trainer's timezone; scheduling is never based on the machine's timezone.

Before any fixture write, the spec requires loopback app/database URLs, log-only
mail, a local Docker Unix socket, the expected database container/port, and M22.
It uses dedicated `ca220001-*` / `ca220002-*` IDs and refuses conflicting identities
or bookings/conversations with unrelated accounts. Cleanup removes its accounts
and associated rows in `afterAll`, including on test failure. A forced process
kill can leave fixtures; rerunning this same guarded spec cleans them first.
Anonymous search analytics remain in the **local** database because they have no
fixture account identifier; cleanup deliberately does not guess which anonymous
rows belong to this test.

Inspect the terminal result and `playwright-report/index.html`; traces are
available on retried runs under the existing Playwright configuration. Passing
typecheck alone is not a browser pass. This spec does not verify real email
delivery, signup/terms, external calendar imports, or hosted deployments.
