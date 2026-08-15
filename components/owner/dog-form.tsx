"use client";

import { useActionState, useEffect, useRef } from "react";

import type { DogActionState } from "@/app/(owner)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DOG_BREED_MAX_LENGTH,
  DOG_NAME_MAX_LENGTH,
  DOG_NOTES_MAX_LENGTH,
} from "@/lib/validators/dog";

export type DogFormInitial = {
  name: string;
  breed: string;
  /** Already YYYY-MM-DD — the date column's wire format IS the date input's
   * value format, so prefill needs no conversion. */
  dateOfBirth: string;
  temperamentNotes: string;
};

/**
 * ONE form for create and edit — the ServiceForm pattern verbatim: action as
 * a prop, edit mode adds the hidden dogId + prefill + Cancel, the { success }
 * sentinel resets (create) or closes (edit).
 */
export function DogForm({
  action,
  submitLabel,
  dogId,
  initial,
  onSuccess,
  onCancel,
}: {
  action: (
    prev: DogActionState,
    formData: FormData,
  ) => Promise<DogActionState>;
  submitLabel: string;
  dogId?: string;
  initial?: DogFormInitial;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [state, formAction, isPending] = useActionState<
    DogActionState,
    FormData
  >(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "success" in state) {
      formRef.current?.reset();
      onSuccess?.();
    }
  }, [state, onSuccess]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {dogId ? <input type="hidden" name="dogId" value={dogId} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`dog-name-${dogId ?? "new"}`}>Name</Label>
          <Input
            id={`dog-name-${dogId ?? "new"}`}
            name="name"
            required
            maxLength={DOG_NAME_MAX_LENGTH}
            placeholder="Riley"
            defaultValue={initial?.name}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`dog-breed-${dogId ?? "new"}`}>
            Breed<span className="text-muted-foreground font-normal"> · optional</span>
          </Label>
          <Input
            id={`dog-breed-${dogId ?? "new"}`}
            name="breed"
            maxLength={DOG_BREED_MAX_LENGTH}
            placeholder="Belgian Malinois mix"
            defaultValue={initial?.breed}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`dog-dob-${dogId ?? "new"}`}>
          Date of birth<span className="text-muted-foreground font-normal"> · optional</span>
        </Label>
        <Input
          id={`dog-dob-${dogId ?? "new"}`}
          name="dateOfBirth"
          type="date"
          max={today}
          defaultValue={initial?.dateOfBirth}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`dog-notes-${dogId ?? "new"}`}>
          Temperament notes<span className="text-muted-foreground font-normal"> · optional</span>
        </Label>
        <Textarea
          id={`dog-notes-${dogId ?? "new"}`}
          name="temperamentNotes"
          rows={4}
          maxLength={DOG_NOTES_MAX_LENGTH}
          placeholder="Reactive on leash, food-motivated, great with kids."
          defaultValue={initial?.temperamentNotes}
        />
      </div>

      {state && "error" in state ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
