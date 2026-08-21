"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { getBusyRanges } from "@/lib/trainer/busy";
import { ensureExternalCalendarFresh } from "@/lib/trainer/external-sync";
import { getExceptions, getWeeklyPattern } from "@/lib/trainer/availability";
import { computeBookableSlots } from "@/lib/trainer/schedule";
import { getActiveService } from "@/lib/trainer/services";
import { requestReceived } from "@/lib/mail/templates";
import { sendMail } from "@/lib/mail/send";
import { createClient } from "@/lib/supabase/server";
import { getUserEmail } from "@/lib/supabase/admin";
import { getActiveDogs } from "@/lib/owner/dogs";
import {
  BOOKING_WINDOW_DAYS,
  createBookingSchema,
} from "@/lib/validators/booking";
import { dogIdSchema, dogSchema } from "@/lib/validators/dog";

/**
 * Owner Server Actions — the owner-side twin of (trainer)/actions.ts, same
 * trusted-boundary discipline throughout: zod parse → auth → role check →
 * writes scoped to the caller + active rows → row-count rule → serializable
 * state with the { success } sentinel.
 */

export type DogActionState = { error: string } | { success: true } | null;

const GENERIC_ERROR = "Something went wrong. Please try again.";
const VALIDATION_ERROR = "Please check the form and try again.";

/**
 * Shared prelude: authenticated caller with an OWNER profile, or the
 * appropriate exit (redirect for no session, { error } for wrong role).
 * Mirror of requireTrainer — role isn't in the JWT, so it's read from
 * profiles.
 */
async function requireOwner(): Promise<
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
  if (profile?.role !== "owner") {
    return { error: "Only dog-owner accounts can manage dogs." };
  }
  return { supabase, userId };
}

const parseDogForm = (formData: FormData) =>
  dogSchema.safeParse({
    name: formData.get("name"),
    breed: formData.get("breed") ?? "",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
    temperamentNotes: formData.get("temperamentNotes") ?? "",
  });

