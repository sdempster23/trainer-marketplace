# Slot-Math Module — Design Record

*Promoted from docs/scratch (Arc B, Group 0 — the design review that preceded
`lib/trainer/schedule.ts`). The contract, the semantic decisions (DST
included), and the test table below are the module's "why" in full; the code
comments carry slices of it, this holds the whole argument.*

- Authored 2026-07-03 against main `6c804e7`; implemented and 16-row-tested
  in PR #22.

---

## Deliverable 1 — the availability schema, re-verified

### `trainer_availability` (recurring weekly pattern)

| column | type | constraint |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `trainer_id` | uuid NOT NULL | FK → trainers |
| `day_of_week` | **smallint** NOT NULL | CHECK 0–6 (0 = Sunday, Postgres DOW convention — the UI must label accordingly) |
| `start_time` / `end_time` | **`time` (time WITHOUT time zone)** NOT NULL | CHECK end > start |
| `created_at` / `updated_at` | timestamptz | `updated_at` trigger present |

UNIQUE `(trainer_id, day_of_week, start_time)` — multiple windows per day
allowed (split shifts).

### `trainer_availability_exceptions` (per-date overrides)

| column | type | constraint |
|---|---|---|
| `exception_date` | **date** NOT NULL | UNIQUE (trainer_id, exception_date) — ONE exception per day |
| `is_blocked` | boolean NOT NULL | XOR CHECK: blocked ⇒ times NULL; not-blocked ⇒ times required + end > start |
| `start_time` / `end_time` | time, nullable | |
| `reason` | text, nullable | display-only |

### Semantics confirmed

- **Hard-delete config**: NO `deleted_at` on either table; real DELETE
  policies exist ("Trainers delete their own availability [exceptions]",
  `auth.uid() = trainer_id`) and the DELETE grant is live (M7 matrix,
  re-verified). Availability is config, not record — rows are removed, not
  tombstoned. **No view-spec/deleted_at rule for these tables**; the
  one-read-path helper pattern still applies but carries no floor.
- **RLS shape**: public SELECT on both (soft-delete-filtered via the parent
  profile — same EXISTS pattern as trainers), INSERT WITH CHECK own +
  role=trainer, UPDATE/DELETE own. Owners can read slots logged out ✓.
- **Timezone**: the TIME columns are wall-clock with NO zone; `trainers.
  timezone` (IANA, NOT NULL) is the interpretation key. `time` values can
  carry seconds ("09:00:00") — the module treats HH:MM:SS.

### Surprises worth recording

1. **Pattern windows on the same day CAN overlap.** The UNIQUE is on
   `start_time` only — (Mon 09:00–12:00) and (Mon 10:00–11:00) coexist
   legally. Consequence for the module: merge overlapping/adjacent windows
   per day before slotting (union of intervals), or duplicate/overlapping
   slots emerge. Consequence for the Group-2 write surface: app-level
   validation should reject overlapping windows at entry (friendlier than
   silently unioning), but the module unions regardless — defense in depth.
2. **Replace-days get exactly ONE window** (UNIQUE per date + single
   start/end pair) — a split-shift exception day is unrepresentable in this
   schema. Fine for v1; noted as a future-migration candidate if trainers
   ask.
3. `day_of_week` 0 = Sunday (documented nowhere else — pinning it here and
   in the module's types).

---

## Deliverable 2 — `lib/trainer/schedule.ts` contract + test table

### A. The contract

```ts
// All types are wire-format strings — the module does its own parsing and
// NEVER constructs zone-dependent Dates from them implicitly.

export type PatternRow = {
  day_of_week: number;              // 0=Sun … 6=Sat
  start_time: string;               // "HH:MM:SS" (Postgres time wire format)
  end_time: string;
};
export type ExceptionRow = {
  exception_date: string;           // "YYYY-MM-DD"
  is_blocked: boolean;
  start_time: string | null;
  end_time: string | null;
};
export type BlockingBooking = {
  starts_at: string;                // UTC ISO (timestamptz wire format)
  ends_at: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
};

export type BookableSlot = {
  startUtc: string;                 // ISO instant — what the booking INSERT stores
  endUtc: string;                   // start + duration ABSOLUTE minutes
  dateLocal: string;                // "YYYY-MM-DD" in the trainer's zone
  labelLocal: string;               // "9:00 AM" — trainer-zone wall clock
};

export function computeBookableSlots(input: {
  pattern: PatternRow[];
  exceptions: ExceptionRow[];
  bookings: BlockingBooking[];      // module filters to blocking statuses itself
  timezone: string;                 // trainers.timezone (IANA)
  durationMinutes: number;          // the service being booked
  fromDateLocal: string;            // inclusive, trainer-zone calendar date
  toDateLocal: string;              // inclusive
  now: Date;                        // ALWAYS a parameter — never Date.now() inside
}): BookableSlot[];                 // ordered by startUtc
```

**Pure function, no I/O, no Supabase** — callers fetch, the module computes.

Contract deltas from the starting spec, argued:

- **Date range is in the TRAINER's calendar frame** (`fromDateLocal`/
  `toDateLocal`, trainer-zone dates). The pattern is keyed by trainer-local
  weekday and exceptions by trainer-local date — "which days to expand" is a
  question that only exists in the trainer's zone. A UTC range would
  straddle local days and make exception matching ambiguous. The OWNER's
  display frame is a rendering concern: every slot carries `startUtc`, so
  any consumer can re-label; v1 labels in the trainer's zone (the label says
  where the session happens).
