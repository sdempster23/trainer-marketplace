import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Shown after signup when email confirmation is ENABLED (the signup action
 * redirects here when no session comes back). Dormant while confirmation is off
 * — signup returns a session and lands the user straight in /account instead.
 * Built now so the confirmation-on path is complete, not half-wired.
 */
export default function CheckEmailPage() {
  return (
    <main className="bg-muted flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription>
            We sent you a confirmation link. Click it to activate your account,
            then log in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Already confirmed?{" "}
            <Link href="/login" className="text-primary underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
