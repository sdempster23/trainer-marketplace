"use client";

import { useActionState, useRef, useState } from "react";

import type { OnboardingActionState } from "@/app/(trainer)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/validators/profile";
import { COUNTRIES, COUNTRY_LABELS, POSTAL_LABELS, POSTAL_EXAMPLES, distanceLabel, type Country } from "@/lib/location/countries";
import { currencyForCountry } from "@/lib/money";
import {
  BIO_MAX_LENGTH,
  defaultTimezoneForCountry,
  timezonesForCountry,
  METERS_PER_MILE,
  SERVICE_RADIUS_MILES,
  SPECIALTIES,
  SPECIALTY_LABELS,
  TIMEZONE_LABELS,
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
 * `zipOptional` (edit only): blank keeps the current service area. Legacy
 * listings have only a geo point and cannot prefill a postal area.
 */
export type ListingFormInitial = {
  country?: Country;
  postalArea?: string | null;
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
  const [country, setCountry] = useState<Country>(initial?.country ?? "US");
  const [postal, setPostal] = useState(initial?.postalArea ?? "");
  const [timezone, setTimezone] = useState<TrainerTimezone>(initial?.timezone ?? defaultTimezoneForCountry(country));
  const timezoneDrafts = useRef<Partial<Record<Country, TrainerTimezone>>>({});

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
        <Label htmlFor="country">Country</Label>
        <NativeSelect id="country" name="country" value={country} onChange={(event) => {
          const nextCountry = event.target.value as Country;
          timezoneDrafts.current[country] = timezone;
          setCountry(nextCountry);
          setPostal("");
          setTimezone(timezoneDrafts.current[nextCountry] ?? defaultTimezoneForCountry(nextCountry));
        }}>
          {COUNTRIES.map((value) => <option key={value} value={value}>{COUNTRY_LABELS[value]}</option>)}
        </NativeSelect>
        <p className="text-muted-foreground text-xs">
          New services use {currencyForCountry(country)}.
          {zipOptional ? " Existing services keep their currency; create a new service to price it in another currency." : ""}
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="zip">
          {POSTAL_LABELS[country]}
          {zipOptional && country === (initial?.country ?? "US") ? (
            <span className="text-muted-foreground font-normal">
              {" "}
              · optional
            </span>
          ) : null}
        </Label>
        <Input
          id="zip"
          name="zip"
          inputMode={country === "US" ? "numeric" : "text"}
          autoCapitalize="characters"
          maxLength={country === "US" ? 5 : 8}
          required={!zipOptional || country !== (initial?.country ?? "US")}
          placeholder={POSTAL_EXAMPLES[country]}
          value={postal}
          onChange={(event) => setPostal(event.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          {zipOptional
            ? "Your service area is saved. Leave this blank to keep it, or enter a code to move it. A country change needs a new code."
            : "Used to place you on the map for nearby owners. We store an approximate area, not your address."}
        </p>
        {country !== "US" ? <p className="text-muted-foreground text-xs">
          We use the first part of your {POSTAL_LABELS[country].toLowerCase()} to show your approximate area. Distances may be less precise in rural areas.
        </p> : null}
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
              {distanceLabel(miles * METERS_PER_MILE, country)}
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
          value={timezone}
          onChange={(event) => setTimezone(event.target.value as TrainerTimezone)}
        >
          {Array.from(new Set([...timezonesForCountry(country), timezone])).map((tz) => (
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
