import { SignUpForm } from "@/components/auth/sign-up-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { safeInternalPath } from "@/lib/auth/safe-internal-path";
import { parseSignupRoleParam } from "@/lib/validators/auth";

export const metadata = { title: "Create your account — PawMatch" };

/**
 * SERVER page: owns the title, the h1, and the ONE validation of both
 * query params. `?role=` carries intent from the CTA ("Join as a trainer"
 * sends role=trainer) and is allowlisted against SIGNUP_ROLES; anything
 * else preselects nothing. `?next=` is the destination a visitor was
 * carrying when they switched here from /login (or will carry back);
 * only a same-origin path survives. The client form receives validated
 * values or null, never the raw params. The action re-validates both.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string | string[]; next?: string | string[] }>;
}) {
  const { role, next: rawNext } = await searchParams;
  const presetRole = parseSignupRoleParam(role);
  const next = safeInternalPath(Array.isArray(rawNext) ? null : (rawNext ?? null));

  return (
    <main className="bg-muted flex flex-1 items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle as="h1">Create your account</CardTitle>
          <CardDescription>
            Join PawMatch as a dog owner or a trainer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm presetRole={presetRole} next={next} />
        </CardContent>
      </Card>
    </main>
  );
}
