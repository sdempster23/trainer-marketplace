# Canada and United Kingdom support

Date: 2026-09-18. Baseline: `79c8461` (Barn Hunt, PR #62).

Status: implemented in the isolated `codex/canada-uk-support` working copy;
local database checks, full build, public browser flows, and both authenticated
CA/GB listing/booking regressions passed. Hosted runtime verification remains open.
Shane requested implementation after the approximate postal-area proposal.
This supersedes the preparation-only version of this document and the parked
international-support entry dated 2026-09-08. No hosted changes are authorized
or performed by this implementation request.

## Experience

Trainers choose United States, Canada, or United Kingdom when creating or
editing their listing. Location labels and examples adapt to ZIP, Canadian
postal code, or UK postcode. Canadian distances display kilometres; US and UK
distances display miles. Existing meter storage and radius choices are kept.

Owners browse freely and choose a country in search. No country or postcode
requirement is added to owner signup. Existing account requirements for
messaging and booking stay intact. The onboarding checklist and dual-capacity
accounts remain outside this change.

The selected country filters both browse and proximity results, before the
proximity query's 50-result limit. Old search URLs without a country use the US.
Search, filter removal, widening distance, and reset links retain the appropriate
canonical country/location state. Failed reads still render an error, not an
assertion that no trainers or services exist.

## Approximate location

The offline resolver uses the existing `zipcodes` dependency for US ZIPs and
Canadian three-character FSAs, plus a bundled GeoNames snapshot for UK outward
codes. There is no new API account, paid service, runtime network request, or
provider credential. Full input is validated before shortening; invalid suffixes
are rejected. Unknown areas return a useful error rather than guessed coordinates.

Only a normalized coarse postal area and its approximate point are stored for
Canada and the UK. Public search URLs and analytics use that coarse area.
The UI explains that rural distances can be less precise. UK coverage includes
England, Scotland, Wales, and Northern Ireland; Crown Dependencies are excluded.
The UK file has 2,978 outward codes including 81 `BT` codes, from a dated 2024
snapshot. It is not a promise of exhaustive current postal-code coverage.
Unsupported `W1M` was excluded without weakening the input parser.

GeoNames CC BY 4.0 license, exact source commit, hashes, transformation, and
update procedure live in `lib/location/data/README.md`. Visible attribution is
in the shared footer. A rural Canadian example and all bundled UK code shapes
and coordinates are covered by local tests.

Existing trainers default to US; existing geo points remain unchanged and
unknown postal areas stay null. A blank postal field during editing preserves
the saved location. Changing country requires a resolvable new area and writes
country, area, and point in the same row update. Switching countries and back
preserves the trainer's selected timezone for each country.

## Prices and bookings

Services and bookings store currency (`USD`, `CAD`, `GBP`) beside integer
minor-unit amounts. Existing records default to USD without changing amounts.
New services derive currency from the saved trainer country on the server:
US → USD, CA → CAD, GB → GBP. The database enforces that mapping at creation.
Price entry keeps exact decimal parsing and existing limits.

A service's currency is immutable. Moving country leaves old services in their
original currency; trainers create newly priced services to use a new currency.
The form explains this, and stale forms cannot accidentally create a service in
a different currency than the displayed one. Mixed service currencies after a
move are allowed and explicitly labeled.

Booking creation snapshots price, duration, and currency from the selected
service. The database validates fidelity and preserves snapshot immutability
through later repricing, retirement, country moves, and booking transitions.
All price displays and booking emails use the stored currency. This adds no
currency conversion, platform payments, commissions, or payouts; owners still
pay trainers directly.

## Scheduling

Canadian IANA zones include Newfoundland, Saskatchewan, Yukon, and regional
exceptions; the UK uses `Europe/London`. Postal lookup does not silently select
a time zone. Existing availability remains expressed in the trainer's zone.

Pinned Node 22.23.2 contains stale IANA 2026a rules for the Canadian changes
tested here. Official IANA 2026d data is bundled as compatible ICU resources.
Normal dev/build/test/start commands load it before Node starts. A Node startup
guard refuses stale rules. Scheduling, booking/email labels, and imported
calendar recurrences all use the same native rules; no hand-coded DST patches
or dependency upgrades were introduced.

Licenses, source verification, hashes, and regeneration are recorded in
`data/timezones/2026d/README.md`; runtime instructions are in
`docs/timezone-data.md`. Local checks cover historical/current Canadian offsets,
Newfoundland's half-hour offset, UK clock gaps/repeats, US regression cases,
all-day boundaries, recurring imports, and multiple server time zones.

Hosting does not necessarily execute `pnpm start`. Before an authorized
release, the actual hosted Node function must load the bundled files via an
absolute `ICU_TIMEZONE_FILES_DIR` set before startup, or prove equivalent current
built-in rules. Package tracing, runtime path, and function behavior must be
verified on that deployment; local success is not hosted proof.

## Database and release boundaries

M22 is additive: new country/postal columns, currency enum/columns, service and
booking integrity guards, and `nearby_trainers_v2`. The old RPC remains available
for rollout compatibility. No table grants, RLS policies, live data cleanup,
or existing migration files change.

Rollback-only SQL checks cover legacy backfill preservation, country filtering
before LIMIT, distance ordering, privileges, snapshot mismatches, immutability,
and country moves. M14 remains the service-role grant source of truth. Forbidden
EXECUTE checks use catalog assertions because the local Postgres image has a
documented crash on deliberately forbidden function calls.

`scripts/verify-international-db.sh` checks local database/email configuration,
refuses unrelated pending migrations, rehearses the backfill with rollback,
applies only M22 through the local Supabase migration ledger, runs M22/M14, and
regenerates schema types. It never resets the database or targets hosted data.
Shane ran the guarded runner successfully in Terminal: backfill rehearsal,
local application, M22/M14 checks, and schema type generation all passed. The
generated artifact was inspected and passed the application typecheck.

The isolated working copy is inside the original checkout's ignored
`docs/scratch/canada-uk-implementation` directory because the original Git
metadata is read-only. No original application files were overwritten.
See `docs/canada-uk-status.md` for verification evidence and remaining steps.
