"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { addException, addWeeklySlot } from "@/app/(trainer)/actions";
import type { AvailabilityActionState } from "@/app/(trainer)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DAY_OF_WEEK_LABELS } from "@/lib/validators/availability";

const fieldClasses =
  "border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none";

/** Shared success/reset wiring (the { success } sentinel pattern). */
function useResetOnSuccess(state: AvailabilityActionState) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state && "success" in state) {
      formRef.current?.reset();
    }
  }, [state]);
  return formRef;
}

export function AddWeeklySlotForm() {
  const [state, formAction, isPending] = useActionState<
    AvailabilityActionState,
    FormData
  >(addWeeklySlot, null);
  const formRef = useResetOnSuccess(state);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="slot-day">Day</Label>
          <select id="slot-day" name="dayOfWeek" required defaultValue="" className={fieldClasses}>
            <option value="" disabled>
              Choose a day
            </option>
            {DAY_OF_WEEK_LABELS.map((label, day) => (
              <option key={label} value={day}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="slot-start">From</Label>
          <Input id="slot-start" name="startTime" type="time" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="slot-end">Until</Label>
          <Input id="slot-end" name="endTime" type="time" required />
        </div>
      </div>

      {state && "error" in state ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Adding…" : "Add hours"}
      </Button>
    </form>
  );
}

export function AddExceptionForm() {
  const [state, formAction, isPending] = useActionState<
    AvailabilityActionState,
    FormData
  >(addException, null);
  const formRef = useResetOnSuccess(state);
  // Client-side show/hide only — the kind field itself is what the action
  // parses (the discriminated union), so hiding the time inputs is cosmetic.
  const [kind, setKind] = useState<"blocked" | "replace">("blocked");

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="exception-date">Date</Label>
          <Input id="exception-date" name="date" type="date" required />
        </div>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">What happens that day?</legend>
          <div className="flex gap-2">
            {(
              [
                ["blocked", "Day off"],
                ["replace", "Different hours"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="border-border hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-accent/60 flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors"
              >
                <input
                  type="radio"
                  name="kind"
                  value={value}
                  checked={kind === value}
                  onChange={() => setKind(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {kind === "replace" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="exception-start">From</Label>
            <Input id="exception-start" name="startTime" type="time" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="exception-end">Until</Label>
            <Input id="exception-end" name="endTime" type="time" required />
          </div>
        </div>
      ) : null}

      {state && "error" in state ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Adding…" : "Add exception"}
      </Button>
    </form>
  );
}
