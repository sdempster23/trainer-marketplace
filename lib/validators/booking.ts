import { z } from "zod";

/**
 * Booking-flow validation (owner domain). The client sends THREE ids-and-an-
 * instant and nothing else — price, duration, and trainer_id are all derived
 * server-side from the service row (G3 snapshot fidelity: the client never
 * sends money).
 */

/** The picker's window: today (trainer zone) + 13 more days. Shared by the
 * form (which days to render) and createBooking's recompute guard (the
 * membership universe) — they must agree or valid submissions bounce. */
export const BOOKING_WINDOW_DAYS = 14;

export const createBookingSchema = z.object({
  serviceId: z.uuid("Invalid service."),
  dogId: z.uuid("Invalid dog."),
  slotStartUtc: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Pick a time slot.")
    // Normalize to toISOString() form — computeBookableSlots emits exactly
    // that, so the membership check compares canonical strings.
    .transform((v) => new Date(v).toISOString()),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/** Status → what an owner should read. Exhaustive Record — a new enum value
 * breaks the build until labeled (the SPECIALTY_LABELS discipline). */
export const BOOKING_STATUS_LABELS: Record<
  "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED",
  string
> = {
  PENDING: "Waiting for the trainer to confirm",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** "2026-07-06T14:00:00Z" in a zone → "Mon, Jul 6 · 9:00 AM". Display-edge
 * only; storage stays UTC. */
export function formatBookingStart(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${day} · ${time}`;
}
