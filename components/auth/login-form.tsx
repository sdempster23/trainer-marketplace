"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn, type AuthActionState } from "@/app/(app)/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hrefWithNext } from "@/lib/auth/safe-internal-path";

/**
 * The login form — client leaf of /login. `next` arrives ALREADY validated
 * by the server page (safeInternalPath), rides the form as a hidden field
 * (the signIn action validates it again; this component never trusts it),
 * and is carried onto the "Sign up" link so a visitor who came from
 * "Log in to message" keeps their destination if they switch forms.
 */
export function LoginForm({ next }: { next: string | null }) {
  const [state, formAction, isPending] = useActionState<
    AuthActionState,
    FormData
  >(signIn, null);

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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {state?.error ? (
          <p role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" disabled={isPending}>
          {isPending ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        Don&apos;t have an account?{" "}
        <Link href={hrefWithNext("/sign-up", next)} className="text-primary underline">
          Sign up
        </Link>
      </p>
    </>
  );
}
