import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { safeInternalPath } from "@/lib/auth/safe-internal-path";

export const metadata = { title: "Log in — PawMatch" };

/**
 * SERVER page: owns the title, the h1 (the card IS the page, so its title
 * is the page heading), and the ONE validation of `?next=` — the pre-login
 * destination (e.g. "Log in to message" on a trainer page). Only a
 * same-origin path survives; the client form and its links receive the
 * validated value or null, never the raw param.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeInternalPath(Array.isArray(rawNext) ? null : (rawNext ?? null));

  return (
    <main className="bg-muted flex flex-1 items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle as="h1">Log in</CardTitle>
          <CardDescription>Welcome back to PawMatch.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </main>
  );
}
