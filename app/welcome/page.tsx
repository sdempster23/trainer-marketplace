import { redirect } from "next/navigation";

import { signOut } from "@/app/(auth)/actions";
import { NameStepForm } from "@/components/account/name-step-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

/**
 * The blocking name step (front-door arc). A freshly verified/signed-up user
 * whose profile has no display_name lands here and cannot proceed until they
 * set one — /account bounces nameless users back here, and this page has NO
 * skip and NO navigation away. Once named, they never see it again (it
 * redirects straight to /account when a name is already set).
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  // Already named (or the row is missing): nothing to do here.
  if (profile?.display_name) {
    redirect("/account");
  }

  return (
    <main className="bg-muted flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>One last thing</CardTitle>
          <CardDescription>
            What should people see you as? Owners and trainers you book or
            message will see this name.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <NameStepForm />
          {/* Escape hatch — the ONLY way off this blocking step besides
              setting a name. Without it, a user whose name-write repeatedly
              fails (e.g. a missing profiles row) would be trapped with no
              navigation. Signing out returns them to a clean state. */}
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-muted-foreground w-full"
            >
              Sign out instead
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
