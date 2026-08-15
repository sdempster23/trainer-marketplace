import { redirect } from "next/navigation";

import { createDog } from "@/app/(owner)/actions";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { DogForm } from "@/components/owner/dog-form";
import { DogRow } from "@/components/owner/dog-row";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getActiveDogs } from "@/lib/owner/dogs";

export const metadata = {
  title: "Your dogs — PawMatch",
};

/**
 * Dog-profile management — the owner-side twin of /trainer/services, and the
 * first /owner/* page (role-scoped pages carry their role prefix; owner
 * surfaces multiply in the booking arc). Guarded like the trainer pages:
 * claims → role — but NO onboarding-state concept for owners; a signed-in
 * owner renders (dogs attach to the profiles row signup minted).
 *
 * All reads via getActiveDogs — the single point of truth for the dogs view
 * spec (explicit deleted_at IS NULL; the helper's access-floor comment).
 */
export default async function OwnerDogsPage() {
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
  if (profile?.role !== "owner") {
    redirect("/account");
  }

  const { dogs, error } = await getActiveDogs(supabase, claims.sub);

  return (
    <main className="bg-muted flex-1 px-6 py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader title="Your dogs">
            Trainers see this when you book — name, breed, age, and what they
            should know before the first session.
        </PageHeader>

        {error ? (
          <ErrorState>
            Your dogs couldn&apos;t be loaded. Please refresh to try again.
          </ErrorState>
        ) : dogs.length === 0 ? (
          // Copy kept verbatim (investigation: second-best empty state).
          <EmptyState>No dogs yet — add your first below.</EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {dogs.map((dog) => (
              <DogRow key={dog.id} dog={dog} />
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Add a dog</CardTitle>
            <CardDescription>
              Only the name is required — the rest helps trainers prepare.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DogForm action={createDog} submitLabel="Add dog" />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
