# Design arc — working notes

## Friend-feedback pass (2026-07-31, PR #40) — accepts and DECLINES

Accepted: (1) mobile phone-pan sizing (frames height-budgeted to 240px
so frame + caption fit one viewport per slide at 390/430; desktop
untouched); (2) comparison prominence (paired rows, old way faded,
PawMatch full-contrast with an amber rule — the accent's one sanctioned
non-CTA use; pairs stay coupled when mobile stacks them); (3) a single
"For trainers" header link, smooth-scrolling to the dark act
(reduced-motion gated).

DECLINED, with reasoning that must survive:
- SECTION TABS: declined. The page is a narrative, not docs; tabs would
  let readers skip the audience turn, which is the page's hinge. The
  single "For trainers" link is the sanctioned shortcut.
- RED/GREEN COMPARISON COLORING: declined. SaaS-matrix language, and a
  colorblind failure. Prominence comes from contrast + the amber rule.
- COLOR-CODED SPECIALTY CHIPS: declined. Breaks the monochrome + amber
  system; chips are metadata and quiet by design.
- OPEN-ENDED PALETTE EXPERIMENTATION: declined. The palette was decided
  through the variants process at the identity gate; imagery warmth is
  the real lever and arrives with Shane's field photos.

## CURRENT POSITION (updated 2026-07-30)

PHASE 4 COMPLETE. PR #37 open with the full arc; HOLDING FOR SHANE'S
MERGE CALL. Production build serves http://localhost:3000 for final
review. (Do NOT run pnpm build while any server serves from .next.)

- Story after the phase-3 verdict: hero -> transformation -> phone pan
  -> features -> desktop device -> dark act (comparison -> finale).
- Fonts: main Archivo is weight-only + display:optional (the H1 is the
  LCP element; optional makes it paint exactly once. Tradeoff: slowest
  cold visits render the metric-matched fallback headline. Revert
  lever: remove display:'optional' in app/layout.tsx). The width axis
  lives in a separate non-preloaded instance used only by the wordmark.
- LCP measurement note: Lighthouse's default simulated method swings
  1.9s on this machine for the SAME page weight (2.0s vs 3.7s across a
  day). Under --throttling-method=devtools (real applied throttling):
  LCP 1.6-1.9s, perf 98-99, meeting the <=2.5s bar. Judge future perf
  work on devtools-throttled or field numbers, not single lantern runs.
- Queued beyond the arc: Shane's Malinois field shots (map to community
  sport slots; hero stays pet-forward per the re-weight).

## Cleanup list

- [x] `app/design/identity/page.tsx` — DELETED in phase 4 (preserved in
      git history)
- [x] `app/design/identity/variants/page.tsx` — DELETED in phase 4
- [ ] This file, once the arc ships

## THE TWO-ACT CONSTITUTION (2026-07-30 — structural law for this page)

Adopted after the first real-user review flagged audience confusion
(owner content and trainer content interleaved). This is now the page's
constitution; do not restructure without a new ruling:

- ACT 1 (LIGHT) = the OWNER journey: transformation, product pan, owner
  features (search, message-first), the live search demo, the
  comparison (owner-facing pains).
- THE LIGHT-TO-DARK TRANSITION IS THE AUDIENCE TURN. The dark act opens
  with the explicit "For trainers." beat.
- DARK ACT = the TRAINER's half: trainer features (calendar runs the
  show; no new accounts / no new logins), flowing into the finale
  ("Your next client is already searching." -> Join as a trainer).
- Never mix audiences across acts. New owner content goes in act 1; new
  trainer content goes in the dark act.
- Feature claims carry REAL-UI proof crops (element screenshots, same
  provenance rules as the device screens). The devices section is a
  REAL recorded search loop (VP8 WebM, poster-only under
  reduced-motion/no-JS/no-WebM; re-record per lib/marketing/ui-shots.ts
  notes). No H.264 encoder is available headlessly on this machine;
  ship WebM unless system ffmpeg gets installed.

