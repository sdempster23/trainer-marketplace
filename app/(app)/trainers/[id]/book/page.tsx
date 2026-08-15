import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { BookingForm } from "@/components/owner/booking-form";
import { ErrorState } from "@/components/shared/states";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getBusyRanges } from "@/lib/trainer/busy";
import { ensureExternalCalendarFresh } from "@/lib/trainer/external-sync";
import { getExceptions, getWeeklyPattern } from "@/lib/trainer/availability";
import {
  computeBookableSlots,
  type BookableSlot,
} from "@/lib/trainer/schedule";
import { getActiveServices } from "@/lib/trainer/services";
import { getActiveDogs } from "@/lib/owner/dogs";
import { BOOKING_WINDOW_DAYS } from "@/lib/validators/booking";
import {
  TIMEZONE_LABELS,
  type TrainerTimezone,
} from "@/lib/validators/trainer";

export const metadata = { title: "Book a session — PawMatch" };

const guidSchema = z.guid(); // the detail page's gate lesson: match the column
const MS_PER_DAY = 86_400_000;

/**
 * The booking form page — OWNER-guarded (unlike its public parent, the
 * detail page). A signed-in TRAINER gets a friendly explanation card rather
 * than a silent bounce: they arrived by clicking a real button on a page
 * they can see, so the page owes them a sentence, not a redirect that looks
 * like a bug.
 *
 * Slots are precomputed PER SERVICE server-side (see BookingForm's header) —
 * the shared inputs (pattern, exceptions, busy, timezone) are fetched once,
 * computeBookableSlots runs once per service, and the window is the same
 * BOOKING_WINDOW_DAYS the createBooking guard recomputes over.
 */
export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ service?: string | string[] }>;
}) {
  const { id } = await params;
  if (!guidSchema.safeParse(id).success) {
    notFound();
  }

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
    return (
      <main className="bg-muted flex flex-1 items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>
              Trainers can&apos;t book sessions
            </CardTitle>
            <CardDescription>
              Booking is for dog owners — trainers receive requests through
              their own bookings page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/trainers/${id}`}>Back to the trainer</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  // The same listable floor as the detail page: if the directory hides them,
  // a book URL doesn't un-hide them.
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id, timezone, profiles!inner(display_name)")
    .eq("id", id)
    .not("profiles.display_name", "is", null)
    .not("service_point", "is", null)
    .maybeSingle();
  if (!trainer || trainer.profiles.display_name === null) {
    notFound();
  }

  // The error field must be read (investigation bug-class fix): a failed
  // dogs read previously fell through to "Add a dog first" — a false
  // statement to an owner who HAS dogs, pointing at a page that would
  // also fail. Degraded ≠ empty.
  const { dogs, error: dogsError } = await getActiveDogs(supabase, claims.sub);
  if (dogsError) {
    return (
      <main className="bg-muted flex flex-1 items-center justify-center px-6 py-12">
        <p role="alert" className="text-destructive text-sm">
          Your dogs couldn&apos;t be loaded. Please refresh to try again.
        </p>
      </main>
    );
  }
  if (dogs.length === 0) {
    return (
      <main className="bg-muted flex flex-1 items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Add a dog first</CardTitle>
            <CardDescription>
              Bookings are for a specific dog — add your dog&apos;s profile and
              come back.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              {/* The return param is what stops the first-booking funnel
                  from dying here (flow ruling #2); /owner/dogs validates
                  it as a same-origin path. */}
              <Link
                href={`/owner/dogs?return=${encodeURIComponent(`/trainers/${id}/book`)}`}
              >
                Add your dog
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const { services, error: servicesError } = await getActiveServices(
    supabase,
    id,
  );

  // Shared slot inputs, fetched once; one pure computation per service.
  // ERRORS ARE READ (the carried step-1 finding): computing slots from a
  // silently-failed input renders a false "no open times".
  const { slots: pattern, error: patternError } = await getWeeklyPattern(
    supabase,
    id,
  );
  const todayLocal = new Intl.DateTimeFormat("en-CA", {
    timeZone: trainer.timezone,
  }).format(new Date());
  const [ty = 0, tm = 1, td = 1] = todayLocal.split("-").map(Number);
  const toDateLocal = new Date(
    Date.UTC(ty, tm - 1, td) + (BOOKING_WINDOW_DAYS - 1) * MS_PER_DAY,
  )
    .toISOString()
    .slice(0, 10);
  const { exceptions, error: exceptionsError } = await getExceptions(
    supabase,
    id,
    todayLocal,
  );
  // M16: the external calendar's fetch-on-read moment — never fetched →
  // synchronous (capped); stale → after() refresh; errors never break the
  // page (stale blocks keep serving through the RPC).
  await ensureExternalCalendarFresh(id, trainer.timezone);
  const { busy, error: busyError } = await getBusyRanges(supabase, id);
  const slotInputsError = patternError || exceptionsError || busyError;

  const slotsByService: Record<string, BookableSlot[]> = {};
  for (const service of services) {
    slotsByService[service.id] = computeBookableSlots({
      pattern,
      exceptions,
      bookings: busy,
      timezone: trainer.timezone,
      durationMinutes: service.duration_minutes,
      fromDateLocal: todayLocal,
      toDateLocal,
      now: new Date(),
    });
  }

  const { service: serviceParam } = await searchParams;
  const preselect = Array.isArray(serviceParam) ? serviceParam[0] : serviceParam;
  const zoneLabel =
    TIMEZONE_LABELS[trainer.timezone as TrainerTimezone] ?? trainer.timezone;

  return (
    <main className="bg-muted flex-1 px-6 py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader title={`Book with ${trainer.profiles.display_name}`}>
          Your request goes to the trainer to confirm — nothing is charged
          yet.
        </PageHeader>

        {servicesError ? (
          // Failed read ≠ zero services — the false "hasn't listed any"
          // statement was the investigation's bug-class find here.
          <ErrorState>
            Services couldn&apos;t be loaded. Please refresh to try again.
          </ErrorState>
        ) : services.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            This trainer hasn&apos;t listed any bookable services yet.
          </p>
        ) : slotInputsError ? (
          // A failed slot input must never masquerade as "no open times"
          // (the carried step-1 finding) — but a truthful zero-services
          // state outranks it (review: precedence).
          <ErrorState>
            Available times couldn&apos;t be loaded. Please refresh to try
            again.
          </ErrorState>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <BookingForm
                dogs={dogs}
                services={services}
                slotsByService={slotsByService}
                preselectServiceId={preselect}
                zoneLabel={zoneLabel}
                trainerId={id}
              />
            </CardContent>
          </Card>
        )}

        <Button asChild variant="outline" className="w-full">
          <Link href={`/trainers/${id}`}>Back to the trainer</Link>
        </Button>
      </div>
    </main>
  );
}
