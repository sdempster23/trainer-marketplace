import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

/**
 * Set-new-password page — the landing of the recovery email's link, which
 * /auth/confirm (type=recovery) has just exchanged for a session. SERVER
 * component so the session gate runs before any form renders: no session →
 * the link was expired, already used, or opened in a different browser, and
 * the only honest offer is a fresh link. (Rendering the form anyway would
 * just fail at updateUser — this fails earlier and clearer.)
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const hasSession = Boolean(data?.claims);

  return (
    <main className="bg-muted flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        {hasSession ? (
          <>
            <CardHeader>
              <CardTitle>Choose a new password</CardTitle>
              <CardDescription>
                You&apos;re verified — set the new password for your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResetPasswordForm />
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>
                This link didn&apos;t work
              </CardTitle>
              <CardDescription>
                Your reset link is expired or invalid — links are valid for
                one hour and can only be used once.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                <Link href="/forgot-password" className="text-primary underline">
                  Request a new link
                </Link>{" "}
                and try again.
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
