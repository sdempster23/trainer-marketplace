"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  cancelledByOwner,
  completed,
  confirmed,
  declinedByTrainer,
  type BookingMailContext,
} from "@/lib/mail/templates";
import { sendMail } from "@/lib/mail/send";
import { createClient } from "@/lib/supabase/server";
import { getUserEmail } from "@/lib/supabase/admin";
import type { Database } from "@/types/supabase";

/**
 * Booking transitions — Arc D's verbs over the M6 state machine.
 *
 * THE HOME, argued: transitions are verbs on a TWO-PARTY OBJECT. Grouping by
 * object (this file) keeps one shared prelude and one race-map; a role split
 * would duplicate both and still leave cancelBooking — which either party
 * may call — homeless. (The (account) precedent: role-universal gets its own
 * group.)
 *
 * THE UI-VERB → STATUS-VERB MAPPING: "Decline" IS cancel-with-trainer-
 * attribution — no DECLINED status exists; a trainer declining a PENDING
 * request and a trainer cancelling a CONFIRMED session are the same
 * transition (→ CANCELLED, cancelled_by='trainer') wearing different
 * button labels. The split is purely presentational (Group 2's copy).
 *
 * WHAT THE ACTIONS SEND: only `status` (+ `cancelled_by` on cancels). The
 * §10 trigger auto-fills cancelled_at/completed_at and enforces the
 * attribution matches the actor — we set it honestly, the trigger audits.
 *
 * THE TWO-TAB RACE, two nets: every UPDATE is scoped to the EXPECTED
 * current status (.eq/.in on status), so a stale tab's transition is a
 * silent 0-row no-op → the row-count rule converts it to the friendly
 * "already changed" message deterministically. The trigger's plain-P0001
 * raises stay mapped as the backstop for anything that slips between the
 * WHERE re-check and the row lock.
 */

export type TransitionActionState =
  | { error: string }
  | { success: true }
  | null;

const bookingIdSchema = z.uuid("Invalid booking.");

const GENERIC_ERROR = "Something went wrong. Please try again.";
const RACE_MESSAGE = "This booking already changed — refresh and try again.";

/** Auth-only prelude (no role check: the booking row's party columns are the
 * authority — RLS + the .eq scoping decide who may do what). */
async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }
  return { supabase, userId };
}

/** The backstop map for trigger P0001s (plain raises — the update trigger,
 * unlike the insert gate, does not tag errcodes). */
function mapTriggerError(message: string): string {
  if (message.includes("Cannot complete before session start")) {
    // completeBooking's one NON-race rejection: time-based, reachable
    // whenever the trainer clicks early.
    return "You can only complete a session after it starts.";
  }
  if (message.includes("Cannot confirm a booking whose start time has passed")) {
    return "That booking's start time has passed.";
  }
  if (message.includes("illegal transition") || message.includes("not a party")) {
    return RACE_MESSAGE;
  }
  return GENERIC_ERROR;
}


/**
 * The shared post-transition send (module-private — "use server" constrains
 * EXPORTS to actions; helpers stay internal). Runs INSIDE after(): fetches
 * the booking's display context through the CALLER's own RLS (they're a
 * party — the embeds are theirs to read) and touches the admin surface for
 * exactly one thing, the recipient's address — the split that keeps
 * lib/supabase/admin.ts one function wide. Everything swallowed: a mail
 * failure must never surface anywhere.
 */
async function sendTransitionMail(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  kind: "confirmed" | "completed" | "cancelledByOwner" | "declinedByTrainer",
): Promise<void> {
  try {
    const { data: b } = await supabase
      .from("bookings")
      .select(
        "owner_id, trainer_id, starts_at, price_cents, dogs(name), trainer_services(name), trainers(timezone, profiles(display_name)), profiles(display_name)",
      )
      .eq("id", bookingId)
      .maybeSingle();
    if (!b) return;

    // Recipient is the OTHER party per template direction; counterpartyName
    // is the SENDER-side party the recipient reads about.
    const toOwner = kind !== "cancelledByOwner";
    const recipientId = toOwner ? b.owner_id : b.trainer_id;
    const email = await getUserEmail(recipientId);
    if (!email) return;

    const context: BookingMailContext = {
      counterpartyName: toOwner
        ? (b.trainers?.profiles.display_name ?? null)
        : (b.profiles?.display_name ?? null),
      dogName: b.dogs?.name ?? "their dog",
      serviceName: b.trainer_services?.name ?? "the session",
      startsAtIso: b.starts_at,
      trainerTimezone: b.trainers?.timezone ?? "UTC",
      priceCents: b.price_cents,
    };
    const render = { confirmed, completed, cancelledByOwner, declinedByTrainer }[kind];
    await sendMail({ to: email, ...render(context) });
  } catch (e) {
    console.error(`[MAIL] ${kind} notification failed:`, e);
  }
}

