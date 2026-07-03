"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lookup } from "zipcodes";

import { createClient } from "@/lib/supabase/server";
import { getOnboardingState } from "@/lib/trainer/onboarding";
import {
  METERS_PER_MILE,
  onboardingSchema,
  serviceIdSchema,
  serviceSchema,
} from "@/lib/validators/trainer";

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

const milesToMeters = (miles: number) => Math.round(miles * METERS_PER_MILE);

export async function completeOnboarding(
  _prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const parsed = onboardingSchema.safeParse({
    displayName: formData.get("displayName"),
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

  // WRITE 0 — the trainer's display name, on their profiles row. NAME FIRST,
  // deliberately: the trainers row (write 1) is what makes a trainer LISTABLE
  // in the directory, so ordering name-before-listing means a partial failure
  // can never produce a listed-but-nameless trainer. The inverse failure
  // (named-but-unlisted) is invisible to owners and self-heals on retry, same
  // as the write-1/write-2 upsert path. RLS scopes this to the caller's own
  // row (auth.uid() = id), and the M9-era WITH CHECK freezes role.
  let writeError: string | null = null;
  try {
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: parsed.data.displayName })
      .eq("id", userId);
    writeError = error?.message ?? null;
  } catch {
    writeError = GENERIC_ERROR;
  }
  if (writeError) {
    return { error: writeError };
  }

  // WRITE 1 — upsert the trainers row.
  // UPSERT, not insert: a partial-onboarding retry (row exists, no specialties)
  // must UPDATE, not hit a PK 23505 — that self-heal is the whole reason we
  // chose sequential writes over a transactional RPC.
  // service_point EWKT is POINT(LONGITUDE LATITUDE) — LNG FIRST. zipcodes returns
  // { latitude, longitude } as named fields; transcribe them in POINT order, not
  // object order (the classic lng/lat reversal trap).
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

// ---------------------------------------------------------------------------
// Services — the trainer_services write surface (create / update / soft-delete).
// Same trusted-boundary patterns as completeOnboarding: zod parse → auth →
// role check → serializable { error } → revalidate.
// ---------------------------------------------------------------------------

/** null = not yet submitted; { success } lets client forms distinguish a
 * completed submit from the initial state (close the editor / reset fields). */
export type ServiceActionState = { error: string } | { success: true } | null;

/**
 * Shared prelude for the three service actions: authenticated caller with a
 * trainer profile, or the appropriate exit (redirect for no session, { error }
 * for wrong role). Role isn't in the JWT, so it's read from profiles — same
 * reasoning as completeOnboarding, which keeps its own inline copy (approved
 * code, not churned here).
 */
async function requireTrainer(): Promise<
  | { supabase: Awaited<ReturnType<typeof createClient>>; userId: string }
  | { error: string }
> {
  const supabase = await createClient();
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
    return { error: "Only trainer accounts can manage services." };
  }
  return { supabase, userId };
}

export async function createService(
  _prevState: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsed = serviceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    priceDollars: formData.get("priceDollars"),
    durationMinutes: formData.get("durationMinutes"),
    sessionType: formData.get("sessionType"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const ctx = await requireTrainer();
  if ("error" in ctx) {
    return ctx;
  }

  // Services attach to the trainers ROW (the FK target), not to onboarding
  // completeness — 'partial' is fine (services and specialties can arrive in
  // any order); only 'none' (no trainers row at all) must be turned away, or
  // the INSERT would die on the FK instead of a helpful message.
  const state = await getOnboardingState(ctx.supabase, ctx.userId);
  if (state === "none") {
    return {
      error: "Create your trainer listing first — then add your services.",
    };
  }

  let writeError: string | null = null;
  try {
    const { error } = await ctx.supabase.from("trainer_services").insert({
      trainer_id: ctx.userId,
      name: parsed.data.name,
      description: parsed.data.description,
      session_type: parsed.data.sessionType,
      // priceDollars is CENTS post-transform (schema converts at the boundary)
      price_cents: parsed.data.priceDollars,
      duration_minutes: parsed.data.durationMinutes,
    });
    writeError = error?.message ?? null;
  } catch {
    writeError = GENERIC_ERROR;
  }
  if (writeError) {
    return { error: writeError };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateService(
  _prevState: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsedId = serviceIdSchema.safeParse(formData.get("serviceId"));
  const parsed = serviceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    priceDollars: formData.get("priceDollars"),
    durationMinutes: formData.get("durationMinutes"),
    sessionType: formData.get("sessionType"),
  });
  if (!parsedId.success || !parsed.success) {
    return {
      error:
        parsedId.error?.issues[0]?.message ??
        parsed.error?.issues[0]?.message ??
        VALIDATION_ERROR,
    };
  }

  const ctx = await requireTrainer();
  if ("error" in ctx) {
    return ctx;
  }

  // .eq(trainer_id) is belt-and-suspenders with RLS; the ROW-COUNT check is
  // the load-bearing part. The investigation proved a cross-trainer (or
  // nonexistent-id) UPDATE is a SILENT 0-row no-op under RLS — without
  // .select() + the null check, a tampered form would report success while
  // changing nothing. Surface it as failure.
  let updated: { id: string } | null = null;
  let writeError: string | null = null;
  try {
    const { data, error } = await ctx.supabase
      .from("trainer_services")
      .update({
        name: parsed.data.name,
        description: parsed.data.description,
        session_type: parsed.data.sessionType,
        // priceDollars is CENTS post-transform (schema converts at the boundary)
        price_cents: parsed.data.priceDollars,
        duration_minutes: parsed.data.durationMinutes,
      })
      .eq("id", parsedId.data)
      .eq("trainer_id", ctx.userId)
      // The view-spec rule applies to writes too: only ACTIVE rows are
      // editable (a soft-deleted id from a stale/tampered form is "not
      // found", not a silent edit of an invisible row).
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    updated = data;
    writeError = error?.message ?? null;
  } catch {
    writeError = GENERIC_ERROR;
  }
  if (writeError) {
    return { error: writeError };
  }
  if (!updated) {
    return { error: "That service could not be found." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteService(
  _prevState: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsedId = serviceIdSchema.safeParse(formData.get("serviceId"));
  if (!parsedId.success) {
    return { error: parsedId.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const ctx = await requireTrainer();
  if ("error" in ctx) {
    return ctx;
  }

  // SOFT delete — hard DELETE is grant-blocked by design (the M7 sweep left
  // authenticated without DELETE on soft-delete tables; verified live: 42501).
  // Setting deleted_at rides the ordinary UPDATE grant + own-row policy. Same
  // row-count rule as updateService: a 0-row result is a failure, not success.
  let deleted: { id: string } | null = null;
  let writeError: string | null = null;
  try {
    const { data, error } = await ctx.supabase
      .from("trainer_services")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", parsedId.data)
      .eq("trainer_id", ctx.userId)
      // Only active rows are deletable — re-deleting an already-deleted row
      // would silently refresh its deleted_at; make it "not found" instead.
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    deleted = data;
    writeError = error?.message ?? null;
  } catch {
    writeError = GENERIC_ERROR;
  }
  if (writeError) {
    return { error: writeError };
  }
  if (!deleted) {
    return { error: "That service could not be found." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}
