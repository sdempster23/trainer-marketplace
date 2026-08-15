import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AddExceptionForm,
  AddWeeklySlotForm,
} from "@/components/trainer/availability-forms";
import {
  ExceptionRow,
  WeeklySlotRow,
} from "@/components/trainer/availability-rows";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { geistMono } from "@/lib/fonts";
import { createClient } from "@/lib/supabase/server";
import {
  getExceptions,
  getWeeklyPattern,
} from "@/lib/trainer/availability";
import { getOnboardingState } from "@/lib/trainer/onboarding";
import { DAY_OF_WEEK_LABELS } from "@/lib/validators/availability";
import {
  TIMEZONE_LABELS,
  type TrainerTimezone,
} from "@/lib/validators/trainer";

export const metadata = {
  title: "Your availability — PawMatch",
};

/**
 * Availability management — weekly hours + per-date exceptions. Guarded like
 * the other trainer pages ('none' → onboarding; availability rows FK the
 * trainers row).
 *
 * ZONE-NAIVE BY DESIGN: every time on this page is the trainer's own wall
 * clock, displayed exactly as entered — no conversion anywhere here. The
 * slot-math module (lib/trainer/schedule.ts) does the zone work when OWNERS
 * see these hours as bookable slots; this page is the trainer talking to
 * themselves about their own week.
 */
export default async function TrainerAvailabilityPage() {
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

  // "Upcoming" starts at today IN THE TRAINER'S ZONE — a date is
  // zone-relative, and the trainer's timezone is the page's whole frame.
  const { data: trainer } = await supabase
    .from("trainers")
    .select("timezone")
    .eq("id", claims.sub)
    .maybeSingle();
  const todayLocal = new Intl.DateTimeFormat("en-CA", {
    timeZone: trainer?.timezone ?? "UTC",
  }).format(new Date());

  const { slots, error: patternError } = await getWeeklyPattern(
    supabase,
    claims.sub,
  );
  const { exceptions, error: exceptionsError } = await getExceptions(
    supabase,
    claims.sub,
    todayLocal,
  );

  const zoneLabel = trainer?.timezone
    ? (TIMEZONE_LABELS[trainer.timezone as TrainerTimezone] ?? trainer.timezone)
    : null;

  return (
    <main className={`bg-muted flex-1 px-6 py-12 ${geistMono.variable}`}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader title="Your availability">
          Your weekly hours{zoneLabel ? ` in ${zoneLabel}` : ""} — owners will
          see them as bookable times. Exceptions override single dates.
          {" "}
          <Link href="/trainer/listing/edit" className="underline">
            Change your timezone
          </Link>
          {" "}if it&apos;s wrong.
        </PageHeader>

        <Card>
          <CardHeader>
            <CardTitle>Weekly hours</CardTitle>
            <CardDescription>
              Repeats every week. Add more than one window for a split day.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {patternError ? (
              <ErrorState>
                Your hours couldn&apos;t be loaded. Please refresh to try again.
              </ErrorState>
            ) : slots.length === 0 ? (
              <EmptyState compact>
                No hours yet — add your first window below.
              </EmptyState>
            ) : (
              DAY_OF_WEEK_LABELS.map((label, day) => {
                const daySlots = slots.filter((s) => s.day_of_week === day);
                if (daySlots.length === 0) return null;
                return (
                  <div key={label} className="grid gap-2">
                    <span className="text-muted-foreground text-xs font-medium">
                      {label}
                    </span>
                    {daySlots.map((slot) => (
                      <WeeklySlotRow key={slot.id} slot={slot} />
                    ))}
                  </div>
                );
              })
            )}
            <div className="border-border border-t pt-4">
              <AddWeeklySlotForm />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exceptions</CardTitle>
            <CardDescription>
              Days off or one-off different hours — an exception replaces that
              day&apos;s weekly pattern entirely.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {exceptionsError ? (
              <ErrorState>
                Your exceptions couldn&apos;t be loaded. Please refresh to try
                again.
              </ErrorState>
            ) : exceptions.length === 0 ? (
              // Grammar parity with its sibling (the audit's split): the
              // zero state guides instead of dead-ending.
              <EmptyState compact>
                No upcoming exceptions — add a day off or one-off hours below.
              </EmptyState>
            ) : (
              exceptions.map((exception) => (
                <ExceptionRow key={exception.id} exception={exception} />
              ))
            )}
            <div className="border-border border-t pt-4">
              <AddExceptionForm />
            </div>
          </CardContent>
        </Card>

        {/* Lateral nav replaces the Back-to chain. */}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild variant="outline" className="w-full">
            <Link href="/trainer/services">Manage services</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/trainer/listing">Your listing</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