- **Bookings arrive WITH status and the module filters** — the
  blocking-status rule (below) is the module's single point of truth, not a
  convention every caller must remember. A caller passing pre-filtered rows
  loses nothing; a caller passing everything can't get it wrong.
- **`now` is a parameter** — determinism is what makes the test table
  possible (the M6 transaction-stable-now lesson, ported to TS).

### B. The semantic decisions

**B1. Discrete duration-sized slots, anchored at the window start.**
Window 09:00–12:00 + 60-min service → 09:00, 10:00, 11:00 (NOT sliding
09:15, 09:30…). Three arguments: (a) booking UX — a pick-list of distinct
choices, not 13 near-identical ones; (b) the EXCLUDE constraint makes
overlapping offers mutually exclusive — with sliding starts, booking 09:15
invalidates 08:30–10:15's whole neighborhood, so most of the displayed list
dies the moment anyone books (user-visible failures by design); discrete
non-overlapping slots are independently bookable, so the offer list is
honest; (c) remainders (a 10:30 window end with 60-min steps from 09:00)
are silently unoffered — pinned by a test, not an accident. Different
services have different durations → different grids; cross-grid collisions
are handled by interval overlap, not grid alignment.

**B2. Exceptions.** Per the XOR CHECK: `is_blocked=true` → the date
contributes NO windows (pattern suppressed). `is_blocked=false` → the
exception window REPLACES the entire day's pattern (all of it — the schema
allows one exception per date, so replace means "this is the day's whole
availability"). No merging of exception + pattern on the same day, ever.

**B3. Blocking statuses = PENDING + CONFIRMED, exactly.** This MATCHES the
EXCLUDE constraint's `WHERE status IN ('PENDING','CONFIRMED')` — the module
must never offer a slot the DB would reject, and the DB rejects overlap with
PENDING too (M6 finding #2: the slot is reserved at the second INSERT, not
at CONFIRM). So yes: a PENDING request holds the time. CANCELLED and
COMPLETED never block.

**B4. Past-time floor = `now + 15 minutes`, STRICT.** The insert trigger
rejects `starts_at <= now() + interval '15 minutes'` — the module mirrors it
exactly (slot offered iff `startUtc > now + 15min`), exported as a shared
`MIN_LEAD_MINUTES = 15` constant with trigger-parity commented. A business
lead time (24-h notice etc.) is a product decision deferred — v1 adds
nothing beyond trigger parity (YAGNI; adding it later is one constant).

**B5. DST, decided case by case** (zone examples: America/Chicago, 2026
transitions — 2026-03-08 spring-forward, 2026-11-01 fall-back):

- **Nonexistent local time (spring-forward)**: a grid start of 02:00 on
  2026-03-08 doesn't exist. Decision: **SKIP** the slot. Shifting to 03:00
  would lie about the wall-clock promise (and could collide with the real
  03:00 slot); the trainer's 2 AM slot simply doesn't happen that day —
  honest and rare.
- **Ambiguous local time (fall-back)**: 01:00 on 2026-11-01 occurs twice.
  Decision: **pick the FIRST instant** (the earlier UTC / pre-transition
  offset), once. Offering both would show two identical "1:00 AM" labels
  (indistinguishable to a human, guaranteed confusion); first-instant is
  deterministic and matches common library defaults.
- **Slot straddling the transition**: duration is ABSOLUTE minutes —
  `endUtc = startUtc + durationMinutes` real minutes, exactly matching the
  DB's `_bookings_ends_at` (make_interval on minutes). Wall-clock end may
  jump (60 real minutes after 01:30 CST is 03:30 CDT). **Window containment
  is checked on the wall-clock projection of that absolute end** — the
  trainer wrote wall-clock windows, so a slot whose real end projects past
  the window's wall end is excluded. (Consequence: on spring-forward, a late
  slot in a tight window can drop; on fall-back, a slot can fit that
  wouldn't normally — both honest to "the trainer is working these wall
  hours".)

