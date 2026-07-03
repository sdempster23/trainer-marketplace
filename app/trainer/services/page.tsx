import Link from "next/link";
import { redirect } from "next/navigation";

import { createService } from "@/app/(trainer)/actions";
import { ServiceForm } from "@/components/trainer/service-form";
import { ServiceRow } from "@/components/trainer/service-row";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getOnboardingState } from "@/lib/trainer/onboarding";
import { getActiveServices } from "@/lib/trainer/services";

export const metadata = {
  title: "Your services — PawMatch",
};

/**
 * Services management — the trainer_services write surface. Guarded like the
 * other trainer pages (claims → role → onboarding state): 'none' redirects to
 * onboarding (services attach to the trainers row; without one there is
 * nothing to attach to — mirrors createService's guard), 'partial' and
 * 'complete' both render (specialties and services can arrive in any order).
 *
 * All reads go through getActiveServices — the single point of truth for the
 * services view spec (explicit deleted_at IS NULL; see the helper's
 * access-floor comment). No services query lives on this page.
 */
export default async function TrainerServicesPage() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();
  if (profile?.role !== "trainer") {
    redirect("/account");
  }

  const state = await getOnboardingState(supabase, claims.sub);
  if (state === "none") {
    redirect("/trainer/onboarding");
  }

  const { services, error } = await getActiveServices(supabase, claims.sub);

  return (
    <main className="bg-muted min-h-screen px-6 py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">Your services</h1>
          <p className="text-muted-foreground text-sm">
            What owners can book with you — each with a price, length, and
            where it happens.
          </p>
        </header>

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            Your services couldn&apos;t be loaded. Please refresh to try again.
          </p>
        ) : services.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No services yet — add your first below.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {services.map((service) => (
              <ServiceRow key={service.id} service={service} />
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Add a service</CardTitle>
            <CardDescription>
              Name it the way an owner would look for it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ServiceForm action={createService} submitLabel="Add service" />
          </CardContent>
        </Card>

        <Button asChild variant="outline" className="w-full">
          <Link href="/trainer/listing">Back to your listing</Link>
        </Button>
      </div>
    </main>
  );
}
