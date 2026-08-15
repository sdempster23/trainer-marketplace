"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { requestPasswordReset, type ResendState } from "@/app/(auth)/actions";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Forgot-password request page (launch-gate ruling 3). The success state
 * deliberately never reveals whether the address has an account — same
 * posture as the check-email page's resend control.
 */
export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState<ResendState, FormData>(
    requestPasswordReset,
    null,
  );

  // Same single-use-token discipline as the sign-up page: after any failed
  // submit, reset the widget so the retry mints a fresh token.
  const [turnstileReset, setTurnstileReset] = useState(0);
  useEffect(() => {
    if (state && "error" in state) setTurnstileReset((n) => n + 1);
  }, [state]);

  return (
    <main className="bg-muted flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Enter the email you signed up with and we&apos;ll send you a reset
            link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state && "sent" in state ? (
            <p className="text-sm" role="status">
              If an account exists for that address, a reset link is on its
              way. Check your inbox (and spam folder) — the link is valid for
              one hour.
            </p>
          ) : (
            <form action={formAction} className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </div>

              {/* Bot gate (review finding): an ungated reset form is a free
                  mailbox-bombing endpoint. Verified server-side, fails
                  closed — same posture as signup. */}
              <TurnstileWidget resetSignal={turnstileReset} />

              {state?.error ? (
                <p role="alert" className="text-destructive text-sm">
                  {state.error}
                </p>
              ) : null}

              <Button type="submit" disabled={isPending}>
                {isPending ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}

          <p className="text-muted-foreground mt-6 text-center text-sm">
            Remembered it?{" "}
            <Link href="/login" className="text-primary underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
