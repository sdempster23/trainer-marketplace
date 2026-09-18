import { describe, expect, test } from "vitest";

import { parseIcsToBusyBlocks } from "@/lib/feed/import";
import { computeBookableSlots } from "@/lib/trainer/schedule";
import { formatBookingStart } from "@/lib/validators/booking";

/**
 * Real runtime data is part of the booking contract. Do not mock Intl or
 * change these expectations to match an old runtime. IANA 2026b–2026d
 * removed the autumn clock change in Vancouver, Edmonton, and Inuvik.
 * See docs/timezone-data.md for the required runtime update.
 */
function slotsOn(date: string, timezone: string, start = "09:00:00", end = "10:00:00") {
  const midnight = new Date(`${date}T00:00:00Z`);
  return computeBookableSlots({
    pattern: [{ day_of_week: midnight.getUTCDay(), start_time: start, end_time: end }],
    exceptions: [],
    bookings: [],
    timezone,
    durationMinutes: 60,
    fromDateLocal: date,
    toDateLocal: date,
    now: new Date(midnight.getTime() - 86_400_000),
  });
}

describe("international booking timezone data", () => {
  test.each([
    ["America/Vancouver", "2026-11-15", "2026-11-15T16:00:00.000Z"],
    ["America/Edmonton", "2026-11-15", "2026-11-15T15:00:00.000Z"],
    ["America/Inuvik", "2026-11-15", "2026-11-15T15:00:00.000Z"],
    ["America/Vancouver", "2027-01-15", "2027-01-15T16:00:00.000Z"],
    ["America/Edmonton", "2027-01-15", "2027-01-15T15:00:00.000Z"],
    ["America/Inuvik", "2027-01-15", "2027-01-15T15:00:00.000Z"],
    // A data update must preserve history; a fixed-offset replacement would not.
    ["America/Vancouver", "2026-01-15", "2026-01-15T17:00:00.000Z"],
    ["America/Edmonton", "2026-01-15", "2026-01-15T16:00:00.000Z"],
    ["America/Inuvik", "2026-01-15", "2026-01-15T16:00:00.000Z"],
    ["America/St_Johns", "2026-11-15", "2026-11-15T12:30:00.000Z"],
    ["America/St_Johns", "2026-07-15", "2026-07-15T11:30:00.000Z"],
    ["America/Regina", "2026-11-15", "2026-11-15T15:00:00.000Z"],
    ["America/Whitehorse", "2026-11-15", "2026-11-15T16:00:00.000Z"],
    ["Europe/London", "2026-11-15", "2026-11-15T09:00:00.000Z"],
    ["Europe/London", "2026-07-15", "2026-07-15T08:00:00.000Z"],
    ["America/Los_Angeles", "2026-11-15", "2026-11-15T17:00:00.000Z"],
    ["America/Chicago", "2026-11-15", "2026-11-15T15:00:00.000Z"],
  ])("9am in %s on %s produces %s", (timezone, date, expected) => {
    const slots = slotsOn(date, timezone);
    expect(slots.map((slot) => slot.startUtc)).toEqual([expected]);
    expect(slots[0]?.labelLocal).toBe("9:00 AM");
  });

  test.each([
    ["America/Vancouver", "2026-11-15T16:00:00.000Z"],
    ["America/Edmonton", "2026-11-15T15:00:00.000Z"],
    ["America/Inuvik", "2026-11-15T15:00:00.000Z"],
    ["Europe/London", "2026-11-15T09:00:00.000Z"],
  ])("booking and email display uses the trainer's time in %s", (timezone, instant) => {
    expect(formatBookingStart(instant, timezone)).toBe("Sun, Nov 15 · 9:00 AM");
  });

  test("London skips the missing spring hour", () => {
    const slots = slotsOn("2026-03-29", "Europe/London", "00:00:00", "04:00:00");
    expect(slots.map((slot) => slot.startUtc)).toEqual([
      "2026-03-29T00:00:00.000Z",
      "2026-03-29T01:00:00.000Z",
      "2026-03-29T02:00:00.000Z",
    ]);
    expect(slots.map((slot) => slot.labelLocal)).toEqual(["12:00 AM", "2:00 AM", "3:00 AM"]);
  });

  test("London offers the first repeated autumn hour once", () => {
    expect(
      slotsOn("2026-10-25", "Europe/London", "00:00:00", "03:00:00").map((slot) => slot.startUtc)
    ).toEqual(["2026-10-24T23:00:00.000Z", "2026-10-25T00:00:00.000Z", "2026-10-25T02:00:00.000Z"]);
  });
});

