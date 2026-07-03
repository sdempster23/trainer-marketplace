import { describe, expect, test } from "vitest";

import {
  computeBookableSlots,
  type BlockingBooking,
  type BookableSlot,
  type ExceptionRow,
} from "@/lib/trainer/schedule";

/**
 * The Group-0 test table, row for row. Zone: America/Chicago (CDT = UTC-5 in
 * July, CST = UTC-6 in winter; 2026 transitions: spring-forward 2026-03-08,
 * fall-back 2026-11-01 — both Sundays, which doubles as the Sunday=0 pin).
 * Every UTC instant in the assertions is hand-computed; the numbers ARE the
 * documentation.
 */

const TZ = "America/Chicago";
const MONDAY_9_TO_12 = [
  { day_of_week: 1, start_time: "09:00:00", end_time: "12:00:00" },
];
/** Monday 2026-07-06, 07:00 local — before the day's slots. */
const NOW = new Date("2026-07-06T12:00:00Z");

const base = {
  pattern: MONDAY_9_TO_12,
  exceptions: [] as ExceptionRow[],
  bookings: [] as BlockingBooking[],
  timezone: TZ,
  durationMinutes: 60,
  fromDateLocal: "2026-07-06",
  toDateLocal: "2026-07-12",
  now: NOW,
};

const compute = (over: Partial<typeof base>) =>
  computeBookableSlots({ ...base, ...over });
const starts = (slots: BookableSlot[]) => slots.map((s) => s.startUtc);

// Monday 2026-07-06 local 09/10/11 AM in CDT (-5).
const MON_SLOTS = [
  "2026-07-06T14:00:00.000Z",
  "2026-07-06T15:00:00.000Z",
  "2026-07-06T16:00:00.000Z",
];

