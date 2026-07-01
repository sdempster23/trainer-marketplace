"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lookup } from "zipcodes";

import { createClient } from "@/lib/supabase/server";
import { onboardingSchema } from "@/lib/validators/trainer";

/**
 * Trainer onboarding — the trusted boundary that creates the M3 `trainers` row
 * (turning a signed-up trainer profile into a listable trainer) plus their
 * specialty assignments. Same patterns as the auth actions: zod-validate,
 * serializable { error }, redirect() outside the try/catch.
 */

export type OnboardingActionState = { error: string } | null;

/** Where a newly-listed trainer lands (Group 2 builds the page at this URL). */
const POST_ONBOARDING_REDIRECT = "/trainer/listing";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const VALIDATION_ERROR = "Please check the form and try again.";

const METERS_PER_MILE = 1609.344;
const milesToMeters = (miles: number) => Math.round(miles * METERS_PER_MILE);

export async function completeOnboarding(
  _prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const parsed = onboardingSchema.safeParse({
    bio: formData.get("bio"),
    specialties: formData.getAll("specialties"), // multi-select → array
    zip: formData.get("zip"),
    serviceRadiusMiles: formData.get("serviceRadiusMiles"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const supabase = await createClient();

  // Auth + role: the route guards too, but the action is the trusted boundary —
  // never trust the caller. An unauthenticated or non-trainer caller is rejected
  // here (RLS would also block the write, but we return a clean message, not a
  // raw RLS failure). Role isn't in the JWT, so read it from profiles.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.role !== "trainer") {
    return { error: "Only trainer accounts can create a trainer listing." };
  }

  // Geocode locally (no external call, no key). undefined = valid 5-digit format
  // but not a real US ZIP in the table.
  const place = lookup(parsed.data.zip);
  if (!place) {
    return { error: "We couldn't find that ZIP — please check and re-enter." };
  }

  // WRITE 1 — upsert the trainers row.
  // UPSERT, not insert: a partial-onboarding retry (row exists, no specialties)
  // must UPDATE, not hit a PK 23505 — that self-heal is the whole reason we
  // chose sequential writes over a transactional RPC.
  // service_point EWKT is POINT(LONGITUDE LATITUDE) — LNG FIRST. zipcodes returns
  // { latitude, longitude } as named fields; transcribe them in POINT order, not
  // object order (the classic lng/lat reversal trap).
  let writeError: string | null = null;
  try {
    const { error } = await supabase.from("trainers").upsert({
      id: userId,
      bio: parsed.data.bio,
      service_point: `SRID=4326;POINT(${place.longitude} ${place.latitude})`,
      service_radius_meters: milesToMeters(parsed.data.serviceRadiusMiles),
      timezone: parsed.data.timezone,
    });
    writeError = error?.message ?? null;
  } catch {
    writeError = GENERIC_ERROR;
  }
  if (writeError) {
    return { error: writeError };
  }

  // WRITE 2 — upsert specialty assignments.
  // ignoreDuplicates => INSERT ... ON CONFLICT (trainer_id, specialty) DO NOTHING.
  // Add-only and idempotent: assignments have no UPDATE policy/grant, so a real
  // upsert-update would fail; DO NOTHING re-adds only the missing rows on a retry.
  try {
    const { error } = await supabase
      .from("trainer_specialty_assignments")
      .upsert(
        parsed.data.specialties.map((specialty) => ({
          trainer_id: userId,
          specialty,
        })),
        { onConflict: "trainer_id,specialty", ignoreDuplicates: true },
      );
    writeError = error?.message ?? null;
  } catch {
    writeError = GENERIC_ERROR;
  }
  if (writeError) {
    return { error: writeError };
  }

  revalidatePath("/", "layout");
  redirect(POST_ONBOARDING_REDIRECT);
}
