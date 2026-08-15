import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { CancelBookingButton } from "@/components/bookings/transition-buttons";
import { MessageButton } from "@/components/messages/message-button";
import { PaymentDetails } from "@/components/bookings/payment-details";
import { EmptyState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { geistMono } from "@/lib/fonts";
import { createClient } from "@/lib/supabase/server";
import { getOwnerBookings } from "@/lib/owner/bookings";
import {
  BOOKING_STATUS_LABELS,
  formatBookingStart,
} from "@/lib/validators/booking";
import { formatPrice } from "@/lib/validators/trainer";

export const metadata = { title: "Your bookings — PawMatch" };

/**
 * The owner's bookings list — Arc C's read-only landing (createBooking
 * redirects here). Flat, soonest first: a calendar, not a feed. Times render
 * in the TRAINER's zone, stated per row — the same clock the owner just
 * picked from, so the confirmation never contradicts the picker (owner-local
 * labeling is the virtual-session follow-up, a display change only).
 *
 * Cancel (two-step) on PENDING and CONFIRMED rows — Arc D's owner half;
 * cancelled rows show attribution.
 */
export default async function OwnerBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string | string[] }>;
}) {
  const { requested } = await searchParams;
  // Attacker-suppliable; used only as an equality key for the highlight —
  // validate the shape anyway, never interpolate.
  const requestedId =
    typeof requested === "string" && /^[0-9a-f-]{36}$/.test(requested)
      ? requested
      : null;
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

  // The two reads are independent — run them concurrently (one round-trip of
  // latency, not two). Payment info for CONFIRMED bookings (M17): RLS returns
  // ONLY the rows the owner may see (their CONFIRMED-booking trainers), so no
  // extra filtering is needed; map it by trainer_id onto the confirmed cards.
  const [{ bookings, error }, { data: paymentRows }] = await Promise.all([
    getOwnerBookings(supabase, claims.sub),
    supabase
      .from("trainer_payment_info")
      .select("trainer_id, instructions, venmo_handle, paypal_handle"),
  ]);
  const paymentByTrainer = new Map(
    (paymentRows ?? []).map((p) => [p.trainer_id, p]),
  );

  return (
    <main className={`bg-muted flex-1 px-6 py-12 ${geistMono.variable}`}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader title="Your bookings">
            Requests and sessions, soonest first. Times are shown in the
            trainer&apos;s timezone.
        </PageHeader>

        {requestedId && (error || bookings.some((b) => b.id === requestedId)) ? (
          <div className="bg-card border-border rounded-lg border p-4">
            <p className="font-display font-semibold tracking-tight">
              Request sent
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Your trainer has it now. When they confirm, you&apos;ll
              arrange payment directly with them — right here on this page.
              PawMatch never handles the money.
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            Your bookings couldn&apos;t be loaded. Please refresh to try again.
          </p>
        ) : bookings.length === 0 ? (
          // Ruling 1: the view's amber lives HERE, in the empty state —
          // at rest the page has none. Copy survives as title + action.
          <EmptyState
            title="No bookings yet"
            action={
              <Button asChild variant="action">
                <Link href="/trainers">Find a trainer</Link>
              </Button>
            }
          >
            When you book a session, it shows up here — requests first,
            soonest first.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {bookings.map((booking) => (
              <Card
                key={booking.id}
                className={
                  booking.id === requestedId ? "border-primary" : undefined
                }
              >
                <CardContent className="flex flex-col gap-2 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium">
                        {booking.trainer_services?.name ??
                          "Service no longer offered"}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        with{" "}
                        {booking.trainers?.profiles.display_name ?? "a trainer"}{" "}
                        · for {booking.dogs?.name ?? "your dog"}
                      </span>
                    </div>
                    <Badge className="shrink-0">
                      {booking.status === "CANCELLED"
                        ? booking.cancelled_by === "owner"
                          ? "Cancelled by you"
                          : booking.cancelled_by === "trainer"
                            ? "Cancelled by the trainer"
                            : "Cancelled"
                        : BOOKING_STATUS_LABELS[booking.status]}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground font-mono text-xs">
                    {formatBookingStart(
                      booking.starts_at,
                      booking.trainers?.timezone ?? "UTC",
                    )}{" "}
                    · {booking.duration_minutes} min ·{" "}
                    {formatPrice(booking.price_cents)}
                  </span>
                  {/* Payment shows once the trainer has CONFIRMED (M17): now
                      there's a payee relationship, and RLS returned the row. */}
                  {booking.status === "CONFIRMED" ? (
                    paymentByTrainer.has(booking.trainer_id) ? (
                      <PaymentDetails
                        info={paymentByTrainer.get(booking.trainer_id)!}
                      />
                    ) : (
                      /* Gate addition A: an owner who owes money must NEVER
                         see silence where payment details belong. */
                      <EmptyState compact>
                        The trainer hasn&apos;t added payment details yet —
                        message them below to arrange payment.
                      </EmptyState>
                    )
                  ) : null}

                  {/* Message rides every row — coordination isn't status-
                      gated (a completed session still gets a "thanks", a
                      cancelled one a "can we rebook?"). Find-or-create, so
                      repeat clicks land on the same thread. */}
                  <div className="flex justify-end gap-2">
                    <MessageButton
                      counterpartyId={booking.trainer_id}
                      bookingId={booking.id}
                    />
                    {booking.status === "PENDING" ||
                    booking.status === "CONFIRMED" ? (
                      <CancelBookingButton
                        bookingId={booking.id}
                        label="Cancel"
                      />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Button asChild variant="outline" className="w-full">
          <Link href="/account">Back to account</Link>
        </Button>
      </div>
    </main>
  );
}
