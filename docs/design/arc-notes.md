# Design arc — working notes

## CURRENT POSITION (updated 2026-07-29, end of day)

HOLDING AT THE PHASE-3 VERDICT GATE. Shane re-walks the full page in the
morning; nothing builds until his verdict.

- Branch: design/homepage, clean at a815b58 (phases 1-3 all committed).
- Walkthrough server: PRODUCTION build on http://localhost:3000 (dev
  server deliberately killed; a dev-server + rebuild collision served
  unstyled HTML once. Do NOT run pnpm build while any server is serving
  from .next). Supabase local is up (docker).
- Awaiting from Shane: phase-3 verdict, felt-motion notes, then phase 4
  (motion polish, responsive nits, Lighthouse re-check, arc cleanup
  list including the two /design review routes).
- Also queued: Shane's real Malinois field shots (shoot spec in
  image-manifest.md; hero slot is now cast pet-forward per the
  re-weight, so the field shots map to the community sport slots and
  any hero candidate must match the warmth + attention casting).
- Known app-side nit (out of scope this phase): /account "Your
  calendar" connected-state Replace row overflows at 390px viewports;
  fits at 414px.

## Cleanup list (delete before the arc closes)

- [ ] `app/design/identity/page.tsx` — identity gate sample (noindex'd; no
      sitemap file exists in the app, so page-level robots metadata is the
      whole exclusion story)
- [ ] `app/design/identity/variants/page.tsx` — promise-line + accent
      variants (noindex'd)
- [ ] This file, once the arc ships

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
