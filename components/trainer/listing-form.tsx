"use client";

import { useActionState } from "react";

import type { OnboardingActionState } from "@/app/(trainer)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/validators/profile";
import {
  BIO_MAX_LENGTH,
  DEFAULT_TIMEZONE,
  SERVICE_RADIUS_MILES,
  SPECIALTIES,
  SPECIALTY_LABELS,
  TIMEZONE_LABELS,
  TRAINER_TIMEZONES,
  type ServiceRadiusMiles,
  type Specialty,
  type TrainerTimezone,
} from "@/lib/validators/trainer";

/**
 * THE listing form — one component, two jobs (flow ruling #1): onboarding
 * (create) and the edit that makes onboarding's "You can edit it later."
 * true. The FORM only: pages own the shell/PageHeader/Card (the
 * component-owns-main pattern is how the 27th min-h-screen hid).
 *
 * `initial` prefills every field it covers — including the PARTIAL
 * re-entry case, whose blank form was an investigation flag: a partial
 * trainer's bio/radius/timezone ARE saved and now render as such.
 * `zipOptional` (edit only): blank keeps the current
 * service area, because only the derived geo point is stored — a ZIP
 * cannot be prefilled, and forcing a re-type to change a bio is hostile.
 */
export type ListingFormInitial = {
  displayName?: string | null;
  bio?: string | null;
  specialties?: Specialty[];
  serviceRadiusMiles?: ServiceRadiusMiles | null;
  timezone?: TrainerTimezone | null;
};

export function ListingForm({
  action,
  submitLabel,
  pendingLabel,
  showName = false,
  zipOptional = false,
  initial,
}: {
  action: (
    prev: OnboardingActionState,
    formData: FormData,
  ) => Promise<OnboardingActionState>;
  submitLabel: string;
  pendingLabel: string;
  /** Onboarding collects the display name (WRITE 0); edit doesn't — the
   * name lives on /account. */
  showName?: boolean;
  zipOptional?: boolean;
  initial?: ListingFormInitial;
}) {
  const [state, formAction, isPending] = useActionState<
    OnboardingActionState,
    FormData
  >(action, null);

  const chosen = new Set(initial?.specialties ?? []);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {showName ? (
        <div className="grid gap-2">
          <Label htmlFor="displayName">Your name</Label>
          <Input
            id="displayName"
            name="displayName"
            required
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            defaultValue={initial?.displayName ?? undefined}
            placeholder="How owners and trainers will see you, e.g. Dana Cortez"
          />
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="bio">About you</Label>
        <Textarea
          id="bio"
          name="bio"
          required
          rows={4}
          maxLength={BIO_MAX_LENGTH}
          defaultValue={initial?.bio ?? undefined}
          placeholder="Your experience, approach, and the dogs you love to work with."
        />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">
          Specialties (pick at least one)
        </legend>
        {/* Single column at 390 (the audit's most-cramped element); two
            from sm up. */}
        <div className="grid gap-2 sm:grid-cols-2">
          {SPECIALTIES.map((specialty) => (
            <label
              key={specialty}
              className="border-border hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-accent/60 flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors"
            >
              <input
                type="checkbox"
                className="accent-primary"
                name="specialties"
                value={specialty}
                defaultChecked={chosen.has(specialty)}
              />
              <span>{SPECIALTY_LABELS[specialty]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="zip">
          ZIP code
          {zipOptional ? (
            <span className="text-muted-foreground font-normal">
              {" "}
              · optional
            </span>
          ) : null}
        </Label>
        <Input
          id="zip"
          name="zip"
          inputMode="numeric"
          pattern="\d{5}"
          maxLength={5}
          required={!zipOptional}
          placeholder="37214"
        />
        <p className="text-muted-foreground text-xs">
          {zipOptional
            ? "Your service area is saved — enter a ZIP only to move it. We store an approximate area, not your address."
            : "Used to place you on the map for nearby owners. We store an approximate area, not your address."}
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="serviceRadiusMiles">How far will you travel?</Label>
        <NativeSelect
          id="serviceRadiusMiles"
          name="serviceRadiusMiles"
          required
          defaultValue={initial?.serviceRadiusMiles ?? ""}
        >
          <option value="" disabled>
            Select a distance
          </option>
          {SERVICE_RADIUS_MILES.map((miles) => (
            <option key={miles} value={miles}>
              {miles} miles
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="timezone">Your timezone</Label>
        <NativeSelect
          id="timezone"
          name="timezone"
          required
          defaultValue={initial?.timezone ?? DEFAULT_TIMEZONE}
        >
          {TRAINER_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {TIMEZONE_LABELS[tz]}
            </option>
          ))}
        </NativeSelect>
        <p className="text-muted-foreground text-xs">
          Used to interpret your available hours. Change it if it&apos;s not
          right.
        </p>
      </div>

      {state?.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="action" disabled={isPending}>
        {isPending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
