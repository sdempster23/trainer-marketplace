"use client";

import { useActionState, useEffect, useState } from "react";

import { updateDisplayName } from "@/app/(account)/actions";
import type { DisplayNameActionState } from "@/app/(account)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/validators/profile";

/**
 * The /account "Your name" field — role-universal (owners name themselves for
 * trainers; trainers get their first post-onboarding way to edit their listed
 * name). A FIELD, not a page: value + Edit toggle swapping to input + Save/
 * Cancel, the row-component pattern in miniature. Success closes the editor;
 * revalidation refreshes the displayed value.
 */
export function DisplayNameEditor({
  displayName,
}: {
  displayName: string | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [state, formAction, isPending] = useActionState<
    DisplayNameActionState,
    FormData
  >(updateDisplayName, null);

  useEffect(() => {
    if (state && "success" in state) {
      setIsEditing(false);
    }
  }, [state]);

  if (!isEditing) {
    return (
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="grid gap-0.5">
          <span className="text-muted-foreground">Your name</span>
          <span className={displayName ? "font-medium" : "text-muted-foreground italic"}>
            {displayName ?? "Not set"}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsEditing(true)}
        >
          Edit
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 text-sm">
      <span className="text-muted-foreground">Your name</span>
      <div className="flex gap-2">
        <Input
          name="displayName"
          required
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          defaultValue={displayName ?? ""}
          placeholder="How owners and trainers will see you"
        />
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsEditing(false)}
        >
          Cancel
        </Button>
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-destructive text-xs">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
