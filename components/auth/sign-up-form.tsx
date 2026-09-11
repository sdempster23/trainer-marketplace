"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { signUp, type AuthActionState } from "@/app/(app)/(auth)/actions";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hrefWithNext } from "@/lib/auth/safe-internal-path";
import {
  PASSWORD_MIN_LENGTH,
  SIGNUP_ROLES,
  type SignupRole,
} from "@/lib/validators/auth";

const ROLE_COPY: Record<SignupRole, string> = {
  owner: "I have a dog and want to find a trainer",
  trainer: "I'm a trainer offering my services",
};

/** Shane's wording (tier-1 fix, 2026-09-06): the account type is immutable
 * after signup (M11 trigger), so the consequence is stated at the choice. */
const ROLE_CONSEQUENCE = "Account type is permanent — choose the one that fits.";

/** Persistent guidance beneath the password field (a placeholder vanishes
 * on the first keystroke — exactly when a too-short password needs it).
 * Built from the SAME constant the server action's zod schema enforces. */
const PASSWORD_GUIDANCE = `At least ${PASSWORD_MIN_LENGTH} characters.`;

/**
 * The signup form — client leaf of /sign-up. Both props arrive ALREADY
 * validated by the server page: `presetRole` through the SIGNUP_ROLES
 * allowlist (only ever picks which radio STARTS checked; the action
 * re-validates the submitted field), `next` through safeInternalPath
 * (hidden field + the "Log in" link, so switching forms keeps the
 * destination; the action validates it again).
 */
export function SignUpForm({
  presetRole,
  next,
}: {
  presetRole: SignupRole | null;
  next: string | null;
}) {
  const [state, formAction, isPending] = useActionState<
    AuthActionState,
    FormData
  >(signUp, null);

  // A Turnstile token is single-use: after ANY failed submit (email taken,
  // weak password, or a Turnstile miss), reset the widget so the retry mints
  // a fresh token instead of re-sending the spent one.
  const [turnstileReset, setTurnstileReset] = useState(0);
  useEffect(() => {
    if (state && "error" in state) setTurnstileReset((n) => n + 1);
  }, [state]);

  return (
    <>
      <form action={formAction} className="flex flex-col gap-6">
        {next ? <input type="hidden" name="next" value={next} /> : null}
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

        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          {/* minLength is browser UX only — it stops a short password AT
              this field (before the consent box gets the blame) — and is
              sourced from PASSWORD_MIN_LENGTH so it cannot drift from the
              server rule. The action's signUpSchema remains the real gate. */}
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            aria-describedby="password-guidance"
            required
          />
          <p id="password-guidance" className="text-muted-foreground text-xs">
            {PASSWORD_GUIDANCE}
          </p>
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Sign up as…</legend>
          {/* NO positional default: nothing is checked unless the
              allowlisted ?role= preset says so. An unchecked group is
              absent from FormData and fails server validation with the
              "choose" message. `required` is browser UX only. */}
          <div className="grid gap-2">
            {SIGNUP_ROLES.map((role) => (
              <label
                key={role}
                className="border-border hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-accent/60 flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors"
              >
                <input
                  type="radio"
                  name="role"
                  value={role}
                  defaultChecked={role === presetRole}
                  required
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium capitalize">
                    {role}
                  </span>
                  <span className="text-muted-foreground block">
                    {ROLE_COPY[role]}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">{ROLE_CONSEQUENCE}</p>
        </fieldset>

        {/* Consent (launch-gate ruling 5): checkbox, UNCHECKED by
            default — agree-by-signup was explicitly rejected. The
            server action re-validates; `required` here is just UX.
            Links open in a new tab so the half-filled form survives. */}
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-0.5"
          />
          <span className="text-muted-foreground">
            I&apos;m 18 or older and agree to the{" "}
            <Link
              href="/terms"
              target="_blank"
              className="text-primary underline"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              target="_blank"
              className="text-primary underline"
            >
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        {/* Bot gate — the token rides the form to the action, which
            verifies it server-side (fails closed + visible). Reset on a
            failed submit so the single-use token doesn't block retries. */}
        <TurnstileWidget resetSignal={turnstileReset} />

        {state?.error ? (
          <p role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        Already have an account?{" "}
        <Link href={hrefWithNext("/login", next)} className="text-primary underline">
          Log in
        </Link>
      </p>
    </>
  );
}
