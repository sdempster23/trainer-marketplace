"use client";

import { useActionState } from "react";

import {
  setInitialDisplayName,
  type DisplayNameActionState,
} from "@/app/(account)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/validators/profile";

/**
 * The blocking name step. One field + Continue — NO skip button, NO other
 * navigation. Success redirects to /account (handled server-side by the
 * action's redirect()).
 */
export function NameStepForm() {
  const [state, formAction, isPending] = useActionState<
    DisplayNameActionState,
    FormData
  >(setInitialDisplayName, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="displayName">Your name</Label>
        <Input
          id="displayName"
          name="displayName"
          required
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoComplete="name"
          placeholder="How trainers and owners will see you"
          autoFocus
        />
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="action" disabled={isPending}>
        {isPending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