## Headline voice rule (2026-07-30 — part of the page constitution)

NO TERMINAL PUNCTUATION on ANY display headline, page-wide and uniform.
- Applies to: the hero H1, every section head, the "For trainers" beat,
  the comparison head, the finale.
- Two-sentence headlines keep the INTERNAL period, drop only the
  terminal one ("Message first. Book when it fits" / "No new accounts.
  No new logins").
- Scope: display headlines ONLY. Body copy, subheads, and captions keep
  normal sentence punctuation.
- The "For trainers" beat carries no subhead: the dark turn and the two
  words do the work alone.
- EXTEND at the interior-polish pass (arc phase 2): app section heads
  and email subjects/headings adopt the same rule so the brand stays
  one voice.
- Any check or test asserting exact headline strings must not expect
  terminal periods.

## Phase-3 verdict rulings (2026-07-30 — content law for this page)

- Section 5 (animated numbers) CUT entirely: format fine, content not a
  buying reason. No replacement; the story tightens to features ->
  devices -> comparison -> finale. Do not resurrect a stats section
  without a new ruling.
- NO PRICING CLAIMS anywhere on the page pending the founding-offer
  decision. The word "founding" appears nowhere on the rendered page.
  "Free for founding trainers" survives as OFF-SITE marketing language
  only. Finale locked: H2 "Your next client is already searching." /
  pitch "We send you clients that fit into the tools you already use." /
  CTA "Join as a trainer" (verbatim match with the hero CTA).
  [H2 SUPERSEDED 2026-09-06 — now "Listed by discipline, not just by
  zip code"; see "Tier-1 copy corrections" at the end of this file.
  Pitch and CTA unchanged.]
- Dark act transition approved as built (CSS gradient band).
- /account Replace-row overflow at 390px FIXED in phase 4
  (external-calendar-manager.tsx: form wraps, input full-width below sm).

## Locked at the identity gate (2026-07-29)

- Direction approved at A-: type locked (Archivo display / Inter body /
  Geist Mono data), layout locked, minimalist-ui pack confirmed.
- Context sentence locked verbatim: "Search professional trainers by
  location, specialty, and price — for every dog, from family pets to
  working K9s."
  [SUPERSEDED 2026-09-06 — "and price" cut; the ruled wording is now
  "Search professional trainers by location and specialty — for every
  dog, from family pets to working K9s." See "Tier-1 copy corrections"
  at the end of this file.]
  Note: the locked wording contains an em-dash, which the design skill
  bans as an AI tell. Shane's wording overrides the skill; do not "fix" it.
- Promise line locked: "Find the trainer your dog needs." (variant b).
- Accent locked: amber-gold #f5a623, black label (10.4:1 AAA); #ffb224 in
  dark mode. Field orange #f14e07 is RETIRED everywhere.

## Strategic re-weight (locked 2026-07-29 — do not re-tilt)

PawMatch's volume market is everyday pet owners; the sport/working-K9
community is the differentiating niche, NOT the lead voice. This is a
standing directive for all copy and image casting:

- Tone: warm competence. Professional, welcoming, never tactical.
- Sections speak pet-owner-first; the sport niche is present and proud but
  secondary. The community strip carries the sport identity (its two sport
  slots stay).
- Hero casting is a handler-and-pet-dog training moment (warmth +
  competence in one frame). No bite work, no prong-forward imagery in the
  hero or section leads.
- Any future session that drafts homepage copy or casts imagery must
  follow this weighting. Do not lead with PSA/Schutzhund/PPD vocabulary;
  it appears in specialty lists and the community strip, not headlines.

## Phase 2 state (2026-07-29)

- Homepage rebuilt: hero (scroll-linked zoom + promise parallax handoff),
  section 1 (transformation, asymmetric split), section 2 (product angles:
  pinned horizontal pan through four REAL app screenshots in graphite
  device frames; native scroll-snap strip on mobile and reduced-motion).
- GSAP + @gsap/react installed, used ONLY by components under
  components/marketing/ imported by app/page.tsx (route-split: homepage
  160kB first load, booking funnel unchanged at baseline).
- UI screenshots provenance in lib/marketing/ui-shots.ts (captured from
  the running app; the message thread was created by driving the real
  messaging flow; Sofia's services added via the real services form).
- Lighthouse (prod build): BEFORE (main, text-only page) mobile 99 /
  desktop 100, a11y 98. AFTER mobile 92 / desktop 99, a11y 100, CLS 0.
  Mobile LCP 3.4s throttled: acceptable-green; candidate for phase-4
  polish.
- LCP GUARD (do not regress): the hero H1 is the LCP element. GSAP must
  NOT touch .hero-promise / .hero-media at hydration; HeroScene creates
  its tweens on first scroll intent (see comment there). Animating the
  LCP element at load costs ~2s of mobile LCP.

## Phase-2 walkthrough corrections (2026-07-29)

- REPORT-VS-BUILT RECONCILIATION: the phase-2 report described the hero
  interim as "lab in a focused sit, eyes up at owner". What actually
  rendered (manifest entry heroField, Beth Macdonald RW68ZD7nQyg) was a
  walking-away landscape where the dark dog disappeared into the dark
  grass under the headline. The description came from reading a 640px
  preview too generously and was not re-checked against the full-bleed
  render. Lesson recorded: judge hero casting on the composed full-frame
  render, not the preview thumbnail.
- Hero re-cast (Richard Brutyo xvYxGcwFvuE, mirrored): dog unmistakably
  co-subject, warmth + attention at hero scale. Shoot spec unchanged (it
  already demanded this; the interim now matches it).
- Calendar-bridge device slide re-shot: marketing shows OUTCOMES (calendar
  connected, payment set), never settings plumbing (ICS paste
  instructions, feed-URL generation). Standing rule for all product
  imagery: promise level, not instruction level.
- Locked benefit framing for calendar + payment features (Shane's, use
  as lead language): NO new accounts, NO new logins. No Stripe account to
  create, no separate payment app; clients pay you the way they already
  do, and PawMatch syncs with the business calendar and kennel software
  you already run. Booked sessions appear there; busy times block new
  requests. (Claimable: M15/M16 calendar bridge + off-platform payment.)

## Phase 3 state (2026-07-29)

- Full scroll story shipped: hero / transformation / product-angles pan /
  features one-at-a-time (typographic rows) / desktop device / DARK ACT
  (truthful numbers with count-up, old-way comparison ledger,
  founding-trainer finale on the dusk photo) / footer.
- The light-to-dark transition is a pure-CSS 45vh gradient band at the
  dark act's top (the one composed theme switch per page): survives
  no-JS and reduced motion, zero jank.
- Numbers are the only "stats" and each is a shipped fact: 15-min sync
  (gate ruling 3, matches trainer-facing app copy), 0 double-books by
  design, $0 platform fees. NEVER add volume/user stats until real.
- Section 7 scaffold: components/marketing/social-proof.tsx returns null
  with mounting instructions; do not fill with placeholder quotes.
- Lighthouse (prod): mobile 98 / desktop 100, a11y 100 both, CLS 0.
  Mobile LCP 2.0s (under the 2.5s target; the re-cast hero image is
  lighter than the old one, which is most of the phase-2 -> 3 gain).

## Standing constraints (phase 2+)

- GSAP code-split to the homepage route only; booking funnel untouched.
- prefers-reduced-motion honored; Emil's review-animations bar arbitrates.
- Hero scrim guarantees AA at the worst point of ANY slotted image (math
  documented in components/marketing/hero.tsx); re-verify if scrim stops
  or text position change.
- Truthful-copy contract carries into all new copy and imagery (real UI
  screenshots only, no mockups).
- Section 7 (social proof) scaffolded but hidden until real proof exists.

## Two headers, one brand voice (2026-08-14 — standing law)

The marketing homepage keeps its own overlay nav PERMANENTLY. The
hero's nav is part of the composed scene — scrim math, LCP care, the
audience-turn law — and the app shell's auth-aware header (added at
the interior-polish arc) must never be unified with it: unification
would either hoist auth queries into the LCP-critical route or make
the shell theme-aware mid-scroll. Brand continuity comes from the
shared wordmark recipe (the wide-subset Archivo instance), not from a
shared component. Do not unify.

## Tier-1 copy corrections (2026-09-06 — two locks deliberately re-ruled)

Trigger: an external audit read the homepage as promising owners can
filter trainers BY PRICE. Checked against the shipped code
(docs/scratch/tier1-copy-inventory.md): the directory parser accepts
only zip, radius, and specialty; `nearby_trainers` returns no price
column; `trainers` has no starting-price field. The claim was FALSE
and was not close to true. Two of the five carrying strings were locked
constants, so this is recorded as a RE-RULING, not a copy tweak. The
new wording below is now the ruled wording; a later session must not
restore the old lines as a lock violation.

- Price-filter claim REMOVED in all five places, price element only,
  location/distance and specialty left intact, sentences otherwise
  unchanged: app/page.tsx metadata description; the hero's
  LOCKED_CONTEXT_SENTENCE — the bare cut ("by location, specialty —")
  left a comma against the dash, so the conjunction was restored:
  "Search professional trainers by location and specialty — for every
  dog, from family pets to working K9s." That is the ruled line; the
  em-dash note above still applies); features.tsx owner feature #1 body
  ("Specialty and distance
  up front."); comparison.tsx row 1 ("Search by specialty and
  distance"); ui-shots.ts directory caption ("searchable by location
  and specialty").
- LEFT ALONE, deliberately: "services with real prices" (comparison.tsx
  row 2, ui-shots.ts profile caption). True at the profile level — the
  detail page lists every service with its price.
- ROOT CAUSE fixed: app/page.tsx's truthful-copy contract listed
  "price" under CLAIMABLE. It now lists price search/filtering under
  NOT CLAIMABLE until a price filter exists, with the reason. Left
  as it was, that comment would re-license the claim the next time
  homepage copy is written.
- Headline swaps (single occurrences, no terminal periods per the
  headline voice rule):
  - features.tsx trainer feature #2: "No new accounts. No new logins"
    -> "Your payment tools stay yours".
  - finale.tsx H2 (LOCKED at the phase-3 verdict): "Your next client is
    already searching" -> "Listed by discipline, not just by zip code".
    Reason: the old line asserted owner demand that does not exist —
    two listed trainers, no owner-side marketing yet. Pitch and CTA
    unchanged.
- The identity-gate and phase-3 entries above carry SUPERSEDED
  annotations pointing here, so the old locks cannot be read in
  isolation.

## Directory filters: the URL is the only source of truth (2026-09-08 — ruled)

Audit finding: "Clear all" / chip remove left the boxes checked and
Search re-applied them; "Search within 50 miles" widened results but the
dropdown stayed at 25 and Search reverted. One bug: the filter form's
controls are uncontrolled (default*), seeded from the URL only at mount,
while every affordance is a next/link client-side transition — the URL,
chips, and results moved on, the mounted controls did not, and Search
serialized the stale DOM back (docs/scratch/directory-filter-probe.md;
back/forward confirmed to show the same shape before the fix).

Fix: the page renders DirectoryFilters with key = the canonical search
URL (the same serializer the links and the Search action use). A new
search = a new key = the form is re-created from the URL. Pinned by
tests/e2e/directory-filters.spec.ts (clear all, chip remove, wider
radius, ZIP draft, back/forward; each asserts a window marker survives
so the suite provably exercises client-side transitions).

RULED, so a later session does not "fix" it back:
- **An unsearched draft is discarded on any commit.** Typed-but-not-
  searched ZIP, toggled-but-not-searched boxes, and the open Specialties
  disclosure are all dropped when a chip, Clear all, Clear specialties,
  Search within N miles, or back/forward changes the active search.
  Reason: those affordances commit URL state; preserving a draft across
  them would require the link hrefs to read the DOM — the exact
  two-sources coupling this fix removes. The directory stays a
  zero-client-JS Server Component; chips stay shareable GET links;
  Search stays the only POST (and the only `search` event emitter).
  If draft preservation is ever wanted, it is a separate product ruling
  (chips-as-submits or client state), not a tweak to this one.
- **The Specialties disclosure closes on every search change.** It
  already closed on Search (the action's redirect re-creates the form);
  it now also closes on chip / clear / widen. One consistent rule
  replaces two accidental ones. Keeping it open would need its state
  outside the keyed subtree — a follow-up, not part of this fix.

## PARKED — non-US (Canadian) trainers (2026-09-08, scoped, not built)

Trigger: a trainer who signed up 2026-08-25 could not complete
onboarding because she is in Canada. Scoped in
docs/scratch/geo-constraint-probe.md (local); this entry is the
durable summary.

What BLOCKS a non-US trainer today — all app layer:
- The ZIP field's browser hints (`inputMode="numeric"`,
  `pattern="\d{5}"`, `maxLength={5}`) on the listing form AND the
  directory search form — a postal code cannot be typed, let alone
  submitted.
- The `/^\d{5}$/` regex in both zod schemas (onboarding, edit listing)
  and the same `\d{5}` guard in front of the directory lookup (page and
  search action).
- `TRAINER_TIMEZONES`: a seven-zone US enum (zod + dropdown). No
  Canadian zone; Newfoundland (UTC-3:30) and Saskatchewan (no DST) have
  no equivalent at all, and timezone drives booking times.
- ZIP-worded copy (labels, placeholders, error strings, the directory
  result line, the privacy page's "a ZIP search").

What does NOT block — and must not be touched to "fix" this:
- `trainers.service_point` is PostGIS `geography(point, 4326)`;
  `timezone` is free-text IANA. No ZIP/country column exists; the DB
  would take a Toronto point today with no migration.
- `nearby_trainers` takes lat/lng/miles and returns geodesic meters. It
  knows nothing about ZIPs.
- The `zipcodes` package (bundled flat file, no network, no key)
  ALREADY resolves Canadian postal codes offline at forward-sortation-
  area level: `lookup()` trims any non-numeric input to its first three
  characters; the data file holds 1,620 FSAs (~complete); verified
  across every province and territory. Caveat: it does not normalize
  lowercase — the caller would uppercase.

The ONE product ruling a build would need: accept FSA-level precision.
Urban FSAs are ZIP-comparable; rural FSAs (second character 0) are
large, so a rural Canadian trainer's "approximate area" is coarser than
a rural US ZIP's. The data has no finer grain, so requiring a full
six-character code buys only the appearance of precision. Rule it
explicitly when building; do not let it be decided by default.

Shape of the build, for sizing only (NOT a plan): postal-code format
acceptance + uppercase normalization at the two schemas and two
directory guards; Canadian zones added to the timezone enum/labels;
copy pass on every ZIP-worded surface; the 5-digit unit test re-pinned.
Nothing in the schema, the RPC, or the dependency moves.

REVISIT TRIGGER: two or more ADDITIONAL non-US trainer signups (i.e.
three total). One is a signal to record, not a market to build for.
Until then the honest state is "US only," and the onboarding copy
should be judged against that if it is ever revisited for other
reasons.

## OPEN DEFECT — the listing edit form cannot prefill the trainer's ZIP (2026-09-08)

`trainers.service_point` stores only the geocoded point; there is no
ZIP (postal code) column. Onboarding geocodes the ZIP with `zipcodes`
and writes `SRID=4326;POINT(lng lat)` — the ZIP itself is discarded. So
the edit listing form renders a blank optional ZIP with "Your service
area is saved — enter a ZIP only to move it," and a partial-onboarding
re-entry likewise cannot show what was entered. Truthful today, but a
trainer cannot see or confirm her own service area from the form.

What a fix would take (recorded, NOT scheduled):
- A migration adding a nullable text column on `trainers` for the
  entered code (name it for what it is once Canada is ruled — "postal
  code", not "zip"), written by both `completeOnboarding` and
  `updateTrainerListing` alongside `service_point` so the two can never
  disagree (write them in the same statement).
- Regenerate `types/supabase.ts`; prefill it on the edit page and the
  partial-onboarding page; drop the "can't prefill" copy.
- Existing rows: no offline reverse geocode exists in the dependency.
  Either leave NULL (form stays blank for pre-existing trainers until
  they re-enter, which the current copy already handles) or backfill by
  nearest ZIP centroid over the bundled table — approximate, and it
  would have to be labelled as such. Two live trainers today; NULL is
  the honest default.
- Privacy: the code is the same "approximate area" already disclosed
  and already derivable from the public point, but it is a new
  anon-readable column under the public-read RLS on `trainers`; the
  M14 matrix is table-level so it auto-covers, and the privacy page's
  "approximate service location" line stays true. Say so in the
  migration header.
- Not needed: any change to `nearby_trainers` (it returns no ZIP) or to
  the directory.

## KNOWN GAP — post-confirmation destination is always /account (2026-09-08, decision pending)

Status: known gap, NOT a bug to fix now. Recorded after PR #55 carried
`?next=` across login ⇄ sign-up and onto the check-email page's "Log in"
link — everything short of the email itself.

The gap. The hosted "Confirm signup" email template builds its link as
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/account`
(docs/manual-steps.md; the local template matches). `next` is a literal
in the template, so every new user lands on /account after confirming,
regardless of where they started. The `emailRedirectTo` the signup
action passes (`siteUrl("/account")`) populates `{{ .RedirectTo }}`,
which the template never reads — it is dead today.

User-visible cost. Someone who found a trainer, clicked "Log in to
message", chose "Sign up", created an account, and confirmed by email
arrives at their account page with no memory of why they came. The
destination survived four hops and died at the fifth. The only place it
still works after signup is the check-email page's "Log in" link (for a
visitor who confirms in another tab and comes back to log in).

Fix shape, if ruled:
1. Hosted template (DASHBOARD change — the dashboard-only Supabase
   config ruling applies; not a migration, not code): read the
   destination from `{{ .RedirectTo }}` instead of the literal, e.g.
   `…&type=email&next={{ .RedirectTo }}`. Recovery template unaffected.
2. Signup action: pass `emailRedirectTo` as the carried destination
   (validated same-origin path, default /account) so `{{ .RedirectTo }}`
   holds it; `resendConfirmation` must pass the same value or the resent
   link regresses to /account (the check-email page already has `next`
   to hand it).
3. /auth/confirm: `{{ .RedirectTo }}` arrives as a full URL, which
   `safeInternalPath` rejects by design (it accepts a leading-slash path
   only). Widen the confirm route to accept a same-origin ABSOLUTE URL by
   parsing it and honoring only its path — the open-redirect posture
   (launch-gate review finding) must not loosen: origin must equal the
   site origin, anything else falls back to /account.
4. GoTrue only honors `emailRedirectTo` values on the project's redirect
   allow list (Authentication → URL Configuration); otherwise it
   silently substitutes the Site URL. A path-carrying value needs a
   wildcard entry for the site origin (`https://joinpawmatch.com/**`) —
   another dashboard step, and the reason this is not a code-only fix.
5. Verify against hosted, not locally: the local template is a file
   under supabase/templates/, the hosted one is dashboard state, and the
   two have drifted before (email arc, 2026-08-13).

Decision pending: whether the cost is worth two dashboard edits plus a
loosening of the confirm route's accepted shape. Revisit when there is
evidence of owners arriving via "Log in to message" and dropping — the
`search` and `conversation` north-star events (M20) are the place to
look. Until then the code comments in the signup action and the
check-email page state the gap so nobody assumes the link works end to
end.
