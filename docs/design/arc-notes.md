# Design arc — working notes

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
- Promise line and accent color: pending Shane's pick from the variants
  page (`/design/identity/variants`).
- Field orange (#f14e07) is OUT as the accent unless the control wins the
  side-by-side.

## Standing constraints (phase 2+)

- GSAP code-split to the homepage route only; booking funnel untouched.
- prefers-reduced-motion honored; Emil's review-animations bar arbitrates.
- Hero scrim guarantees AA at the worst point of ANY slotted image (math
  documented in components/marketing/hero.tsx); re-verify if scrim stops
  or text position change.
- Truthful-copy contract carries into all new copy and imagery (real UI
  screenshots only, no mockups).
- Section 7 (social proof) scaffolded but hidden until real proof exists.
