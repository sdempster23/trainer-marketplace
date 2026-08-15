# Interior Polish — arc plan (the last build before the first trainer)

Durable record. Investigation:
`docs/scratch/interior-polish-investigation-2026-08-14.md` (scratch —
its findings are summarized here where load-bearing). Rulings issued by
Shane 2026-08-14 at the investigation gate; recorded here per the
standing rule (a ruling that only exists in chat doesn't exist).

Premise (Shane's words): the homepage makes a keynote-grade promise;
the interiors inherited only the token layer. NOT a redesign — the
interiors INHERIT the identity per `docs/design/arc-notes.md` as
standing law. Scope: the pages she and her clients actually walk.
Mobile first-class at 390 throughout. Empty states are first-class.

## The twelve rulings (2026-08-14)

1. **Amber map APPROVED** as proposed (investigation §8-1), with:
   trainer-bookings = **one per CARD** (each pending request is its
   own decision context) — amber on Confirm only, NEVER Decline;
   owner-bookings = none at rest, amber on "Find a trainer" in the
   empty state; trainer detail = **ONE STICKY Book button**, not
   per-service.
2. **Interior type scale APPROVED**: h1 `font-display text-3xl→4xl
   tracking-tight`; ONE CardTitle value (kill the third scale). The
   headline law extends here: no terminal punctuation on interior
   H1s/CardTitles.
3. **Geist Mono: LOAD IT**, route-level per the root-layout LCP note.
   If it measurably costs LCP on walked pages, report and fall back to
   `tabular-nums` Inter — but try it first.
4. **Branded not-found + error boundary: IN** (stock Next is reachable
   from in-scope pages; that breaks the illusion). Minimal.
5. **Navigation shell: IN, minimal** — slim app header (wordmark →
   home, Account, Messages) + SiteFooter everywhere. The islands
   problem is the biggest "unfinished" contributor.
6. **Flow problems #1–#5 all IN**: listing edit (launch-blocking —
   onboarding literally promises "You can edit it later"); dog-detour
   return param; booking confirmation moment; pending-request count on
   the hub; zero-slot → Message affordance. The rest defer.
7. **Bug-class list: ALL IN. Correctness before cosmetics.**
8. **Em-dashes: keep as house style** in interior copy.
9. **Cheap IA versions GREEN-LIT**: slot picker = collapsible days +
   "jump to next available"; directory = collapsed filter + chips
   summary.
10. **Marketing re-capture acknowledged**: the homepage device slide +
    `cropThread` crop re-shoot is budgeted into this arc, same
    provenance rules (real captured screens only).

**A (addition, priority-one): the two MISSING empty states are
deliverables** — (a) payment editor gets a "clients can't pay you yet"
state with an affordance; (b) a CONFIRMED booking with no trainer
payment info must NEVER render blank — honest copy + a path (message
the trainer to arrange payment). An owner who owes money and sees
nothing is the worst state in the product.

**B (addition): the EMPTY-STATE OBJECT is the arc's core primitive** —
every zero state visually distinct from every error state (today only
the color token differs). Keep good copy VERBATIM where it exists:
"Say hello — where to meet, what to bring, what you're looking for",
"No bookings yet" + its link, the book-gate trainer copy.

## Sequence (Shane's order, one argued amendment — accepted rationale
recorded at the hold)

0. **BUGS FIRST** (amendment, from ruling 7's own words): the
   correctness list is small and independent, and every later pass
   builds on honest rendering — an empty-state object on top of a
   false "no services" read polishes a lie. Contents: blockCount
   `?? 0` false all-clear; book page discarded read errors ×2; detail
   page services error; listing failed-read treated as not-onboarded;
   "Hours: 12:00 AM – 12:00 AM" on null; raw ISO dates ×2 (exception
   date, dog DOB); the bookings-page indentation artifact. (The
   invisible History chip is deliberately NOT here — superseded by the
   badge primitive in step 1.)
1. **System decisions once** — type scale (ruling 2), amber variant
   map (ruling 1), Geist Mono loading (ruling 3), the empty-state
   object (addition B), badge primitive, field primitives
   (textarea/select/checkbox/radio to match ui/input; retire the five
   `fieldClasses` copies), page grammar (one shell), armed-row pattern
   (grow DOWN, capped — the message-button rule everywhere).
2. **Navigation shell + branded boundaries** (rulings 4, 5). PRICED
   COST, accepted: the auth-aware header opts every (app) route into
   dynamic rendering (getClaims per request; /terms + /privacy were
   static before). Mitigation if it ever matters: Suspense/PPR around
   the header. Root action-groups (app/(account) etc.) staying outside
   (app) is a naming trap noted for a cleanup pass — a future page.tsx
   under a root group at a matching path is an instant build error.
3. **Mechanical page passes** (quick pages first: welcome, messages
   list, entry points, dogs; then the layout pages that become
   mechanical once primitives exist).
4. **The four structural spots** — slot picker + directory filter
   (ruling 9 cheap versions), thread page (composer dock,
   scroll-to-latest, grouping), owner-bookings card (breaks at rest).
   Carried into these passes so they don't evaporate (review notes):
   the trainer-detail h1 (still default Inter — rides the sticky-Book
   pass), the thread h1, and the slot-input error discards
   (getWeeklyPattern/getExceptions/getBusyRanges) fixed in the
   slot-picker rebuild.
5. **Flow items ride WITH their pages** (not a separate phase):
   listing edit ships with the listing re-conception; return-param
   with the book pass; confirmation moment with owner-bookings;
   pending count with the hub pass; zero-slot Message with the slot
   picker.
6. **Marketing re-capture** after the thread page settles (ruling 10).

Conventions unchanged: review gates per commit, full gates +
regression green, live proof before PR. Live proof: walk the product
AS HER on production — sign up as a trainer, onboard to listed,
receive an owner message, confirm a booking — judging how it FEELS.
Then cleanup.
