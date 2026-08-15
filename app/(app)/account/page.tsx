import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/(app)/(auth)/actions";
import { CalendarFeedManager } from "@/components/account/calendar-feed-manager";
import { ExternalCalendarManager } from "@/components/account/external-calendar-manager";
import { PaymentInfoEditor } from "@/components/account/payment-info-editor";
import { DisplayNameEditor } from "@/components/account/display-name-editor";
import { getExternalCalendarStatus } from "@/lib/trainer/external-calendar-status";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { getPendingRequestCount } from "@/lib/trainer/bookings";
import { getUnreadThreadCount } from "@/lib/messages/threads";
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
    title: "You're listed as a trainer",
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
      <main className="bg-muted flex flex-1 items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Profile unavailable</CardTitle>
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

  // BLOCKING name step (front-door arc): a nameless user is bounced to
  // /welcome and cannot reach the hub until they set a name. This is the
  // chokepoint that makes the name step "no skip" — the funnel's landing.
  // The DisplayNameEditor's "Not set" state below is now defense-in-depth,
  // no longer a normal state.
  if (!profile.display_name) {
    redirect("/welcome");
  }

  // /account is the role-forked hub — the fork, kept legible: trainers get
  // the onboarding-state CTA, owners get the dogs CTA, each computed ONLY for
  // its role so neither pays for the other's queries. The name section below
  // is the role-universal part. The role-forked read and the unread count
  // are independent, so they run CONCURRENTLY — one round-trip of latency,
  // not two stacked.
  //
  // Dog count via getActiveDogs (not a bare head-count query): the count must
  // respect the same deleted_at view spec as every dogs read, and the helper
  // is the single place that rule lives. Unread via getUnreadThreadCount —
  // the priced app-side shape (one slim query, the pure authority derives
  // per thread); only participants can have threads, so admin skips it, and
  // it returns 0 on error by contract (the hub link degrades to countless,
  // never breaks).
  // Feed status is trainer-only row METADATA (created/rotated — never the
  // token; only its hash exists anywhere). RLS scopes the read to the
  // caller's own row; maybeSingle() because row absence is the M15
  // first-class "feed not enabled" state, not an error. A FAILED read is
  // NOT absence (review finding): "unknown" makes the manager degrade to
  // read-only instead of offering Generate — which is the rotate RPC —
  // against a feed that may exist.
  // External-calendar status is the M16 import card's read: metadata + a
  // block count, same tri-state "failed read ≠ absence" discipline as the
  // feed card (a swallowed error would offer paste-over — a destructive
  // replace — against a subscription that may exist). The url column is
  // never selected (it's granted to no api role anyway).
  const [
    trainerCta,
    ownerDogs,
    unreadCount,
    pendingRequests,
    feedStatus,
    externalCalendar,
    paymentInfo,
  ] = await Promise.all([
      profile.role === "trainer"
        ? getOnboardingState(supabase, claims.sub).then((s) => TRAINER_CTA[s])
        : Promise.resolve(null),
      profile.role === "owner"
        ? getActiveDogs(supabase, claims.sub).then((r) => r.dogs)
        : Promise.resolve(null),
      profile.role === "owner" || profile.role === "trainer"
        ? getUnreadThreadCount(supabase, claims.sub)
        : Promise.resolve(0),
      // Flow ruling #4: a request must be visible from the hub the way
      // unread messages are (email was the only signal before).
      profile.role === "trainer"
        ? getPendingRequestCount(supabase, claims.sub)
        : Promise.resolve(0),
      profile.role === "trainer"
        ? supabase
            .from("trainer_feed_tokens")
            .select("created_at, rotated_at")
            .eq("trainer_id", claims.sub)
            .maybeSingle()
            .then((r) => {
              if (r.error) {
                console.error("[FEED] status read failed:", r.error.message);
                return { status: "unknown" as const, row: null };
              }
              return {
                status: r.data ? ("enabled" as const) : ("disabled" as const),
                row: r.data,
              };
            })
        : Promise.resolve(null),
      profile.role === "trainer"
        ? getExternalCalendarStatus(supabase, claims.sub)
        : Promise.resolve(null),
      // The trainer's own payment info (own-row RLS). Metadata read; the
      // owner-facing render lives on the CONFIRMED-booking path.
      profile.role === "trainer"
        ? supabase
            .from("trainer_payment_info")
            .select("instructions, venmo_handle, paypal_handle")
            .eq("trainer_id", claims.sub)
            .maybeSingle()
            .then((r) => r.data)
        : Promise.resolve(null),
    ]);
  // The shell header carries Messages (+ unread badge); the hub's old
  // per-card Messages buttons were pure duplication and are gone. unreadCount
  // stays fetched: cache() dedupes it with the header's own call, and the
  // subhead uses it for the one-line "what's waiting" summary.
  const waiting: string[] = [];
  if (pendingRequests > 0) {
    waiting.push(
      `${pendingRequests} booking ${pendingRequests === 1 ? "request" : "requests"}`,
    );
  }
  if (unreadCount > 0) {
    // getUnreadThreadCount counts CONVERSATIONS, not messages — say so
    // (review catch: "1 new message" for a 5-message thread is untrue).
    waiting.push(
      `${unreadCount} unread ${unreadCount === 1 ? "conversation" : "conversations"}`,
    );
  }

  return (
    <main className="bg-muted flex-1 px-6 py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader title="Your account">
          {waiting.length > 0
            ? `Waiting on you: ${waiting.join(" · ")}.`
            : "Your profile, your settings, and where to go next."}
        </PageHeader>
        {trainerCta ? (
          <Card>
            <CardHeader>
              <CardTitle>{trainerCta.title}</CardTitle>
              <CardDescription>{trainerCta.body}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {/* The hub's ONE amber (map ruling): the trainer's next step.
                  The embedded card submits are demoted to outline. */}
              <Button asChild variant="action" className="w-full">
                <Link href={trainerCta.href}>{trainerCta.cta}</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/trainer/bookings" className="flex items-center">
                  Your bookings
                  {pendingRequests > 0 ? (
                    <Badge variant="strong">{pendingRequests}</Badge>
                  ) : null}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {profile.role === "trainer" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Calendar feed</CardTitle>
              <CardDescription>
                Your PawMatch bookings, in the calendar you already use.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CalendarFeedManager
                status={feedStatus?.status ?? "disabled"}
                createdAt={feedStatus?.row?.created_at ?? null}
                rotatedAt={feedStatus?.row?.rotated_at ?? null}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your calendar</CardTitle>
              <CardDescription>
                Block PawMatch slots with the times you&apos;re already busy.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExternalCalendarManager
                status={externalCalendar?.status ?? "none"}
                lastFetchedAt={externalCalendar?.lastFetchedAt ?? null}
                failingSince={externalCalendar?.failingSince ?? null}
                // null must SURVIVE to the card: it means the count read
                // FAILED, and coalescing it to 0 renders the exact "no busy
                // times" false all-clear the status helper documents
                // against (investigation bug-class fix).
                blockCount={externalCalendar?.blockCount ?? null}
              />
            </CardContent>
          </Card>

          {/* Payment spans the grid: its two-column handle row needs the
              width, and it's the card confirmed bookings depend on. */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Payment</CardTitle>
              <CardDescription>
                How your clients pay you — off-platform, your way.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentInfoEditor
                instructions={paymentInfo?.instructions ?? null}
                venmo={paymentInfo?.venmo_handle ?? null}
                paypal={paymentInfo?.paypal_handle ?? null}
              />
            </CardContent>
          </Card>
        </div>
        ) : null}

        {ownerDogs !== null ? (
          <Card>
            <CardHeader>
              <CardTitle>Your dogs</CardTitle>
              <CardDescription>
                {ownerDogs.length === 0
                  ? "Add your dog's profile to get ready for booking."
                  : `${ownerDogs.length} ${ownerDogs.length === 1 ? "dog" : "dogs"} on your profile.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button asChild className="w-full">
                <Link href="/owner/dogs">
                  {ownerDogs.length === 0 ? "Add your dog" : "Manage dogs"}
                </Link>
              </Button>
              {/* Smallest honest bookings entry: one link, zero queries —
                  the list page owns its own empty state. */}
              <Button asChild variant="outline" className="w-full">
                <Link href="/owner/bookings">Your bookings</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* The dev scaffold ("auth round-trip works" + a raw UUID) is
            retired — this is her account page, not our test rig. */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>How you appear across PawMatch.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <DisplayNameEditor displayName={profile.display_name} />

            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">Account type</span>
              <span className="font-medium">
                {profile.role === "trainer"
                  ? "Trainer"
                  : profile.role === "owner"
                    ? "Dog owner"
                    : "Admin"}
              </span>
            </div>

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
