import Link from "next/link";
import { redirect } from "next/navigation";

import {
  CancelBookingButton,
  CompleteBookingButton,
  ConfirmBookingButton,
} from "@/components/bookings/transition-buttons";
import { PageHeader } from "@/components/shared/page-header";
import { MessageButton } from "@/components/messages/message-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { geistMono } from "@/lib/fonts";
import { createClient } from "@/lib/supabase/server";
import {
  getTrainerBookings,
  type TrainerBooking,
} from "@/lib/trainer/bookings";
import { getOnboardingState } from "@/lib/trainer/onboarding";
import { EmptyState, ErrorState } from "@/components/shared/states";
import {
  BOOKING_STATUS_LABELS,
  cancelledByLabel,
  formatBookingStart,
} from "@/lib/validators/booking";
import { formatPrice } from "@/lib/validators/trainer";

export const metadata = { title: "Your bookings — PawMatch" };

/**
 * The trainer's bookings — the surface M11's counterparty read was built
 * for. Times render in the trainer's OWN zone with NO zone caveat: this is
 * THEIR calendar (contrast the owner surfaces, which state the zone because
 * the owner reads someone else's clock).
 *
 * GROUPING, argued from the transition matrix:
 *   Requests          PENDING — Confirm (future starts only: the trigger
 *                     rejects confirming a passed start, so the button is
 *                     ABSENT there, replaced by a "start time passed" note
 *                     — offering a verb that always rejects is worse than
 *                     explaining) + Decline.
 *   Upcoming          CONFIRMED, future — Cancel only. Complete is ABSENT
 *                     before start (same argument: the floor makes it
 *                     always-reject; the button appears exactly when the
 *                     verb becomes legal, on the next render).
 *   Needs completion  CONFIRMED, started — the group the matrix creates:
 *                     completable NOW (the floor is after-START, not
 *                     after-end), still cancellable. Filing these under
 *                     History would hide the one verb waiting to be
 *                     pressed; leaving them in Upcoming would lie.
 *   History           COMPLETED + CANCELLED, with attribution.
 */
