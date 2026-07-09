"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lookup } from "zipcodes";

import { createClient } from "@/lib/supabase/server";
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    // Validate-at-startup rule, applied at the boundary that needs it: a
    // feed URL built on a missing origin would be copyable garbage.
    console.error("[FEED] NEXT_PUBLIC_SITE_URL is not set");
    return { error: GENERIC_ERROR };
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
  return { url: `${siteUrl}/api/calendar/${token}` };
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
