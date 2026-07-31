# Homepage image manifest and shoot spec

Every photographic slot on the marketing homepage maps to one file in
`public/marketing/`. Components render through `lib/marketing/image-manifest.ts`,
never with hardcoded paths.

**To swap in a real field shot:** replace the file in `public/marketing/`
keeping the exact filename, then update that slot's `status` to `"final"` and
its `source` in `lib/marketing/image-manifest.ts`. Nothing else changes.
Dimensions do not need to match the interim file exactly (the build reads real
dimensions), but respect the orientation and minimum size below or the layout
will crop more aggressively than intended.

All interim images are Unsplash-licensed (free commercial use, no attribution
required, no Unsplash+ premium images used). Licensing per slot is recorded in
the manifest module.

## Slots and shot specs

### 1. `hero-field.jpg` — the opening scene (highest priority swap)

> **Re-cast 2026-07-29 (strategic re-weight):** the hero leads
> pet-owner-first. Warmth + competence in one frame. NOT bite work, NOT
> prong-forward or tactical imagery; sport lives in the community strip.

- **Where:** full-viewport hero, image fills the screen behind the headline.
- **Format:** landscape, 3:2, minimum 2800px wide (shoot wider, we crop).
- **Cast as:** a handler-and-pet-dog training moment. Think heeling golden
  with eye contact, a focused sit at the owner's side, attention work.
  Engaged and working, NOT posed, NOT stock-smiling at camera.
- **Composition:** dog sharp, background soft. Leave breathable negative
  space (sky, field, or defocused ground) on at least one side or the lower
  third: the headline and CTAs sit over the quiet part of the frame. Avoid
  busy backgrounds behind where text will sit.
- **Light:** golden hour or soft overcast; warm beats dramatic.
- **Interim:** Beth Macdonald, lab in a focused sit looking up at its owner
  in an open field (very close to the target).

### 2. `transformation.jpg` — "the right trainer, found"
- **Where:** section 1, large image beside/behind a short claim.
- **Format:** landscape, 3:2 or 4:3, minimum 1800px wide.
- **Cast as:** the relationship. Dog in a focused sit or heel, eye contact
  with the handler. Calm intensity, not action.
- **Interim:** John Tuesday, shepherd in attentive sit facing handler.

### 3. `community-sport-bite.jpg` — sport/protection
- **Where:** community strip (three-up with slots 4 and 5).
- **Format:** landscape, minimum 1600px wide.
- **Cast as:** bite work or rag work with a decoy, mid-action. Real training,
  real equipment.
- **Interim:** Anna Dudkova, rag work with decoy.

### 4. `community-sport-jump.jpg` — sport/trial
- **Where:** community strip.
- **Format:** landscape, minimum 1600px wide.
- **Cast as:** trial-style work: hurdle, retrieve, send-out. Motion welcome.
- **Interim:** Anna Dudkova, shepherd over hurdle.

### 5. `community-pet.jpg` — the everyday owner
- **Where:** community strip.
- **Format:** landscape, minimum 1600px wide.
- **Cast as:** an owner and pet dog in a genuine training moment: luring a
  sit, rewarding a recall, eye-level engagement. Warm but working, not a
  stock cuddle.
- **Interim:** Pinto Art, owner kneeling with dog at golden hour.

### 6. `closing-dusk.jpg` — founding-trainer closing (dark scene)
- **Where:** section 8 finale. The page has transitioned to its dark scene;
  this image carries it.
- **Format:** landscape, 3:2, minimum 2400px wide.
- **Cast as:** end of the training day. Handler and dog at dusk, low light or
  silhouette. Quiet, earned-rest mood. Text sits over the darkest region.
- **Interim:** David Rangel, handler and dog silhouette at dusk.

## Sections with NO photo slots (for completeness)

- Sections 2 and 4 (product angles, device frames) use REAL UI screenshots
  captured from the running app. The truthful-imagery rule applies: actual
  screens, no mockups. Captured during build phases, tracked separately.
- Section 5 (animated numbers), 6 (comparison): typographic, no photography.
- Section 7 (social proof): scaffolded but hidden until real proof exists.