export default async function TrainerBookingsPage() {
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

  const { data: trainer } = await supabase
    .from("trainers")
    .select("timezone")
    .eq("id", claims.sub)
    .maybeSingle();
  const tz = trainer?.timezone ?? "UTC";

  const { bookings, error } = await getTrainerBookings(supabase, claims.sub);
  const now = Date.now();
  const isPast = (b: TrainerBooking) => Date.parse(b.starts_at) <= now;

  const requests = bookings.filter((b) => b.status === "PENDING");
  const upcoming = bookings.filter((b) => b.status === "CONFIRMED" && !isPast(b));
  const needsCompletion = bookings.filter(
    (b) => b.status === "CONFIRMED" && isPast(b),
  );
  // List arrives soonest-first; the record reads newest-first. Spread
  // before reversing — the immutability rule, and no shared reference.
  const history = [
    ...bookings.filter(
      (b) => b.status === "COMPLETED" || b.status === "CANCELLED",
    ),
  ].reverse();

  const who = (b: TrainerBooking) =>
    b.profiles?.display_name ?? "An owner"; // NULL-name fallback (investigation flag)

  // The cardBody(b) pattern: one wiring, four status groups — a prop change
  // edits one line, not four.
  const messageButton = (b: TrainerBooking) => (
    <MessageButton counterpartyId={b.owner_id} bookingId={b.id} />
  );

  const cardBody = (b: TrainerBooking) => (
    <div className="flex flex-col gap-1">
      <span className="font-medium">
        {b.trainer_services?.name ?? "Service no longer offered"}
      </span>
      <span className="text-muted-foreground text-sm">
        {who(b)} · {b.dogs?.name ?? "their dog"}
      </span>
      {/* The truthful-numbers line — Geist Mono per the identity. */}
      <span className="text-muted-foreground font-mono text-xs">
        {formatBookingStart(b.starts_at, tz)} · {b.duration_minutes} min ·{" "}
        {formatPrice(b.price_cents)}
      </span>
    </div>
  );

  return (
    // geistMono.variable scopes the data voice to this route (ruling 3:
    // route-level, never root — the homepage H1 is the LCP element).
    <main className={`bg-muted flex-1 px-6 py-12 ${geistMono.variable}`}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <PageHeader title="Your bookings">
            Requests to answer, sessions coming up, and your record.
        </PageHeader>

        {error ? (
          <ErrorState>
            Your bookings couldn&apos;t be loaded. Please refresh to try again.
          </ErrorState>
        ) : bookings.length === 0 ? (
          /* WATCH ITEM: the empty state is her onboarding for the queue —
             a new trainer learns HERE that requests arrive on this page
             and what she'll do with them. */
          <EmptyState
            title="No bookings yet"
            action={
              <Button asChild variant="outline">
                <Link href="/trainer/listing">View your listing</Link>
              </Button>
            }
          >
            Owners find you through the directory. When one requests a
            session it lands here in Requests — you confirm or decline, and
            confirmed sessions move to Upcoming. Confirming is also what
            shows the owner how to pay you, so add your payment details in
            Account to have that step ready.
          </EmptyState>
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <h2 className="font-display flex items-center gap-2 text-lg font-semibold tracking-tight">
                Requests
                {requests.length > 0 ? (
                  <Badge variant="strong">
                    {requests.length}
                    <span className="sr-only"> waiting</span>
                  </Badge>
                ) : null}
              </h2>
              {requests.length === 0 ? (
                /* The keeper, in the object. */
                <EmptyState compact>Nothing waiting on you.</EmptyState>
              ) : (
                requests.map((b) => (
                  <Card key={b.id}>
                    <CardContent className="flex flex-col gap-3 pt-6">
                      <div className="flex items-start justify-between gap-2">
                        {cardBody(b)}
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {messageButton(b)}
                          {isPast(b) ? null : (
                            <ConfirmBookingButton bookingId={b.id} />
                          )}
                          <CancelBookingButton bookingId={b.id} label="Decline" />
                        </div>
                      </div>
                      {isPast(b) ? (
                        <p className="text-muted-foreground text-sm">
                          The start time has passed — this request can only be
                          declined.
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                ))
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-semibold tracking-tight">Upcoming</h2>
              {upcoming.length === 0 ? (
                <EmptyState compact>
                  No confirmed sessions yet — requests you confirm land here.
                </EmptyState>
              ) : (
                upcoming.map((b) => (
                  <Card key={b.id}>
                    <CardContent className="flex items-start justify-between gap-2 pt-6">
                      {cardBody(b)}
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {messageButton(b)}
                        <CancelBookingButton bookingId={b.id} label="Cancel" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </section>

            {needsCompletion.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Needs completion
                </h2>
                <p className="text-muted-foreground text-sm">
                  Sessions past their start time — mark them completed, or
                  cancel if they didn&apos;t happen.
                </p>
                {needsCompletion.map((b) => (
                  <Card key={b.id}>
                    <CardContent className="flex items-start justify-between gap-2 pt-6">
                      {cardBody(b)}
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {messageButton(b)}
                        <CompleteBookingButton bookingId={b.id} />
                        <CancelBookingButton bookingId={b.id} label="Cancel" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </section>
            ) : null}

            <section className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-semibold tracking-tight">History</h2>
              {history.length === 0 ? (
                <EmptyState compact>
                  Completed and cancelled sessions build your record here.
                </EmptyState>
              ) : (
                history.map((b) => (
                  <Card key={b.id}>
                    <CardContent className="flex items-start justify-between gap-2 pt-6">
                      {cardBody(b)}
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <Badge>
                          {b.status === "COMPLETED"
                            ? BOOKING_STATUS_LABELS.COMPLETED
                            : cancelledByLabel(b.cancelled_by, "trainer")}
                        </Badge>
                        {messageButton(b)}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
