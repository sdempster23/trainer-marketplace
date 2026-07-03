import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/(auth)/actions";
import { DisplayNameEditor } from "@/components/account/display-name-editor";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getActiveDogs } from "@/lib/owner/dogs";
import {
  getOnboardingState,
  type OnboardingState,
} from "@/lib/trainer/onboarding";

/**
 * Trainer onboarding CTA copy, keyed by onboarding state. Owners never see this
 * (it's only computed for role='trainer'); it's what makes the path from
 * "signed up as a trainer" to "listed" discoverable from /account.
 */
const TRAINER_CTA: Record<
  OnboardingState,
  { title: string; body: string; cta: string; href: string }
> = {
  none: {
    title: "Complete your trainer profile",
    body: "Add your details so dog owners can find you.",
    cta: "Complete profile",
    href: "/trainer/onboarding",
  },
  partial: {
    title: "Finish your trainer listing",
    body: "You're almost there — add your specialties to go live.",
    cta: "Finish listing",
    href: "/trainer/onboarding",
  },
  complete: {
    title: "You're listed as a trainer ✓",
    body: "Dog owners can find you. View or edit your listing.",
    cta: "View listing",
    href: "/trainer/listing",
  },
};

/**
 * Placeholder authed landing — proves the auth round-trip end-to-end (signup/
 * login → session → server-side profile read). NOT a real dashboard; the
 * owner/trainer surfaces come later.
 *
 * This is also the first PROTECTED route, demonstrating the gating split: the
 * middleware only REFRESHES the session; a protected Server Component does its
 * OWN check and redirects. getClaims() per current Supabase guidance.
 */
export default async function AccountPage() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    redirect("/login");
  }

  // Role lives in the profiles table (created by the M1 trigger at signup), not
  // in the JWT. Read it under the user's own RLS ("Users read their own
  // profile"). Typed against the Database generic — profile.role is user_role.
  // maybeSingle(): 0 rows -> null data (no thrown error to ignore), so the
  // "no profile" case is handled explicitly below rather than swallowed.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", claims.sub)
    .maybeSingle();

  // A signed-in user should ALWAYS have a profile (the M1 trigger creates it in
  // the same transaction as the auth.users insert). If it's somehow absent — or
  // the read failed — surface a clear problem state with an escape hatch rather
  // than rendering a misleading "role: unknown" success page.
  if (!profile) {
    return (
      <main className="bg-muted flex min-h-screen items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Profile unavailable</CardTitle>
            <CardDescription>
              You&apos;re signed in, but we couldn&apos;t load your profile. Try
              signing out and back in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={signOut}>
              <Button type="submit" variant="outline" className="w-full">
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  // /account is the role-forked hub — the fork, kept legible: trainers get
  // the onboarding-state CTA, owners get the dogs CTA, each computed ONLY for
  // its role so neither pays for the other's queries. The name section below
  // is the role-universal part.
  const trainerCta =
    profile.role === "trainer"
      ? TRAINER_CTA[await getOnboardingState(supabase, claims.sub)]
      : null;

  // Dog count via getActiveDogs (not a bare head-count query): the count must
  // respect the same deleted_at view spec as every dogs read, and the helper
  // is the single place that rule lives — a separate count query would be a
  // second, forgettable query site.
  const ownerDogs =
    profile.role === "owner"
      ? (await getActiveDogs(supabase, claims.sub)).dogs
      : null;

  return (
    <main className="bg-muted flex min-h-screen items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-md flex-col gap-6">
        {trainerCta ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{trainerCta.title}</CardTitle>
              <CardDescription>{trainerCta.body}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href={trainerCta.href}>{trainerCta.cta}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {ownerDogs !== null ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Your dogs</CardTitle>
              <CardDescription>
                {ownerDogs.length === 0
                  ? "Add your dog's profile to get ready for booking."
                  : `${ownerDogs.length} ${ownerDogs.length === 1 ? "dog" : "dogs"} on your profile.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/owner/dogs">
                  {ownerDogs.length === 0 ? "Add your dog" : "Manage dogs"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">You&apos;re signed in</CardTitle>
            <CardDescription>
              The auth round-trip works: session established, profile read
              server-side.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <DisplayNameEditor displayName={profile.display_name} />

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="font-medium capitalize">{profile.role}</dd>
              <dt className="text-muted-foreground">User ID</dt>
              <dd className="font-mono text-xs break-all">{claims.sub}</dd>
            </dl>

            <form action={signOut}>
              <Button type="submit" variant="outline" className="w-full">
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
