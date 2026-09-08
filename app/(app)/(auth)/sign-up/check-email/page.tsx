import Link from "next/link";

import { ResendConfirmation } from "@/components/auth/resend-confirmation";
import { hrefWithNext, safeInternalPath } from "@/lib/auth/safe-internal-path";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Check your email — PawMatch" };

/**
 * Shown after signup when email confirmation is ENABLED (the signup action
 * redirects here when no session comes back). Dormant while confirmation is off
 * — signup returns a session and lands the user straight in /account instead.
 * Built now so the confirmation-on path is complete, not half-wired.
 */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  // The destination signup was carrying. The emailed link itself lands on
  // /account (hosted template hardcodes next=/account); this page's "Log
  // in" is the one place after signup where the value still works.
  const { next: rawNext } = await searchParams;
  const next = safeInternalPath(Array.isArray(rawNext) ? null : (rawNext ?? null));
  return (
    <main className="bg-muted flex flex-1 items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle as="h1">Check your email</CardTitle>
          <CardDescription>
            We sent you a confirmation link. Click it to activate your account,
            then log in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ResendConfirmation />
          <p className="text-muted-foreground text-sm">
            Already confirmed?{" "}
            <Link href={hrefWithNext("/login", next)} className="text-primary underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
