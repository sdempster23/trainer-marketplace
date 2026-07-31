# Design arc — working notes

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
- Dark act transition approved as built (CSS gradient band).
- /account Replace-row overflow at 390px FIXED in phase 4
  (external-calendar-manager.tsx: form wraps, input full-width below sm).

## Locked at the identity gate (2026-07-29)

- Direction approved at A-: type locked (Archivo display / Inter body /
  Geist Mono data), layout locked, minimalist-ui pack confirmed.
- Context sentence locked verbatim: "Search professional trainers by
  location, specialty, and price — for every dog, from family pets to
  working K9s."
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
