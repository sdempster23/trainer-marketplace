"use client";

import { useActionState } from "react";

import { updatePassword, type AuthActionState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/lib/validators/auth";

/**
 * The new-password form. Client leaf of /reset-password — the SERVER page
 * gates on a session before rendering this, so by the time it mounts the
 * recovery link has already authenticated the user via /auth/confirm.
 */
export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState<
    AuthActionState,
    FormData
  >(updatePassword, null);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
          required
        />
      </div>

      {state?.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
