import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ServicesManager } from "@/components/trainer/services-manager";
import { Button } from "@/components/ui/button";
import { geistMono } from "@/lib/fonts";
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
    <main className={`bg-muted flex-1 px-6 py-12 ${geistMono.variable}`}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader title="Your services">
            What owners can book with you — each with a price, length, and
            where it happens.
        </PageHeader>

        {error ? (
          <ErrorState>
            Your services couldn&apos;t be loaded. Please refresh to try again.
          </ErrorState>
        ) : services.length === 0 ? (
          <EmptyState>No services yet — add your first below.</EmptyState>
        ) : null}

        <ServicesManager services={error ? [] : services} />

        {/* Lateral nav replaces the Back-to chain (shell carries Account). */}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild variant="outline" className="w-full">
            <Link href="/trainer/availability">Manage availability</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/trainer/listing">Your listing</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
