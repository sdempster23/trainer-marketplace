"use client";

import { useActionState, useState } from "react";

import { deleteDog, updateDog } from "@/app/(owner)/actions";
import type { DogActionState } from "@/app/(owner)/actions";
import { DogForm } from "@/components/owner/dog-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ActiveDog } from "@/lib/owner/dogs";
import { formatBirthDate } from "@/lib/utils/format-date";

/**
 * One dog on the management page — the ServiceRow pattern verbatim: display
 * row with Edit (swaps to the shared DogForm prefilled; client state only)
 * and a two-step Delete (arm → Confirm/Keep; the delete is SOFT).
 */
export function DogRow({ dog }: { dog: ActiveDog }) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <Card>
        <CardContent className="pt-6">
          <DogForm
            action={updateDog}
            submitLabel="Save changes"
            dogId={dog.id}
            initial={{
              name: dog.name,
              breed: dog.breed ?? "",
              dateOfBirth: dog.date_of_birth ?? "", // already YYYY-MM-DD
              temperamentNotes: dog.temperament_notes ?? "",
            }}
            onSuccess={() => setIsEditing(false)}
            onCancel={() => setIsEditing(false)}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{dog.name}</span>
            {dog.breed || dog.date_of_birth ? (
              <span className="text-muted-foreground text-sm">
                {dog.breed}
                {dog.breed && dog.date_of_birth ? " · " : ""}
                {dog.date_of_birth
                  ? `Born ${formatBirthDate(dog.date_of_birth)}`
                  : ""}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
            <DeleteDogButton dogId={dog.id} />
          </div>
        </div>
        {dog.temperament_notes ? (
          <p className="text-muted-foreground text-sm">
            {dog.temperament_notes}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DeleteDogButton({ dogId }: { dogId: string }) {
  const [isArmed, setIsArmed] = useState(false);
  const [state, formAction, isPending] = useActionState<
    DogActionState,
    FormData
  >(deleteDog, null);

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
      <input type="hidden" name="dogId" value={dogId} />
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
