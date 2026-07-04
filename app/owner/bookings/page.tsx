import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
 * NO cancel affordance — owner cancel is a §10 status TRANSITION, and
 * transitions are Arc D (trainer confirm/cancel/complete + owner cancel,
 * together). Arc C creates; Arc D transitions.
 */
export default async function OwnerBookingsPage() {
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

  const { bookings, error } = await getOwnerBookings(supabase, claims.sub);

  return (
    <main className="bg-muted min-h-screen px-6 py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">Your bookings</h1>
          <p className="text-muted-foreground text-sm">
            Requests and sessions, soonest first. Times are shown in the
            trainer&apos;s timezone.
          </p>
        </header>

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            Your bookings couldn&apos;t be loaded. Please refresh to try again.
          </p>
        ) : bookings.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No bookings yet —{" "}
            <Link href="/trainers" className="underline">
              find a trainer
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {bookings.map((booking) => (
              <Card key={booking.id}>
                <CardContent className="flex flex-col gap-2 pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
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
                    <span className="bg-accent text-accent-foreground inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium">
                      {BOOKING_STATUS_LABELS[booking.status]}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-sm">
                    {formatBookingStart(
                      booking.starts_at,
                      booking.trainers?.timezone ?? "UTC",
                    )}{" "}
                    · {booking.duration_minutes} min ·{" "}
                    {formatPrice(booking.price_cents)}
                  </span>
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
