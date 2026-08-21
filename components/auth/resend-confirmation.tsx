"use client";

import { useActionState } from "react";

import { resendConfirmation, type ResendState } from "@/app/(app)/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The check-email page's resend control (the stranger walkthrough exercises
 * this). Takes the email and re-sends the confirmation link. Reports "sent"
 * without revealing whether the address exists (no enumeration oracle).
 */
export function ResendConfirmation() {
  const [state, formAction, isPending] = useActionState<ResendState, FormData>(
    resendConfirmation,
    null,
  );

  if (state && "sent" in state) {
    return (
      <p className="text-muted-foreground text-sm">
        If that address needs confirming, we&apos;ve sent a new link. Check your
        inbox (and spam).
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 text-left">
      <Label htmlFor="resend-email" className="text-sm">
        Didn&apos;t get it? Re-send the link
      </Label>
      <div className="flex gap-2">
        <Input
          id="resend-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {isPending ? "Sending…" : "Re-send"}
        </Button>
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
