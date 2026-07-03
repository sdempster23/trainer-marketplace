"use client";

import { useActionState, useState } from "react";

import { deleteException, deleteWeeklySlot } from "@/app/(trainer)/actions";
import type { AvailabilityActionState } from "@/app/(trainer)/actions";
import { Button } from "@/components/ui/button";
import type {
  AvailabilityException,
  WeeklySlot,
} from "@/lib/trainer/availability";
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
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name={fieldName} value={id} />
      {state && "error" in state ? (
        <span role="alert" className="text-destructive text-xs">
          {state.error}
        </span>
      ) : null}
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
    </form>
  );
}

export function WeeklySlotRow({ slot }: { slot: WeeklySlot }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>
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
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2">
        <span className="font-medium">{exception.exception_date}</span>
        {exception.is_blocked ? (
          <span className="bg-destructive/10 text-destructive inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
            Blocked
          </span>
        ) : (
          <span className="bg-accent text-accent-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
            Hours: {formatTimeOfDay(exception.start_time ?? "00:00")} –{" "}
            {formatTimeOfDay(exception.end_time ?? "00:00")}
          </span>
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