export async function createDog(
  _prevState: DogActionState,
  formData: FormData,
): Promise<DogActionState> {
  const parsed = parseDogForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const ctx = await requireOwner();
  if ("error" in ctx) {
    return ctx;
  }

  // No precursor-row guard needed (unlike createService's onboarding gate):
  // dogs attach directly to the profiles row, which signup's trigger minted.
  let writeError: string | null = null;
  try {
    const { error } = await ctx.supabase.from("dogs").insert({
      owner_id: ctx.userId,
      name: parsed.data.name,
      breed: parsed.data.breed,
      date_of_birth: parsed.data.dateOfBirth,
      temperament_notes: parsed.data.temperamentNotes,
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

export async function updateDog(
  _prevState: DogActionState,
  formData: FormData,
): Promise<DogActionState> {
  const parsedId = dogIdSchema.safeParse(formData.get("dogId"));
  const parsed = parseDogForm(formData);
  if (!parsedId.success || !parsed.success) {
    return {
      error:
        parsedId.error?.issues[0]?.message ??
        parsed.error?.issues[0]?.message ??
        VALIDATION_ERROR,
    };
  }

  const ctx = await requireOwner();
  if ("error" in ctx) {
    return ctx;
  }

  // .eq(owner_id) is belt-and-suspenders with RLS; the ROW-COUNT check is the
  // load-bearing part (cross-owner and nonexistent-id UPDATEs are silent
  // 0-row no-ops under RLS). .is(deleted_at, null): the view-spec rule
  // applies to writes — a soft-deleted id from a stale form is "not found".
  let updated: { id: string } | null = null;
  let writeError: string | null = null;
  try {
    const { data, error } = await ctx.supabase
      .from("dogs")
      .update({
        name: parsed.data.name,
        breed: parsed.data.breed,
        date_of_birth: parsed.data.dateOfBirth,
        temperament_notes: parsed.data.temperamentNotes,
      })
      .eq("id", parsedId.data)
      .eq("owner_id", ctx.userId)
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
    return { error: "That dog could not be found." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteDog(
  _prevState: DogActionState,
  formData: FormData,
): Promise<DogActionState> {
  const parsedId = dogIdSchema.safeParse(formData.get("dogId"));
  if (!parsedId.success) {
    return { error: parsedId.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  const ctx = await requireOwner();
  if ("error" in ctx) {
    return ctx;
  }

  // SOFT delete — dogs has no DELETE grant (M7: soft-delete tables keep
  // authenticated at SELECT/INSERT/UPDATE), and booking history FKs dogs
  // with ON DELETE RESTRICT anyway. Same row-count + active-only rules as
  // updateDog.
  let deleted: { id: string } | null = null;
  let writeError: string | null = null;
  try {
    const { data, error } = await ctx.supabase
      .from("dogs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", parsedId.data)
      .eq("owner_id", ctx.userId)
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
    return { error: "That dog could not be found." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Booking — the flow's one write. Arc C creates; Arc D transitions.
// ---------------------------------------------------------------------------

export type BookingActionState = { error: string } | null;

const MS_PER_DAY = 86_400_000;

export async function createBooking(
  _prevState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  // (a) The client sends three ids-and-an-instant, nothing else.
  const parsed = createBookingSchema.safeParse({
    serviceId: formData.get("serviceId"),
    dogId: formData.get("dogId"),
    slotStartUtc: formData.get("slotStartUtc"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? VALIDATION_ERROR };
  }

  // (b)
  const ctx = await requireOwner();
  if ("error" in ctx) {
    return { error: "Only dog-owner accounts can book." };
  }

  // (c) The service is the G2/G3 source: trainer_id + the price/duration
  // snapshots come from THIS row — the trigger audits the copy. The dog is
  // G1's precondition, friendly-checked before the trigger would reject.
  const { service } = await getActiveService(ctx.supabase, parsed.data.serviceId);
  if (!service) {
    return { error: "That service is no longer offered." };
  }
  const { dogs } = await getActiveDogs(ctx.supabase, ctx.userId);
  if (!dogs.some((d) => d.id === parsed.data.dogId)) {
    return { error: "That dog could not be found." };
  }

  // (d) THE RECOMPUTE-MEMBERSHIP GUARD — the action's spine. The DB never
  // checks availability: the EXCLUDE constraint only stops booking-vs-booking
  // overlap, so this recompute is BOTH the security check (a crafted POST
  // cannot book 3 AM outside the trainer's hours) and the staleness check
  // (hours changed, slot taken, or the floor slipped past since render).
  // 'now' = the real clock: determinism-as-parameter still holds — the TEST
  // double injects a fixture instant, production injects new Date().
  const { data: trainer } = await ctx.supabase
    .from("trainers")
    .select("timezone")
    .eq("id", service.trainer_id)
    .maybeSingle();
  if (!trainer) {
    return { error: "That service is no longer offered." };
  }

  const { slots: pattern, error: patternError } = await getWeeklyPattern(
    ctx.supabase,
    service.trainer_id,
  );
  const todayLocal = new Intl.DateTimeFormat("en-CA", {
    timeZone: trainer.timezone,
  }).format(new Date());
  const [ty = 0, tm = 1, td = 1] = todayLocal.split("-").map(Number);
  const toDateLocal = new Date(
    Date.UTC(ty, tm - 1, td) + (BOOKING_WINDOW_DAYS - 1) * MS_PER_DAY,
  )
    .toISOString()
    .slice(0, 10);
  const { exceptions, error: exceptionsError } = await getExceptions(
    ctx.supabase,
    service.trainer_id,
    todayLocal,
  );
  // M16: same fetch-on-read moment as the book page — createBooking's slot
  // revalidation must judge against the same external blocks the picker saw.
  await ensureExternalCalendarFresh(service.trainer_id, trainer.timezone);
  const { busy, error: busyError } = await getBusyRanges(
    ctx.supabase,
    service.trainer_id,
  );
  if (patternError || exceptionsError || busyError) {
    return { error: GENERIC_ERROR };
  }

  const offered = computeBookableSlots({
    pattern,
    exceptions,
    bookings: busy,
    timezone: trainer.timezone,
    durationMinutes: service.duration_minutes,
    fromDateLocal: todayLocal,
    toDateLocal,
    now: new Date(),
  });
  if (!offered.some((slot) => slot.startUtc === parsed.data.slotStartUtc)) {
    return { error: "That time isn't available — pick another slot." };
  }

  // (e) The INSERT. status defaults to PENDING (the trigger requires PENDING
  // entry); stripe_payment_intent_id stays NULL (M11 — the system path
  // attaches it in Phase 8).
  let created: { id: string } | null = null;
  let failure: string | null = null;
  try {
    const { data, error } = await ctx.supabase
      .from("bookings")
      .insert({
        owner_id: ctx.userId,
        trainer_id: service.trainer_id, // from the SERVICE row, never the client
        dog_id: parsed.data.dogId,
        service_id: service.id,
        starts_at: parsed.data.slotStartUtc,
        duration_minutes: service.duration_minutes, // G3 snapshots — server-copied
        price_cents: service.price_cents,
      })
      .select("id")
      .maybeSingle();
    created = data;

    // (f) The failure map. Unlike the services actions (which surface raw
    // error.message), trigger raises here are engineer-facing — map the known
    // ones to friendly forms, everything else to generic.
    if (error) {
      if (error.code === "23P01") {
        // The EXCLUDE race: someone took the slot between recompute and
        // insert. This catch is unconditional — races exist with perfect data.
        failure = "That time was just taken — pick another slot.";
      } else if (error.code === "23514" && error.message.includes("15 minutes")) {
        // The +15 floor. The module's floor matches the trigger's EXACTLY
        // (MIN_LEAD_MINUTES parity), so an OFFERED slot cannot honestly
        // violate it — this entry is purely the recompute-to-insert race net
        // (proven unconstructible through the front door in the Arc-C live
        // proof; the DB layer's 23514 probe-verified).
        failure = "That time just passed — pick another slot.";
      } else if (error.code === "23503") {
        // A G1/G2 raise: the dog or service changed under us post-precheck.
        failure = "That dog or service could not be found.";
      } else {
        failure = GENERIC_ERROR;
      }
    }
  } catch {
    failure = GENERIC_ERROR;
  }
  if (failure) {
    return { error: failure };
  }
  if (!created) {
    return { error: GENERIC_ERROR };
  }

  // NOTIFY THE TRAINER — registered BEFORE redirect() throws (the docs'
  // guarantee: "after will be executed even if ... notFound or redirect is
  // called" — register-before-the-throw is the corollary). The callback runs
  // post-response: fetching the owner's name + dog name here costs the
  // user's click nothing. getUserEmail is the ONLY admin-surface touch; the
  // display fields come through the caller's own RLS.
  const dogId = parsed.data.dogId;
  const slotStartUtc = parsed.data.slotStartUtc;
  after(async () => {
    try {
      const email = await getUserEmail(service.trainer_id);
      if (!email) return;
      const [{ data: ownerProfile }, { data: dog }] = await Promise.all([
        ctx.supabase.from("profiles").select("display_name").eq("id", ctx.userId).maybeSingle(),
        ctx.supabase.from("dogs").select("name").eq("id", dogId).maybeSingle(),
      ]);
      const mail = requestReceived({
        counterpartyName: ownerProfile?.display_name ?? null,
        dogName: dog?.name ?? "their dog",
        serviceName: service.name,
        startsAtIso: slotStartUtc,
        trainerTimezone: trainer.timezone,
        priceCents: service.price_cents,
      });
      await sendMail({ to: email, ...mail });
    } catch (e) {
      console.error("[MAIL] request notification failed:", e); // never surfaces
    }
  });

  revalidatePath("/", "layout");
  // House pattern: redirect in the ACTION, outside any try/catch (redirect
  // throws NEXT_REDIRECT — a catch would swallow it). The id rides the URL
  // so the landing can render the confirmation moment (flow ruling #3).
  redirect(`/owner/bookings?requested=${created.id}`);
}
