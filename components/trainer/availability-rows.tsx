"use client";

import { useActionState, useState } from "react";

import { deleteException, deleteWeeklySlot } from "@/app/(trainer)/actions";
import type { AvailabilityActionState } from "@/app/(trainer)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  AvailabilityException,
  WeeklySlot,
} from "@/lib/trainer/availability";
import { formatPlainDate } from "@/lib/utils/format-date";
import { formatTimeOfDay } from "@/lib/validators/availability";

/**
 * Two-step delete over a REAL delete (the hard-delete deviation — see the
 * actions' comments): arm → Confirm/Keep, no native confirm(). Shared by
 * both row types; the hidden-field name and action differ per use.
 */
function TwoStepDelete({
  action,
  fieldName,
  id,
}: {
  action: (
    prev: AvailabilityActionState,
    formData: FormData,
  ) => Promise<AvailabilityActionState>;
  fieldName: string;
  id: string;
}) {
  const [isArmed, setIsArmed] = useState(false);
  const [state, formAction, isPending] = useActionState<
    AvailabilityActionState,
    FormData
  >(action, null);

  if (!isArmed) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsArmed(true)}
      >
        Delete
      </Button>
    );
  }

  return (
    // Grow DOWN, capped — the message-button rule; both armed rows on this
    // page overflowed the card at 390 with the sideways error span.
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name={fieldName} value={id} />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={isPending}>
          {isPending ? "Deleting…" : "Confirm delete"}
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

export function WeeklySlotRow({ slot }: { slot: WeeklySlot }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="font-mono text-xs">
        {formatTimeOfDay(slot.start_time)} – {formatTimeOfDay(slot.end_time)}
      </span>
      <TwoStepDelete
        action={deleteWeeklySlot}
        fieldName="slotId"
        id={slot.id}
      />
    </div>
  );
}

export function ExceptionRow({
  exception,
}: {
  exception: AvailabilityException;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {formatPlainDate(exception.exception_date)}
        </span>
        {/* "Blocked" is neutral, not destructive: a day off is a
            preference, and the red/green-semantics ruling (arc-notes)
            binds interiors too. */}
        {exception.is_blocked ? (
          <Badge>Blocked</Badge>
        ) : exception.start_time && exception.end_time ? (
          <Badge>
            Hours: {formatTimeOfDay(exception.start_time)} –{" "}
            {formatTimeOfDay(exception.end_time)}
          </Badge>
        ) : (
          // Null times on a non-blocked exception: an honest degraded
          // state, not a fabricated "12:00 AM – 12:00 AM" range.
          <Badge>Hours not set</Badge>
        )}
      </span>
      <TwoStepDelete
        action={deleteException}
        fieldName="exceptionId"
        id={exception.id}
      />
    </div>
  );
}