describe("computeBookableSlots", () => {
  test("T1 normal weekday: 3 discrete slots, correct UTC, ordered, labeled", () => {
    const slots = compute({});
    expect(starts(slots)).toEqual(MON_SLOTS);
    expect(slots[0]).toEqual({
      startUtc: "2026-07-06T14:00:00.000Z",
      endUtc: "2026-07-06T15:00:00.000Z",
      dateLocal: "2026-07-06",
      labelLocal: "9:00 AM",
    });
  });

  test("T2 empty pattern: zero slots", () => {
    expect(compute({ pattern: [] })).toEqual([]);
  });

  test("T3 split shift: both windows, globally ordered", () => {
    const slots = compute({
      pattern: [
        { day_of_week: 1, start_time: "09:00:00", end_time: "11:00:00" },
        { day_of_week: 1, start_time: "14:00:00", end_time: "16:00:00" },
      ],
    });
    expect(starts(slots)).toEqual([
      "2026-07-06T14:00:00.000Z", // 9 AM
      "2026-07-06T15:00:00.000Z", // 10 AM
      "2026-07-06T19:00:00.000Z", // 2 PM
      "2026-07-06T20:00:00.000Z", // 3 PM
    ]);
  });

  test("T4 remainder: 09:00-10:30 with 60-min service offers ONLY 09:00", () => {
    const slots = compute({
      pattern: [{ day_of_week: 1, start_time: "09:00:00", end_time: "10:30:00" }],
    });
    expect(starts(slots)).toEqual(["2026-07-06T14:00:00.000Z"]);
  });

  test("T5 overlapping pattern windows union: no duplicate slots (schema allows the overlap)", () => {
    const slots = compute({
      pattern: [
        ...MONDAY_9_TO_12,
        { day_of_week: 1, start_time: "10:00:00", end_time: "11:00:00" },
      ],
    });
    expect(starts(slots)).toEqual(MON_SLOTS);
  });

  test("T6 exception block: the date yields nothing; other dates unaffected", () => {
    const slots = compute({
      pattern: [
        ...MONDAY_9_TO_12,
        { day_of_week: 2, start_time: "09:00:00", end_time: "10:00:00" }, // Tue
      ],
      exceptions: [
        {
          exception_date: "2026-07-06",
          is_blocked: true,
          start_time: null,
          end_time: null,
        },
      ],
    });
    // Monday suppressed; Tuesday 2026-07-07 09:00 CDT survives.
    expect(starts(slots)).toEqual(["2026-07-07T14:00:00.000Z"]);
  });

  test("T7 exception replace: the window REPLACES the whole day's pattern", () => {
    const slots = compute({
      exceptions: [
        {
          exception_date: "2026-07-06",
          is_blocked: false,
          start_time: "13:00:00",
          end_time: "15:00:00",
        },
      ],
    });
    expect(starts(slots)).toEqual([
      "2026-07-06T18:00:00.000Z", // 1 PM
      "2026-07-06T19:00:00.000Z", // 2 PM
    ]);
  });

  test("T8 PENDING collision: a pending booking holds its slot (EXCLUDE parity)", () => {
    const slots = compute({
      bookings: [
        {
          starts_at: "2026-07-06T15:00:00Z", // 10 AM local
          ends_at: "2026-07-06T16:00:00Z",
          status: "PENDING",
        },
      ],
    });
    expect(starts(slots)).toEqual([
      "2026-07-06T14:00:00.000Z",
      "2026-07-06T16:00:00.000Z",
    ]);
  });

  test("T9 CANCELLED non-collision: the status filter is module-owned", () => {
    const slots = compute({
      bookings: [
        {
          starts_at: "2026-07-06T15:00:00Z",
          ends_at: "2026-07-06T16:00:00Z",
          status: "CANCELLED",
        },
      ],
    });
    expect(starts(slots)).toEqual(MON_SLOTS);
  });

  test("T10 boundary adjacency: end==start is NOT overlap (half-open [) parity)", () => {
    const slots = compute({
      bookings: [
        {
          starts_at: "2026-07-06T15:00:00Z",
          ends_at: "2026-07-06T16:00:00Z",
          status: "CONFIRMED",
        },
      ],
    });
    // The 9 AM slot ENDS exactly at the booking's start; the 11 AM slot
    // STARTS exactly at the booking's end — both offered.
    expect(starts(slots)).toContain("2026-07-06T14:00:00.000Z");
    expect(starts(slots)).toContain("2026-07-06T16:00:00.000Z");
    expect(starts(slots)).not.toContain("2026-07-06T15:00:00.000Z");
  });

  test("T11 past floor, strict: a slot starting exactly now+15min is EXCLUDED (trigger parity)", () => {
    const slots = compute({ now: new Date("2026-07-06T13:45:00Z") });
    // floor = 14:00:00Z; the trigger rejects starts_at <= now()+15min, so
    // 14:00 exactly is NOT offered.
    expect(starts(slots)).toEqual([
      "2026-07-06T15:00:00.000Z",
      "2026-07-06T16:00:00.000Z",
    ]);
  });

  test("T12 DST spring-forward: the nonexistent 2 AM slot is SKIPPED, offsets shift intra-day", () => {
    const slots = compute({
      pattern: [{ day_of_week: 0, start_time: "01:00:00", end_time: "04:00:00" }],
      fromDateLocal: "2026-03-08",
      toDateLocal: "2026-03-08",
      now: new Date("2026-03-07T00:00:00Z"),
    });
    expect(starts(slots)).toEqual([
      "2026-03-08T07:00:00.000Z", // 1 AM CST (-6)
      "2026-03-08T08:00:00.000Z", // 3 AM CDT (-5) — 2 AM never existed
    ]);
    expect(slots.map((s) => s.labelLocal)).toEqual(["1:00 AM", "3:00 AM"]);
  });

  test("T13 DST fall-back: the ambiguous 1 AM resolves to the FIRST instant, once", () => {
    const slots = compute({
      pattern: [{ day_of_week: 0, start_time: "01:00:00", end_time: "03:00:00" }],
      fromDateLocal: "2026-11-01",
      toDateLocal: "2026-11-01",
      now: new Date("2026-10-31T00:00:00Z"),
    });
    expect(starts(slots)).toEqual([
      "2026-11-01T06:00:00.000Z", // 1 AM CDT (-5) — the FIRST 1 AM
      "2026-11-01T08:00:00.000Z", // 2 AM CST (-6)
    ]);
    // The second 1 AM instant (07:00Z) is deliberately absent.
    expect(starts(slots)).not.toContain("2026-11-01T07:00:00.000Z");
  });

  test("T14 DST straddle: absolute duration + wall-clock containment", () => {
    const window = [
      { day_of_week: 0, start_time: "01:00:00", end_time: "03:00:00" },
    ];
    // Control (regular Sunday): 90-min slot at 1 AM fits (wall end 2:30).
    const control = compute({
      pattern: window,
      durationMinutes: 90,
      fromDateLocal: "2026-03-01",
      toDateLocal: "2026-03-01",
      now: new Date("2026-02-28T00:00:00Z"),
    });
    expect(starts(control)).toEqual(["2026-03-01T07:00:00.000Z"]);
    expect(control[0]?.endUtc).toBe("2026-03-01T08:30:00.000Z");

    // Spring-forward Sunday: 90 ABSOLUTE minutes after 1 AM CST is 3:30 AM
    // CDT — the wall projection overshoots the 03:00 window end, so the slot
    // is excluded; the 02:30 grid start never exists. Zero slots.
    const dst = compute({
      pattern: window,
      durationMinutes: 90,
      fromDateLocal: "2026-03-08",
      toDateLocal: "2026-03-08",
      now: new Date("2026-03-07T00:00:00Z"),
    });
    expect(dst).toEqual([]);
  });

  test("T15 range framing: inclusive bounds; out-of-range rows are inert", () => {
    const slots = compute({
      fromDateLocal: "2026-07-06",
      toDateLocal: "2026-07-06", // from == to, single day, inclusive
      exceptions: [
        {
          exception_date: "2026-07-13", // next Monday — outside the range
          is_blocked: true,
          start_time: null,
          end_time: null,
        },
      ],
      bookings: [
        {
          starts_at: "2026-07-13T15:00:00Z",
          ends_at: "2026-07-13T16:00:00Z",
          status: "CONFIRMED",
        },
      ],
    });
    expect(starts(slots)).toEqual(MON_SLOTS);
  });

  test("T16 determinism: identical inputs + identical now → identical output", () => {
    const input = {
      bookings: [
        {
          starts_at: "2026-07-06T15:00:00Z",
          ends_at: "2026-07-06T16:00:00Z",
          status: "PENDING",
        },
      ],
    };
    expect(compute(input)).toEqual(compute(input));
  });
});
