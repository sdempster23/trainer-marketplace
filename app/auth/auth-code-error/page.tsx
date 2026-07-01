import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Fallback for a failed email OTP confirmation — the confirm route redirects
 * here when `token_hash`/`type` are missing or verifyOtp fails (typically an
 * expired or already-used link). Static; no session context needed.
 */
export default function AuthCodeErrorPage() {
  return (
    <main className="bg-muted flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">Link invalid or expired</CardTitle>
          <CardDescription>
            This confirmation link couldn&apos;t be verified. It may have
            expired or already been used. Request a new one by logging in or
            signing up again.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <Link href="/login" className="text-primary underline">
            Go to log in
          </Link>
          <Link href="/sign-up" className="text-primary underline">
            Create a new account
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