export async function confirmBooking(
  _prevState: TransitionActionState,
  formData: FormData,
): Promise<TransitionActionState> {
  const parsed = bookingIdSchema.safeParse(formData.get("bookingId"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }
  const { supabase, userId } = await requireUser();

  let updated: { id: string } | null = null;
  let failure: string | null = null;
  try {
    const { data, error } = await supabase
      .from("bookings")
      .update({ status: "CONFIRMED" })
      .eq("id", parsed.data)
      .eq("trainer_id", userId) // trainer-only, belt-and-suspenders with RLS
      .eq("status", "PENDING") // expected-status scoping: stale tab → 0 rows
      .select("id")
      .maybeSingle();
    updated = data;
    failure = error ? mapTriggerError(error.message) : null;
  } catch {
    failure = GENERIC_ERROR;
  }
  if (failure) {
    return { error: failure };
  }
  if (!updated) {
    return { error: RACE_MESSAGE };
  }

  after(() => sendTransitionMail(supabase, parsed.data, "confirmed"));
  revalidatePath("/", "layout");
  return { success: true };
}

export async function completeBooking(
  _prevState: TransitionActionState,
  formData: FormData,
): Promise<TransitionActionState> {
  const parsed = bookingIdSchema.safeParse(formData.get("bookingId"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }
  const { supabase, userId } = await requireUser();

  let updated: { id: string } | null = null;
  let failure: string | null = null;
  try {
    const { data, error } = await supabase
      .from("bookings")
      .update({ status: "COMPLETED" }) // completed_at auto-fills in the trigger
      .eq("id", parsed.data)
      .eq("trainer_id", userId)
      .eq("status", "CONFIRMED")
      .select("id")
      .maybeSingle();
    updated = data;
    failure = error ? mapTriggerError(error.message) : null;
  } catch {
    failure = GENERIC_ERROR;
  }
  if (failure) {
    return { error: failure };
  }
  if (!updated) {
    return { error: RACE_MESSAGE };
  }

  after(() => sendTransitionMail(supabase, parsed.data, "completed"));
  revalidatePath("/", "layout");
  return { success: true };
}

export async function cancelBooking(
  _prevState: TransitionActionState,
  formData: FormData,
): Promise<TransitionActionState> {
  const parsed = bookingIdSchema.safeParse(formData.get("bookingId"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }
  const { supabase, userId } = await requireUser();

  // EITHER party — attribution derives from the caller's POSITION on the
  // row (fetched under their own RLS: a non-party sees nothing and exits at
  // the not-found message). The trigger enforces the attribution matches
  // the actor; we set it honestly from the same row it will check.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, owner_id, trainer_id")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!booking) {
    return { error: "That booking could not be found." };
  }
  const isOwner = booking.owner_id === userId;
  const isTrainer = booking.trainer_id === userId;
  if (!isOwner && !isTrainer) {
    // Unreachable under RLS (parties-only read) — kept as the honest guard.
    return { error: "That booking could not be found." };
  }
  const partyColumn = isOwner ? "owner_id" : "trainer_id";
  const cancelledBy = isOwner ? "owner" : "trainer";

  let updated: { id: string } | null = null;
  let failure: string | null = null;
  try {
    const { data, error } = await supabase
      .from("bookings")
      .update({ status: "CANCELLED", cancelled_by: cancelledBy })
      .eq("id", parsed.data)
      .eq(partyColumn, userId)
      .in("status", ["PENDING", "CONFIRMED"]) // the cancellable states
      .select("id")
      .maybeSingle();
    updated = data;
    failure = error ? mapTriggerError(error.message) : null;
  } catch {
    failure = GENERIC_ERROR;
  }
  if (failure) {
    return { error: failure };
  }
  if (!updated) {
    return { error: RACE_MESSAGE };
  }

  // Attribution forks the template: owner-cancel notifies the TRAINER;
  // trainer-cancel (Decline included) notifies the OWNER via
  // declinedByTrainer — reviewed for BOTH trainer-cancel cases: the copy
  // speaks to the outcome ("can't make it"), not the prior status, and
  // "nothing was charged" is universally true pre-Phase-8.
  after(() =>
    sendTransitionMail(
      supabase,
      parsed.data,
      cancelledBy === "owner" ? "cancelledByOwner" : "declinedByTrainer",
    ),
  );
  revalidatePath("/", "layout");
  return { success: true };
}
