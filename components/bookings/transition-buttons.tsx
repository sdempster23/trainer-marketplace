"use client";

import { useActionState, useState } from "react";

import {
  cancelBooking,
  completeBooking,
  confirmBooking,
} from "@/app/(bookings)/actions";
import type { TransitionActionState } from "@/app/(bookings)/actions";
import { Button } from "@/components/ui/button";

/**
 * The transition buttons — two-party home, mirroring (bookings)/actions.ts.
 * Confirm and Complete are single-step (non-destructive: they advance the
 * lifecycle); Decline/Cancel is the two-step destructive pattern. Every
 * button renders its error INLINE on its own card (the race message lands
 * where the click happened).
 */

export function ConfirmBookingButton({ bookingId }: { bookingId: string }) {
  const [state, formAction, isPending] = useActionState<
    TransitionActionState,
    FormData
  >(confirmBooking, null);
  return (
    // Errors grow DOWN, capped — the message-button rule, applied to the
    // last holdouts (these sideways spans broke both bookings pages' rows).
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      {/* Amber per the map ruling: one per CARD on this page, Confirm
          only — never Decline, and Mark-completed stays graphite. */}
      <Button type="submit" variant="action" size="sm" disabled={isPending}>
        {isPending ? "Confirming…" : "Confirm"}
      </Button>
      {state && "error" in state ? (
        <span
          role="alert"
          className="text-destructive max-w-40 text-right text-xs break-words"
        >
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export function CompleteBookingButton({ bookingId }: { bookingId: string }) {
  const [state, formAction, isPending] = useActionState<
    TransitionActionState,
    FormData
  >(completeBooking, null);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Completing…" : "Mark completed"}
      </Button>
      {state && "error" in state ? (
        <span
          role="alert"
          className="text-destructive max-w-40 text-right text-xs break-words"
        >
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/**
 * One action, two labels: "Decline" (a trainer answering a PENDING request)
 * and "Cancel" — the same CANCELLED transition with honest attribution (see
 * the actions header). Two-step like every destructive verb.
 */
export function CancelBookingButton({
  bookingId,
  label,
}: {
  bookingId: string;
  label: "Decline" | "Cancel";
}) {
  const [isArmed, setIsArmed] = useState(false);
  const [state, formAction, isPending] = useActionState<
    TransitionActionState,
    FormData
  >(cancelBooking, null);

  if (!isArmed) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsArmed(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={isPending}>
          {isPending ? "Working…" : `Confirm ${label.toLowerCase()}`}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsArmed(false)}
        >
          Keep
        </Button>
      </div>
      {state && "error" in state ? (
        <span
          role="alert"
          className="text-destructive max-w-40 text-right text-xs break-words"
        >
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
