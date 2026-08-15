"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lookup } from "zipcodes";

import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";
import { externalCalendarUrlSchema } from "@/lib/validators/feed";
import { paymentInfoSchema } from "@/lib/validators/payment";
import { getWeeklyPattern } from "@/lib/trainer/availability";
import { getOnboardingState } from "@/lib/trainer/onboarding";
import {
  availabilityIdSchema,
  DAY_OF_WEEK_LABELS,
  exceptionSchema,
  formatTimeOfDay,
  weeklySlotSchema,
} from "@/lib/validators/availability";
import {
  editListingSchema,
  METERS_PER_MILE,
  onboardingSchema,
  serviceIdSchema,
  serviceSchema,
  SPECIALTIES,
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
  // row (auth.uid() = id); role is frozen by the M11 BEFORE UPDATE trigger
  // (formerly a WITH CHECK self-subquery — see the M11 journal entry).
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
// Listing edit (interior-polish flow ruling #1) — the action that makes
// onboarding's "You can edit it later." TRUE. Bio/radius/timezone update the
// trainers row; a provided ZIP moves the service point (blank keeps it);
// specialties reconcile by diff — INSERT the added (the add-only upsert
// pattern from onboarding), DELETE the removed (the M3 policy comment's
// intended path: "drop a specialty by removing the assignment row").
// Insert BEFORE delete so a mid-sequence failure can never leave the
// listing with fewer specialties than the trainer chose.
// ---------------------------------------------------------------------------

export async function updateTrainerListing(
  _prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const parsed = editListingSchema.safeParse({
    bio: formData.get("bio"),
    specialties: formData.getAll("specialties"),
    zip: formData.get("zip") ?? "",
    serviceRadiusMiles: formData.get("serviceRadiusMiles"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

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
    return { error: "Only trainer accounts can edit a listing." };
  }
  // The action is the trusted boundary — a direct caller with no trainers
  // row would 0-row "succeed" the UPDATE and then hit the assignments FK
  // with a raw Postgres message (review finding). Turn them away cleanly.
  const onboardingState = await getOnboardingState(supabase, userId);
  if (onboardingState === "none") {
    return { error: "Create your trainer listing first — then edit it here." };
  }

  // A new ZIP geocodes exactly like onboarding; blank keeps the point.
  let servicePoint: string | null = null;
  if (parsed.data.zip) {
    const place = lookup(parsed.data.zip);
    if (!place) {
      return { error: "We couldn't find that ZIP — please check and re-enter." };
    }
    servicePoint = `SRID=4326;POINT(${place.longitude} ${place.latitude})`;
  }

  let writeError: string | null = null;
  try {
    const { error } = await supabase
      .from("trainers")
      .update({
        bio: parsed.data.bio,
        service_radius_meters: milesToMeters(parsed.data.serviceRadiusMiles),
        timezone: parsed.data.timezone,
        ...(servicePoint ? { service_point: servicePoint } : {}),
      })
      .eq("id", userId);
    writeError = error?.message ?? null;
  } catch {
    writeError = GENERIC_ERROR;
  }
  if (writeError) {
    return { error: writeError };
  }

  // Reconcile specialties: read current, insert missing, delete dropped.
  const { data: currentRows, error: readError } = await supabase
    .from("trainer_specialty_assignments")
    .select("specialty")
    .eq("trainer_id", userId);
  if (readError) {
    return { error: GENERIC_ERROR };
  }
  const current = new Set((currentRows ?? []).map((r) => r.specialty));
  const chosen = new Set(parsed.data.specialties);
  const toAdd = parsed.data.specialties.filter((sp) => !current.has(sp));
  const toRemove = SPECIALTIES.filter(
    (sp) => current.has(sp) && !chosen.has(sp),
  );

  if (toAdd.length > 0) {
    try {
      const { error } = await supabase
        .from("trainer_specialty_assignments")
        .upsert(
          toAdd.map((specialty) => ({ trainer_id: userId, specialty })),
          { onConflict: "trainer_id,specialty", ignoreDuplicates: true },
        );
      writeError = error?.message ?? null;
    } catch {
      writeError = GENERIC_ERROR;
    }
    if (writeError) {
      return { error: writeError };
    }
  }
  if (toRemove.length > 0) {
    try {
      const { error } = await supabase
        .from("trainer_specialty_assignments")
        .delete()
        .eq("trainer_id", userId)
        .in("specialty", toRemove);
      writeError = error?.message ?? null;
    } catch {
      writeError = GENERIC_ERROR;
    }
    if (writeError) {
      return { error: writeError };
    }
  }

  // The diff is read-modify-write without a transaction: two concurrent
  // saves can each delete the other's keepers and strand ZERO specialties
  // (review finding — the one path below the ≥1 floor the schema holds
  // everywhere else). Re-assert the invariant: re-read, and if the race
  // hit, re-insert this submit's chosen set (idempotent upsert).
  const { count: finalCount } = await supabase
    .from("trainer_specialty_assignments")
    .select("specialty", { count: "exact", head: true })
    .eq("trainer_id", userId);
  if ((finalCount ?? 0) === 0) {
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

// ---------------------------------------------------------------------------
// Availability — the project's FIRST HARD-DELETE surface. Deliberate
// deviations from the services/dogs pattern, each commented at its site:
// these tables are CONFIG, not record (no deleted_at column; real DELETE
// grant + policies), so deletes are real .delete() and there is no
// view-spec floor. Everything else keeps the discipline: zod → auth →
// role → scoped writes → row-count rule → { success } sentinel.
// ---------------------------------------------------------------------------

export type AvailabilityActionState =
  | { error: string }
  | { success: true }
  | null;

export async function addWeeklySlot(
  _prevState: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const parsed = weeklySlotSchema.safeParse({
    dayOfWeek: formData.get("dayOfWeek"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const ctx = await requireTrainer();
  if ("error" in ctx) {
    return ctx;
  }

  // Same FK reality as services: availability rows attach to the trainers
  // row — 'none' must be turned away with a helpful message, not an FK error.
  const state = await getOnboardingState(ctx.supabase, ctx.userId);
  if (state === "none") {
    return {
      error: "Create your trainer listing first — then set your hours.",
    };
  }

  // OVERLAP GUARD (design surprise #1): the schema PERMITS same-day overlaps
  // (UNIQUE is on start_time only) and the slot-math module unions them —
  // but the UI shouldn't create what the math has to clean up, so entry
  // rejects overlaps with a friendly pointer at the colliding window.
  // Adjacency (end == start) is allowed — it isn't overlap. The two-tab race
  // (both pass the check, both insert) is tolerable BECAUSE the module
  // unions: worst case is a redundant row, never wrong slots.
  const { slots, error: readError } = await getWeeklyPattern(
    ctx.supabase,
    ctx.userId,
  );
  if (readError) {
    return { error: GENERIC_ERROR };
  }
  const collision = slots.find(
    (s) =>
      s.day_of_week === parsed.data.dayOfWeek &&
      parsed.data.startTime < s.end_time &&
      s.start_time < parsed.data.endTime,
  );
  if (collision) {
    return {
      error: `That overlaps your ${formatTimeOfDay(collision.start_time)}–${formatTimeOfDay(collision.end_time)} window on ${DAY_OF_WEEK_LABELS[collision.day_of_week]}.`,
    };
  }

  let writeError: string | null = null;
  try {
    const { error } = await ctx.supabase.from("trainer_availability").insert({
      trainer_id: ctx.userId,
      day_of_week: parsed.data.dayOfWeek,
      start_time: parsed.data.startTime,
      end_time: parsed.data.endTime,
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

export async function deleteWeeklySlot(
  _prevState: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const parsedId = availabilityIdSchema.safeParse(formData.get("slotId"));
  if (!parsedId.success) {
    return { error: parsedId.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const ctx = await requireTrainer();
  if ("error" in ctx) {
    return ctx;
  }

  // REAL delete — the deliberate deviation: availability is config (no
  // deleted_at column exists; the DELETE grant + own-rows policy are live,
  // M7-verified). The row-count rule still applies: RLS makes cross-trainer
  // deletes silent 0-row no-ops, so 0 rows = honest "not found".
  let deleted: { id: string } | null = null;
  let writeError: string | null = null;
  try {
    const { data, error } = await ctx.supabase
      .from("trainer_availability")
      .delete()
      .eq("id", parsedId.data)
      .eq("trainer_id", ctx.userId)
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
    return { error: "That availability window could not be found." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function addException(
  _prevState: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const kind = formData.get("kind");
  const parsed = exceptionSchema.safeParse(
    kind === "blocked"
      ? { kind, date: formData.get("date") }
      : {
          kind,
          date: formData.get("date"),
          startTime: formData.get("startTime"),
          endTime: formData.get("endTime"),
        },
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const ctx = await requireTrainer();
  if ("error" in ctx) {
    return ctx;
  }

  const state = await getOnboardingState(ctx.supabase, ctx.userId);
  if (state === "none") {
    return {
      error: "Create your trainer listing first — then set your hours.",
    };
  }

  let writeError: string | null = null;
  try {
    const { error } = await ctx.supabase
      .from("trainer_availability_exceptions")
      .insert({
        trainer_id: ctx.userId,
        exception_date: parsed.data.date,
        is_blocked: parsed.data.kind === "blocked",
        start_time: parsed.data.kind === "replace" ? parsed.data.startTime : null,
        end_time: parsed.data.kind === "replace" ? parsed.data.endTime : null,
      });
    // UNIQUE (trainer_id, exception_date) — verified in the Group-0 pass.
    // One exception per date is the schema's rule; surface the 23505 as a
    // friendly message instead of a raw constraint error.
    writeError =
      error?.code === "23505"
        ? "You already have an exception for that date — delete it first."
        : (error?.message ?? null);
  } catch {
    writeError = GENERIC_ERROR;
  }
  if (writeError) {
    return { error: writeError };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteException(
  _prevState: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const parsedId = availabilityIdSchema.safeParse(formData.get("exceptionId"));
  if (!parsedId.success) {
    return { error: parsedId.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const ctx = await requireTrainer();
  if ("error" in ctx) {
    return ctx;
  }

  // REAL delete + row-count rule — same deviation and same reasons as
  // deleteWeeklySlot.
  let deleted: { id: string } | null = null;
  let writeError: string | null = null;
  try {
    const { data, error } = await ctx.supabase
      .from("trainer_availability_exceptions")
      .delete()
      .eq("id", parsedId.data)
      .eq("trainer_id", ctx.userId)
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
    return { error: "That exception could not be found." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

// ============================================================================
// Calendar feed (M15) — generate/rotate + disable
// ============================================================================

export type FeedRotateState = { error: string } | { url: string } | null;
export type FeedDisableState = { error: string } | { success: true } | null;

/**
 * Generate-or-rotate the caller's ICS feed token via the M15 DEFINER
 * function (EXECUTE: authenticated; the function itself enforces the
 * trainer gate — structural evidence against `trainers`, not the profile
 * role value).
 *
 * PLAINTEXT-ONCE (ruling 4): the token exists in exactly two places — the
 * DEFINER function's return value and this action's response, which the
 * client renders once. It is never stored (only its sha256 lands in
 * trainer_feed_tokens), never logged, and never re-shown; the settings
 * surface afterwards displays only row METADATA (created/rotated dates).
 * The action returns the FULL subscribe URL, not the bare token — the UI
 * never assembles credentials.
 */
export async function rotateFeedToken(): Promise<FeedRotateState> {
  // No params on purpose: the action reads nothing from the form and a
  // zero-arg function is assignable where useActionState expects
  // (state, payload) — no underscore-park needed.
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    redirect("/login");
  }

  let token: string | null = null;
  try {
    const { data, error } = await supabase.rpc("rotate_feed_token");
    if (error) {
      // Deliberately not echoing error.message: the only interesting
      // failure ("Caller is not a trainer") is unreachable through this
      // UI (the card renders on the trainer fork only), and everything
      // else is internals the user can't act on.
      console.error("[FEED] rotate failed:", error.message);
      return { error: GENERIC_ERROR };
    }
    token = data;
  } catch (e) {
    console.error("[FEED] rotate threw:", e);
    return { error: GENERIC_ERROR };
  }

  if (!token) {
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/account");
  return { url: siteUrl(`/api/calendar/${token}`) };
}

/**
 * Disable the feed: RLS-scoped DELETE of the caller's own token row (the
 * M15 "row absence is a first-class state" — the route 404s from the next
 * poll). Row-count rule: a 0-row delete is an error, not a silent success
 * (the button only renders when a row exists, so 0 rows means state
 * drifted — say so rather than pretend).
 */
export async function disableFeed(): Promise<FeedDisableState> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  let deleted: { trainer_id: string } | null = null;
  try {
    const { data, error } = await supabase
      .from("trainer_feed_tokens")
      .delete()
      .eq("trainer_id", userId)
      .select("trainer_id")
      .maybeSingle();
    if (error) {
      console.error("[FEED] disable failed:", error.message);
      return { error: GENERIC_ERROR };
    }
    deleted = data;
  } catch (e) {
    console.error("[FEED] disable threw:", e);
    return { error: GENERIC_ERROR };
  }

  if (!deleted) {
    return { error: "No feed to disable — refresh and try again." };
  }

  revalidatePath("/account");
  return { success: true };
}

// ============================================================================
// External calendar (M16, import half) — subscribe/replace + remove
// ============================================================================

export type ExternalCalendarState = { error: string } | { success: true } | null;

/**
 * Subscribe (or replace) the caller's external calendar URL via the M16
 * DEFINER lane (EXECUTE authenticated; the function enforces the trainer
 * gate + the https shape-check). The FULL SSRF validation runs later at
 * fetch time (lib/feed/fetch-ics) — a URL that is never fetched leaks
 * nothing, and DNS-rebind can only be judged at connect time. Re-paste
 * resets fetch state, so the next booking-page read fetches synchronously.
 *
 * The URL is never returned to the client and never logged — the caller
 * already has it (they typed it); the status card afterwards shows only
 * metadata.
 */
export async function setExternalCalendar(
  _prevState: ExternalCalendarState,
  formData: FormData,
): Promise<ExternalCalendarState> {
  // Auth is the first line (CLAUDE.md) — before we validate any input.
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    redirect("/login");
  }

  const parsed = externalCalendarUrlSchema.safeParse(formData.get("url"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  // NORMALIZE before the RPC so the client check, the action, and the
  // fetcher all agree on one https URL. Without this, a valid webcal://
  // (Apple/iCloud/Outlook hand these out) or an uppercase HTTPS:// passes
  // the client + Zod checks but the RPC's case-sensitive `^https://` guard
  // rejects it → a dead-end GENERIC_ERROR (the review's confirmed bug).
  // validateExternalCalendarUrl (the SSRF shape gate) lowercases the scheme
  // and rewrites webcal://→https://, and rejects IP-literal/internal hosts
  // here too — defense in depth, before anything is even stored.
  const { validateExternalCalendarUrl } = await import("@/lib/feed/fetch-ics");
  const shaped = validateExternalCalendarUrl(parsed.data);
  if (!shaped.ok) {
    return { error: shaped.error };
  }

  try {
    const { error } = await supabase.rpc("set_external_calendar", {
      cal_url: shaped.url,
    });
    if (error) {
      // "not a trainer" is unreachable through this UI (trainer fork only);
      // the https/host shape is already normalized+validated above. Anything
      // else is internals — never echo error.message (it can carry the URL).
      console.error("[EXTCAL] set failed for trainer", claimsData.claims.sub);
      return { error: GENERIC_ERROR };
    }
  } catch (e) {
    console.error("[EXTCAL] set threw:", e);
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/account");
  return { success: true };
}

/**
 * Remove the subscription: RLS-scoped DELETE of the caller's own row. The
 * CASCADE clears the busy blocks, so the trainer's slots unblock — the UI
 * confirm copy says exactly that. Row-count rule: a 0-row delete is state
 * drift (the button only shows when a row exists), surfaced not swallowed.
 */
export async function removeExternalCalendar(): Promise<ExternalCalendarState> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  let deleted: { trainer_id: string } | null = null;
  try {
    const { data, error } = await supabase
      .from("trainer_external_calendars")
      .delete()
      .eq("trainer_id", userId)
      .select("trainer_id")
      .maybeSingle();
    if (error) {
      console.error("[EXTCAL] remove failed:", error.message);
      return { error: GENERIC_ERROR };
    }
    deleted = data;
  } catch (e) {
    console.error("[EXTCAL] remove threw:", e);
    return { error: GENERIC_ERROR };
  }

  if (!deleted) {
    return { error: "No calendar to remove — refresh and try again." };
  }

  revalidatePath("/account");
  return { success: true };
}

// ============================================================================
// Payment info (M17) — the trainer's off-platform "how I take payment"
// ============================================================================

export type PaymentInfoState = { error: string } | { success: true } | null;

/**
 * Upsert the caller's payment info. Own-row RLS scopes the write; the DB
 * CHECK charsets mirror the zod handle validation. Empty fields clear a rail
 * (stored NULL). INFORMATION DISPLAY ONLY — no money moves.
 */
export async function updatePaymentInfo(
  _prevState: PaymentInfoState,
  formData: FormData,
): Promise<PaymentInfoState> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  const parsed = paymentInfoSchema.safeParse({
    instructions: formData.get("instructions") ?? "",
    venmo: formData.get("venmo") ?? "",
    paypal: formData.get("paypal") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  try {
    const { error } = await supabase.from("trainer_payment_info").upsert({
      trainer_id: userId,
      instructions: parsed.data.instructions ?? null,
      venmo_handle: parsed.data.venmo ?? null,
      paypal_handle: parsed.data.paypal ?? null,
    });
    if (error) {
      console.error("[PAYMENT] upsert failed:", error.message);
      return { error: GENERIC_ERROR };
    }
  } catch (e) {
    console.error("[PAYMENT] upsert threw:", e);
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/account");
  return { success: true };
}
