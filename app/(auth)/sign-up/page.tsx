"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp, type AuthActionState } from "@/app/(auth)/actions";
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
import { SIGNUP_ROLES } from "@/lib/validators/auth";

const ROLE_COPY: Record<(typeof SIGNUP_ROLES)[number], string> = {
  owner: "I have a dog and want to find a trainer",
  trainer: "I'm a trainer offering my services",
};

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState<
    AuthActionState,
    FormData
  >(signUp, null);

  return (
    <main className="bg-muted flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>
            Join PawMatch as a dog owner or a trainer.
          </CardDescription>
        </CardHeader>
        <CardContent>
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

            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
              />
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Sign up as…</legend>
              <div className="grid gap-2">
                {SIGNUP_ROLES.map((role, index) => (
                  <label
                    key={role}
                    className="border-border hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-accent/60 flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors"
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role}
                      defaultChecked={index === 0}
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
            </fieldset>

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
            <Link href="/login" className="text-primary underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
