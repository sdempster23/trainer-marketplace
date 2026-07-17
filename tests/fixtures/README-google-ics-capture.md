# Google ICS golden capture — proof-calendar spec

The arc's key test asset (M16 gate ruling 4). Captured from a REAL Google
Calendar secret-ICS URL during live-proof setup, committed as
`google-proof-calendar.ics` here, and asserted by the "real payload"
golden block in `lib/feed/import.test.ts`.

## The proof calendar must contain (all in America/Chicago):

1. **Recurring weekly event** — e.g. "Weekly class", Mondays 10:00–11:00,
   `RRULE:FREQ=WEEKLY;BYDAY=MO`, no UNTIL (unbounded — the window makes it
   finite). Proves RRULE expansion + the rolling window.
2. **All-day event** — e.g. "Vacation", a `VALUE=DATE` DTSTART/DTEND,
   OPAQUE. Proves the all-day → declared-zone-local-day anchoring
   (ruling 5's UTC range).
3. **A cancelled instance of (1)** — delete one occurrence of the weekly
   event ("this event only"). Google emits `EXDATE`. Proves the cancelled
   instance's slot SURVIVES being blocked (the occurrence is removed).
4. **A moved instance of (1)** — drag one occurrence to a new time. Google
   emits a `RECURRENCE-ID` override (stored by node-ical under two keys +
   standalone — the dedup case). Proves the moved instance blocks at its
   NEW time, once.

## Capture procedure (live-proof session)

1. Build the calendar above in Google Calendar.
2. Settings → the calendar → "Secret address in iCal format" → copy.
3. Fetch it once and commit the body verbatim:
   `curl -sL "<secret-ics-url>" > tests/fixtures/google-proof-calendar.ics`
   (the placeholder token in the URL is a bearer credential — do NOT commit
   the URL, only the fetched .ics body; the body itself carries no secret).
4. Add a top-of-file comment to the .ics: `# captured <date> from a Google
   test calendar; secret URL rotated post-capture`.
5. Rotate/reset the Google secret address afterward (the URL was exposed to
   the capture shell).

## Golden assertions to append to import.test.ts

Against `parseIcsToBusyBlocks(<captured body>, { now: <fixed date in the
recurrence window>, fallbackTimezone: "America/Chicago" })`:
- the weekly occurrences within the window appear at their Chicago-10:00
  UTC instants,
- MINUS the EXDATE'd one,
- the moved instance appears ONCE at its new UTC instant (dedup holds on
  real Google dual-key output),
- the all-day event's exact UTC range,
- no titles anywhere in the output (blocks are instants only).