**B6. Timezone math: built-in `Intl`, NO new dependency.** Options weighed:
`date-fns-tz` (fine, but a new dep for one conversion), `Temporal` (right
long-term, not stable in our Node without a polyfill = new dep), **`Intl.
DateTimeFormat` with `timeZone` (chosen)** — ICU-backed tzdata already in
the runtime. The conversion (trainer-local wall time on date D → UTC
instant) uses the explicit candidate-offset algorithm, correct BY
CONSTRUCTION for both DST edge classes:

1. Compute the zone's UTC offset at two probe instants around the naive
   epoch (naive = wall time read as if UTC).
2. For each distinct candidate offset `o`: `candidateEpoch = naiveEpoch - o`;
   keep it iff formatting `candidateEpoch` back into the zone reproduces the
   requested wall time exactly (round-trip check).
3. Zero survivors → the wall time DOESN'T EXIST (spring-forward) → skip.
   Two survivors → AMBIGUOUS (fall-back) → take `min(epoch)` (first
   instant). One → the answer.

Nonexistence and ambiguity aren't special-cased heuristics — they fall out
of the round-trip check, which is why the DST decisions in B5 hold by
construction. ~30 lines, fully pinned by the DST test rows. (If Temporal
lands in a future Node upgrade, this helper is the one function to swap.)

### C. The test table

Fixture conventions: zone America/Chicago unless stated; `NOW` = a fixed
instant (e.g. `2026-07-06T12:00:00Z`, a Monday 07:00 local); range = the
week containing the interesting date; 60-min service unless stated.

| # | case | inputs sketch | expected | pins |
|---|---|---|---|---|
| T1 | normal weekday | Mon 09:00–12:00 pattern | 3 slots, local 9/10/11 AM, correct UTC (-5 CDT), ordered | the happy path + zone conversion |
| T2 | empty pattern | no rows | `[]` | zero-state |
| T3 | split shift | Mon 09–11 + 14–16 | 2 + 2 slots, globally ordered | multi-window days |
| T4 | remainder | Mon 09:00–10:30, 60-min | ONE slot (09:00) | anchor + step; 09:30 remainder unoffered |
| T5 | overlapping pattern windows | Mon 09–12 + 10–11 | same 3 slots as T1, no duplicates | the union rule (schema surprise #1) |
| T6 | exception block | pattern Mon + blocked exception that date | 0 slots that date; other days intact | block semantics, date scoping |
| T7 | exception replace | pattern 09–12; exception 13:00–15:00 | 13:00 + 14:00 only | replace-not-merge |
| T8 | PENDING collision | booking 10:00–11:00 PENDING | 09:00 + 11:00 offered, 10:00 gone | PENDING holds the slot (EXCLUDE parity) |
| T9 | CANCELLED non-collision | same interval, CANCELLED | all 3 slots | the status filter (module-owned) |
| T10 | boundary adjacency | booking 10:00–11:00 | 09:00–10:00 and 11:00–12:00 BOTH offered | half-open `[)` — end==start is not overlap, matching `tstzrange(…,'[)')` |
| T11 | past floor, strict | NOW = slot start − 15 min exactly | that slot EXCLUDED; the next included | strict `>` trigger parity (K-category style boundary) |
| T12 | DST nonexistent | 2026-03-08, window 01:00–04:00 | 01:00 (CST, -6) and 03:00 (CDT, -5); **02:00 absent** | spring-forward skip + intra-day offset change |
| T13 | DST ambiguous | 2026-11-01, window 01:00–03:00 | 01:00 ONCE at the FIRST instant (CDT, -5), then 02:00 (CST, -6) | fall-back first-instant, no duplicate label |
| T14 | DST straddle | 2026-03-08, window 01:00–03:30, 90-min | 01:30 slot's absolute end projects to wall 04:00 > 03:30 → excluded | absolute duration + wall-clock containment (B5.3) |
| T15 | range framing | bookings/exceptions outside [from,to] | ignored; from/to dates inclusive | the trainer-frame range contract |
| T16 | determinism | any fixture, called twice with same `now` | deep-equal outputs | purity — no Date.now(), no hidden state |

Suite shape: vitest unit tests (the project's first real unit suite beyond
cn), table-driven where natural, each DST row with hand-computed UTC
instants in the assertions (the numbers are the documentation).

---

## Group 1 preview (for orientation, not approval)

Implement `lib/trainer/schedule.ts` + `schedule.test.ts` to this table;
Group 2 is the `/trainer/availability` write surface (weekly grid +
exceptions, hard-delete, overlap validation per surprise #1); Group 3 wires
nothing — the consumer is Arc C's booking flow.
