"use client";

import { useActionState, useEffect, useState } from "react";

import {
  updatePaymentInfo,
  type PaymentInfoState,
} from "@/app/(trainer)/actions";
import { EmptyState } from "@/components/shared/states";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_INSTRUCTIONS_MAX_LENGTH } from "@/lib/validators/payment";

/**
 * The trainer's payment-info editor (/account, trainer fork). Free-text
 * instructions + Venmo/PayPal usernames (NOT links — the app builds the href).
 * Shown to an owner only after they have a CONFIRMED booking (M17 RLS).
 */
export function PaymentInfoEditor({
  instructions,
  venmo,
  paypal,
}: {
  instructions: string | null;
  venmo: string | null;
  paypal: string | null;
}) {
  const [state, formAction, isPending] = useActionState<
    PaymentInfoState,
    FormData
  >(updatePaymentInfo, null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (state && "success" in state) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 3000);
      return () => clearTimeout(t);
    }
  }, [state]);

  const hasInfo = Boolean(instructions || venmo || paypal);

  return (
    <form action={formAction} className="flex flex-col gap-4 text-sm">
      {/* Gate addition A: the zero state is a designed object, not blank
          inputs — a trainer must KNOW clients can't pay them yet. The
          affordance is the form itself, right below. */}
      {!hasInfo ? (
        <EmptyState compact>
          Clients can&apos;t pay you yet — fill this in and every confirmed
          booking will show it.
        </EmptyState>
      ) : null}
      <p className="text-muted-foreground">
        Clients who book you will see this after you confirm. PawMatch never
        handles the money — you arrange payment directly.
      </p>

      <div className="grid gap-2">
        <Label htmlFor="pay-instructions">How you take payment</Label>
        <Textarea
          id="pay-instructions"
          name="instructions"
          maxLength={PAYMENT_INSTRUCTIONS_MAX_LENGTH}
          defaultValue={instructions ?? ""}
          rows={2}
          placeholder="e.g. Venmo preferred, or cash at the session."
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="pay-venmo">Venmo username</Label>
          <Input
            id="pay-venmo"
            name="venmo"
            defaultValue={venmo ?? ""}
            placeholder="casey-trains"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pay-paypal">PayPal.Me username</Label>
          <Input
            id="pay-paypal"
            name="paypal"
            defaultValue={paypal ?? ""}
            placeholder="caseytrains"
            autoComplete="off"
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Just the username, not a full link — we build the link for you.
      </p>

      {state && "error" in state ? (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {isPending ? "Saving…" : "Save payment info"}
        </Button>
        {saved ? <span className="text-muted-foreground">Saved ✓</span> : null}
      </div>
    </form>
  );
}
