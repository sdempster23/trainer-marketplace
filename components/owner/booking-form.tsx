"use client";

import { useActionState, useState } from "react";

import { createBooking } from "@/app/(owner)/actions";
import type { BookingActionState } from "@/app/(owner)/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { MessageButton } from "@/components/messages/message-button";
import { EmptyState } from "@/components/shared/states";
import type { ActiveDog } from "@/lib/owner/dogs";
import type { BookableSlot } from "@/lib/trainer/schedule";
import type { ActiveService } from "@/lib/trainer/services";
import { formatPrice, SESSION_TYPE_LABELS } from "@/lib/validators/trainer";

/**
 * The booking form. Slots arrive PRE-COMPUTED PER SERVICE from the server
 * (slotsByService): the slot module is pure and a trainer offers a handful
 * of services, so the server runs computeBookableSlots once per service and
 * the client just switches arrays — no client-side module, no clock or
 * timezone logic in the browser, no round trip on service change. The
 * selected slot is a plain radio group (name="slotStartUtc"), so the form
 * needs client state ONLY for which service's grid to show.
 */
export function BookingForm({
  dogs,
  services,
  slotsByService,
  preselectServiceId,
  zoneLabel,
  trainerId,
}: {
  dogs: ActiveDog[];
  services: ActiveService[];
  slotsByService: Record<string, BookableSlot[]>;
  preselectServiceId?: string;
  zoneLabel: string;
  trainerId: string;
}) {
  const [state, formAction, isPending] = useActionState<
    BookingActionState,
    FormData
  >(createBooking, null);
  const [serviceId, setServiceId] = useState(
    preselectServiceId && slotsByService[preselectServiceId]
      ? preselectServiceId
      : (services[0]?.id ?? ""),
  );

  const slots = slotsByService[serviceId] ?? [];
  const byDay = new Map<string, BookableSlot[]>();
  for (const slot of slots) {
    const day = byDay.get(slot.dateLocal) ?? [];
    day.push(slot);
    byDay.set(slot.dateLocal, day);
  }

  return (
    <>
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="booking-dog">Which dog?</Label>
          <NativeSelect id="booking-dog" name="dogId" required defaultValue="">
            <option value="" disabled>
              Choose a dog
            </option>
            {dogs.map((dog) => (
              <option key={dog.id} value={dog.id}>
                {dog.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="booking-service">Which service?</Label>
          <NativeSelect
            id="booking-service"
            name="serviceId"
            required
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
          >
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} — {formatPrice(service.price_cents)} ·{" "}
                {service.duration_minutes} min ·{" "}
                {SESSION_TYPE_LABELS[service.session_type]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {slots.length > 0 ? (
      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">
          Pick a time{" "}
          <span className="text-muted-foreground font-normal">
            — times shown in the trainer&apos;s timezone ({zoneLabel})
          </span>
        </legend>
          <>
            {/* Ruling 9's cheap jump: the picker can be long — this
                anchor lands on the first bookable day (only rendered when
                one exists). */}
            <p className="text-muted-foreground text-sm">
              Next available:{" "}
              <a
                href={`#day-${[...byDay.keys()][0]}`}
                className="text-foreground underline underline-offset-4"
              >
                {formatDayHeader([...byDay.keys()][0] ?? "")}
              </a>
            </p>
            {[...byDay.entries()].map(([dateLocal, daySlots], dayIndex) => (
              /* Collapsible days (ruling 9): only days WITH slots render,
                 first one open — the rest are one tap away instead of a
                 2,400px wall. Radios inside a closed details stay
                 form-associated, so a picked time survives collapsing. */
              <details
                key={`${serviceId}:${dateLocal}`}
                id={`day-${dateLocal}`}
                open={dayIndex === 0}
                className="group scroll-mt-20"
              >
                <summary className="text-muted-foreground hover:text-foreground -my-1 flex cursor-pointer list-none items-center gap-2 py-2 text-sm font-medium transition-colors [&::-webkit-details-marker]:hidden">
                  <span
                    aria-hidden
                    className="transition-transform group-open:rotate-90"
                  >
                    ›
                  </span>
                  {formatDayHeader(dateLocal)}
                  <span className="font-normal">
                    · {daySlots.length}{" "}
                    {daySlots.length === 1 ? "time" : "times"}
                  </span>
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {daySlots.map((slot) => (
                    <label
                      key={slot.startUtc}
                      className="border-border hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-accent/60 flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
                    >
                      <input
                        type="radio"
                        className="accent-primary"
                        name="slotStartUtc"
                        value={slot.startUtc}
                        required
                      />
                      <span className="font-mono text-xs">{slot.labelLocal}</span>
                    </label>
                  ))}
                </div>
              </details>
            ))}
          </>
      </fieldset>
      ) : null}

      {state && "error" in state ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      {slots.length > 0 ? (
        <Button type="submit" variant="action" disabled={isPending}>
          {isPending ? "Requesting…" : "Request booking"}
        </Button>
      ) : null}
    </form>

      {slots.length === 0 ? (
        /* WATCH ITEM (a): no "next available" affordance exists here — a
           jump control with nowhere to jump is a dead button. The honest
           escape is asking the trainer (flow ruling #5). OUTSIDE the
           booking form: MessageButton is its own <form>, and nested forms
           get stripped by the HTML parser (review catch). */
        <EmptyState action={<MessageButton counterpartyId={trainerId} />}>
          No open times in the next two weeks for this service — message
          the trainer to ask about other times.
        </EmptyState>
      ) : null}
    </>
  );
}

/** "2026-07-06" → "Monday, Jul 6" — pure calendar math on the trainer-local
 * date string (a date's weekday is zone-independent; no zone logic here). */
function formatDayHeader(dateLocal: string): string {
  const [y = 0, m = 1, d = 1] = dateLocal.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
