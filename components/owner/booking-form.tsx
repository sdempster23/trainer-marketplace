"use client";

import { useActionState, useState } from "react";

import { createBooking } from "@/app/(owner)/actions";
import type { BookingActionState } from "@/app/(owner)/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
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
}: {
  dogs: ActiveDog[];
  services: ActiveService[];
  slotsByService: Record<string, BookableSlot[]>;
  preselectServiceId?: string;
  zoneLabel: string;
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

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">
          Pick a time{" "}
          <span className="text-muted-foreground font-normal">
            — times shown in the trainer&apos;s timezone ({zoneLabel})
          </span>
        </legend>
        {slots.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No open times in the next two weeks for this service.
          </p>
        ) : (
          [...byDay.entries()].map(([dateLocal, daySlots]) => (
            <div key={dateLocal} className="grid gap-2">
              <span className="text-muted-foreground text-xs font-medium">
                {formatDayHeader(dateLocal)}
              </span>
              <div className="flex flex-wrap gap-2">
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
                    <span>{slot.labelLocal}</span>
                  </label>
                ))}
              </div>
            </div>
          ))
        )}
      </fieldset>

      {state && "error" in state ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="action"
        disabled={isPending || slots.length === 0}
      >
        {isPending ? "Requesting…" : "Request booking"}
      </Button>
    </form>
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
