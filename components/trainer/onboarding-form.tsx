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
} from "@/lib/validators/trainer";

export function OnboardingForm() {
  const [state, formAction, isPending] = useActionState<
    OnboardingActionState,
    FormData
  >(completeOnboarding, null);

  return (
    <main className="bg-muted flex flex-1 items-center justify-center px-6 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Create your trainer listing</CardTitle>
          <CardDescription>
            This is what dog owners see when they find you. You can edit it later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-6">
            {/* Display name — the directory card's headline */}
            <div className="grid gap-2">
              <Label htmlFor="displayName">Your name</Label>
              <Input
                id="displayName"
                name="displayName"
                required
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                placeholder="How owners and trainers will see you, e.g. Dana Cortez"
              />
            </div>

            {/* Bio */}
            <div className="grid gap-2">
              <Label htmlFor="bio">About you</Label>
              <Textarea
                id="bio"
                name="bio"
                required
                rows={4}
                maxLength={BIO_MAX_LENGTH}
                placeholder="Your experience, approach, and the dogs you love to work with."
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
                      className="accent-primary"
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
              <NativeSelect
                id="serviceRadiusMiles"
                name="serviceRadiusMiles"
                required
                defaultValue=""
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

            {/* Timezone */}
            <div className="grid gap-2">
              <Label htmlFor="timezone">Your timezone</Label>
              <NativeSelect
                id="timezone"
                name="timezone"
                required
                defaultValue={DEFAULT_TIMEZONE}
              >
                {TRAINER_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {TIMEZONE_LABELS[tz]}
                  </option>
                ))}
              </NativeSelect>
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

            <Button type="submit" variant="action" disabled={isPending}>
              {isPending ? "Creating your listing…" : "Create listing"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