function calendar(timezone: string, events: string[]) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PawMatch timezone test//EN",
    `X-WR-TIMEZONE:${timezone}`,
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

describe("international imported calendar timezone data", () => {
  test.each([
    [
      "America/Vancouver",
      ["2026-10-25T16:00:00.000Z", "2026-11-01T16:00:00.000Z", "2026-11-08T16:00:00.000Z"],
    ],
    [
      "America/Edmonton",
      ["2026-10-25T15:00:00.000Z", "2026-11-01T15:00:00.000Z", "2026-11-08T15:00:00.000Z"],
    ],
    [
      "America/Inuvik",
      ["2026-10-25T15:00:00.000Z", "2026-11-01T15:00:00.000Z", "2026-11-08T15:00:00.000Z"],
    ],
  ] as const)("weekly 9am in %s remains fixed across November 1", (timezone, expected) => {
    const ics = calendar(timezone, [
      "BEGIN:VEVENT",
      "UID:weekly",
      `DTSTART;TZID=${timezone}:20261025T090000`,
      `DTEND;TZID=${timezone}:20261025T100000`,
      "RRULE:FREQ=WEEKLY;COUNT=3",
      "END:VEVENT",
    ]);
    const blocks = parseIcsToBusyBlocks(ics, {
      now: new Date("2026-10-24T00:00:00Z"),
      fallbackTimezone: "UTC",
    });
    expect(blocks.map((block) => block.starts_at)).toEqual(expected);
  });

  test("Vancouver exclusions and moved occurrences match after the former clock change", () => {
    const ics = calendar("America/Vancouver", [
      "BEGIN:VEVENT",
      "UID:moved",
      "DTSTART;TZID=America/Vancouver:20261025T090000",
      "DTEND;TZID=America/Vancouver:20261025T100000",
      "RRULE:FREQ=WEEKLY;COUNT=3",
      "EXDATE;TZID=America/Vancouver:20261101T090000",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:moved",
      "RECURRENCE-ID;TZID=America/Vancouver:20261108T090000",
      "DTSTART;TZID=America/Vancouver:20261108T110000",
      "DTEND;TZID=America/Vancouver:20261108T120000",
      "END:VEVENT",
    ]);
    expect(
      parseIcsToBusyBlocks(ics, {
        now: new Date("2026-10-24T00:00:00Z"),
        fallbackTimezone: "UTC",
      })
    ).toEqual([
      { starts_at: "2026-10-25T16:00:00.000Z", ends_at: "2026-10-25T17:00:00.000Z" },
      { starts_at: "2026-11-08T18:00:00.000Z", ends_at: "2026-11-08T19:00:00.000Z" },
    ]);
  });

  test("Vancouver November 1 all-day event spans 24 hours in its declared zone", () => {
    const ics = calendar("America/Vancouver", [
      "BEGIN:VEVENT",
      "UID:all-day",
      "DTSTART;VALUE=DATE:20261101",
      "DTEND;VALUE=DATE:20261102",
      "END:VEVENT",
    ]);
    expect(
      parseIcsToBusyBlocks(ics, {
        now: new Date("2026-10-31T00:00:00Z"),
        fallbackTimezone: "Europe/London",
      })
    ).toEqual([{ starts_at: "2026-11-01T07:00:00.000Z", ends_at: "2026-11-02T07:00:00.000Z" }]);
  });
});
