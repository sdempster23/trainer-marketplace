import { z } from "zod";

/**
 * Availability validation (trainer domain). Derived from the live M4 DDL:
 * weekly pattern rows (day_of_week 0-6 CHECK, time end > start CHECK,
 * UNIQUE (trainer, day, start_time)) and per-date exceptions (UNIQUE
 * (trainer, exception_date), XOR CHECK: blocked ⇒ times NULL / not-blocked
 * ⇒ times required + end > start).
 */

/** 0 = Sunday … 6 = Saturday — the Postgres DOW convention (same pin as the
 * slot-math module's PatternRow; the two must never disagree). */
export const DAY_OF_WEEK_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const TIME_HHMM = /^\d{2}:\d{2}$/;

/** <input type="time"> speaks "HH:MM"; the time columns speak "HH:MM:SS" —
 * the schema appends ":00" so the action stores exactly what Postgres will
 * echo back (string-comparable everywhere, no reformatting drift). */
const timeField = z
  .string()
  .regex(TIME_HHMM, "Enter a time like 09:00.");

const toWire = (hhmm: string) => `${hhmm}:00`;

export const weeklySlotSchema = z
  .object({
    dayOfWeek: z.coerce
      .number()
      .int()
      .min(0, "Choose a day.")
      .max(6, "Choose a day."),
    startTime: timeField,
    endTime: timeField,
  })
  .refine((v) => v.endTime > v.startTime, {
    // Mirrors the DB CHECK (end_time > start_time) with a friendly message;
    // HH:MM compares correctly as strings (fixed width).
    message: "The end time must be after the start time.",
    path: ["endTime"],
  })
  .transform((v) => ({
    dayOfWeek: v.dayOfWeek,
    startTime: toWire(v.startTime),
    endTime: toWire(v.endTime),
  }));

export type WeeklySlotInput = z.infer<typeof weeklySlotSchema>;

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

/**
 * The XOR modeled STRUCTURALLY (discriminated union), not as a refine: a
 * 'blocked' exception cannot even carry times in the type, and a 'replace'
 * exception cannot omit them — the DB's XOR CHECK becomes unrepresentable
 * invalid states instead of a runtime rule.
 */
export const exceptionSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("blocked"),
      date: dateField,
    }),
    z
      .object({
        kind: z.literal("replace"),
        date: dateField,
        startTime: timeField,
        endTime: timeField,
      })
      .refine((v) => v.endTime > v.startTime, {
        message: "The end time must be after the start time.",
        path: ["endTime"],
      }),
  ])
  .transform((v) =>
    v.kind === "blocked"
      ? v
      : { ...v, startTime: toWire(v.startTime), endTime: toWire(v.endTime) },
  );

export type ExceptionInput = z.infer<typeof exceptionSchema>;

/** App-created v4 rows only — strict uuid is correct (the z.guid() lesson
 * applies only to gates over seedable ids). */
export const availabilityIdSchema = z.uuid("Invalid entry.");

/** "HH:MM[:SS]" → "9:00 AM" — pure string math, NO Date object: this is
 * 12-hour formatting of a zone-naive wall time, not a zone conversion. */
export function formatTimeOfDay(time: string): string {
  const [hh = 0, mm = 0] = time.split(":").map(Number);
  const period = hh < 12 ? "AM" : "PM";
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${String(mm).padStart(2, "0")} ${period}`;
}
