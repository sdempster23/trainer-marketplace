"use client";

import { useActionState } from "react";

import {
  completeOnboarding,
  type OnboardingActionState,
} from "@/app/(trainer)/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BIO_MAX_LENGTH,
  DEFAULT_TIMEZONE,
  SERVICE_RADIUS_MILES,
  SPECIALTIES,
  SPECIALTY_LABELS,
  TIMEZONE_LABELS,
  TRAINER_TIMEZONES,
} from "@/lib/validators/trainer";

const fieldClasses =
  "border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none";

export function OnboardingForm() {
  const [state, formAction, isPending] = useActionState<
    OnboardingActionState,
    FormData
  >(completeOnboarding, null);

  return (
    <main className="bg-muted flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Create your trainer listing</CardTitle>
          <CardDescription>
            This is what dog owners see when they find you. You can edit it later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-6">
            {/* Bio */}
            <div className="grid gap-2">
              <Label htmlFor="bio">About you</Label>
              <textarea
                id="bio"
                name="bio"
                required
                rows={4}
                maxLength={BIO_MAX_LENGTH}
                placeholder="Your experience, approach, and the dogs you love to work with."
                className={fieldClasses}
              />
            </div>

            {/* Specialties (multi-select) */}
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">
                Specialties (pick at least one)
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {SPECIALTIES.map((specialty) => (
                  <label
                    key={specialty}
                    className="border-border hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-accent/60 flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors"
                  >
                    <input
                      type="checkbox"
                      name="specialties"
                      value={specialty}
                    />
                    <span>{SPECIALTY_LABELS[specialty]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* ZIP — format-validated here; resolved to a location on submit */}
            <div className="grid gap-2">
              <Label htmlFor="zip">ZIP code</Label>
              <Input
                id="zip"
                name="zip"
                inputMode="numeric"
                pattern="\d{5}"
                maxLength={5}
                required
                placeholder="37214"
              />
              <p className="text-muted-foreground text-xs">
                Used to place you on the map for nearby owners. We store an
                approximate area, not your address.
              </p>
            </div>

            {/* Service radius */}
            <div className="grid gap-2">
              <Label htmlFor="serviceRadiusMiles">How far will you travel?</Label>
              <select
                id="serviceRadiusMiles"
                name="serviceRadiusMiles"
                required
                defaultValue=""
                className={fieldClasses}
              >
                <option value="" disabled>
                  Select a distance
                </option>
                {SERVICE_RADIUS_MILES.map((miles) => (
                  <option key={miles} value={miles}>
                    {miles} miles
                  </option>
                ))}
              </select>
            </div>

            {/* Timezone */}
            <div className="grid gap-2">
              <Label htmlFor="timezone">Your timezone</Label>
              <select
                id="timezone"
                name="timezone"
                required
                defaultValue={DEFAULT_TIMEZONE}
                className={fieldClasses}
              >
                {TRAINER_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {TIMEZONE_LABELS[tz]}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Used to interpret your available hours. Change it if it&apos;s
                not right.
              </p>
            </div>

            {state?.error ? (
              <p role="alert" className="text-destructive text-sm">
                {state.error}
              </p>
            ) : null}

            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating your listing…" : "Create listing"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
