"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMail } from "@/lib/mail/send";
import { newMessage } from "@/lib/mail/templates";
import { shouldSendNewMessageEmail } from "@/lib/messages/unread";
import { getUserEmail } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dbIdSchema } from "@/lib/validators/id";
import { messageBodySchema } from "@/lib/validators/message";
import type { Database } from "@/types/supabase";

/**
 * Messaging verbs — the app layer over M8/M9. Role-universal (either party
 * converses), so this group follows the (account) precedent: one shared
 * actions file, no role fork (ruling 4).
 *
 * THE CONTRACT THESE LEAN ON (all proven live before this file was
 * written): threads are freestanding — the INSERT policy gates only "you
 * are one of the two named parties", and the DEFINER trigger validates the
 * owner-role fact globally, so a caller must NEVER pre-read the
 * counterparty's profile to validate them (a trainer literally cannot — the
 * M11 policy is booking-scoped). Insert and map errors; the DB is the
 * validator. UNIQUE (owner_id, trainer_id) means one canonical thread per
 * pair — every entry point is find-or-create.
 */

export type MessageActionState =
  | { error: string }
  | { success: true }
  | null;

const counterpartyIdSchema = dbIdSchema("Invalid profile.");
const threadIdSchema = dbIdSchema("Invalid conversation.");
const bookingIdSchema = dbIdSchema("Invalid booking.");

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NOT_FOUND_MESSAGE = "That conversation could not be found.";

/** Auth-only prelude (the (bookings) idiom — no role check here; each verb
 * derives authority from the row's party columns + RLS). */
async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }
  return { supabase, userId };
}

/**
 * Find the pair's canonical thread or create it; land on the conversation.
 * Redirects on success (the createBooking precedent — the action owns its
 * landing), returns { error } otherwise.
 *
 * Orientation: the ONE fact the caller can always read is their own role
 * ("Users read their own profile") — the counterparty's role is exactly
 * what may be RLS-invisible, and the DEFINER trigger validates it anyway.
 * So: read my role once, place myself in my column, the counterparty in
 * the other. Cheapest honest shape.
 */
export async function findOrCreateThread(
  _prevState: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  const parsedCounterparty = counterpartyIdSchema.safeParse(
    formData.get("counterpartyId"),
  );
  if (!parsedCounterparty.success) {
    return { error: parsedCounterparty.error.issues[0]?.message ?? GENERIC_ERROR };
  }
  const rawBookingId = formData.get("bookingId");
  const parsedBooking =
    typeof rawBookingId === "string" && rawBookingId !== ""
      ? bookingIdSchema.safeParse(rawBookingId)
      : null;
  if (parsedBooking && !parsedBooking.success) {
    return { error: parsedBooking.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const { supabase, userId } = await requireUser();
  if (parsedCounterparty.data === userId) {
    return { error: "You can't message yourself." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.role !== "owner" && profile?.role !== "trainer") {
    return { error: GENERIC_ERROR };
  }
  const ownerId = profile.role === "owner" ? userId : parsedCounterparty.data;
  const trainerId = profile.role === "owner" ? parsedCounterparty.data : userId;

  // The booking link is a CONTEXT NICETY, and it is IMMUTABLE post-INSERT
  // (M8 §5 freeze) — it can only ever attach at creation, and an existing
  // thread keeps whatever it has. Verify the claimed booking belongs to
  // this exact pair under the caller's own RLS; on any mismatch or
  // invisibility, DROP the link rather than fail the action — a wrong
  // context hint must not block the conversation.
  let bookingId: string | null = null;
  if (parsedBooking?.success) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, owner_id, trainer_id")
      .eq("id", parsedBooking.data)
      .maybeSingle();
    if (booking?.owner_id === ownerId && booking?.trainer_id === trainerId) {
      bookingId = booking.id;
    }
  }

  let threadId: string | null = null;
  let failure: string | null = null;
  try {
    // Find first: UNIQUE (owner_id, trainer_id) makes the pair canonical.
    const { data: existing } = await supabase
      .from("message_threads")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("trainer_id", trainerId)
      .maybeSingle();
    if (existing) {
      threadId = existing.id;
    } else {
      const { data: created, error } = await supabase
        .from("message_threads")
        .insert({ owner_id: ownerId, trainer_id: trainerId, booking_id: bookingId })
        .select("id")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") {
          // THE RACE: two tabs (or both parties) hit "Message" between our
          // find and our insert — someone else created the pair's thread.
          // The unique constraint is the arbiter; the loser re-selects the
          // winner's row. Proven live: 23505 on
          // message_threads_owner_id_trainer_id_key.
          const { data: raced } = await supabase
            .from("message_threads")
            .select("id")
            .eq("owner_id", ownerId)
            .eq("trainer_id", trainerId)
            .maybeSingle();
          threadId = raced?.id ?? null;
          failure = threadId ? null : GENERIC_ERROR;
        } else if (error.code === "23503") {
          // FK class — a nonexistent trainer, or the DEFINER owner-role
          // gate (it raises WITH errcode foreign_key_violation, M8 §4):
          // the named counterparty isn't a messageable profile.
          failure = "That profile can't be messaged.";
        } else {
          failure = GENERIC_ERROR;
        }
      } else {
        threadId = created?.id ?? null;
        failure = threadId ? null : GENERIC_ERROR;
      }
    }
  } catch {
    failure = GENERIC_ERROR;
  }

  if (failure || !threadId) {
    return { error: failure ?? GENERIC_ERROR };
  }
  // Outside try/catch — redirect() throws its control-flow error by design.
  redirect(`/messages/${threadId}`);
}

/**
 * The watermark-gated new-message email (ruling 3) — module-private, runs
 * inside after(), everything swallowed (a mail failure must never surface).
 *
 * THE GATE is pure — shouldSendNewMessageEmail over the recipient's PRIOR
 * view of the thread (see unread.ts; the tested table G1–G6 is the shipped
 * decision). This function only fetches the gate's input: the latest
 * message OLDER than mine and not from the recipient — one indexed read,
 * the priced-clean shape. The query's sender/created_at filters make a
 * LIMIT-1 fetch sufficient, exactly like the thread-list probe; the pure
 * function holds the rule. The "older than mine" bound makes a rapid burst
 * send exactly ONE email: the burst's first message sees nothing unseen
 * before it and mails; every later one sees the first and stays quiet.
 */
async function sendNewMessageMail(
  supabase: SupabaseClient<Database>,
  threadId: string,
  senderId: string,
  body: string,
  sentAtIso: string,
): Promise<void> {
  try {
    const { data: thread } = await supabase
      .from("message_threads")
      .select(
        "owner_id, trainer_id, owner_last_read_at, trainer_last_read_at, profiles(display_name), trainers(profiles(display_name))",
      )
      .eq("id", threadId)
      .maybeSingle();
    if (!thread) return;

    const senderIsOwner = thread.owner_id === senderId;
    const recipientId = senderIsOwner ? thread.trainer_id : thread.owner_id;
    const recipientWatermark = senderIsOwner
      ? thread.trainer_last_read_at
      : thread.owner_last_read_at;

    const { data: prior, error } = await supabase
      .from("messages")
      .select("sender_id, created_at")
      .eq("thread_id", threadId)
      .neq("sender_id", recipientId)
      .lt("created_at", sentAtIso)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error || !prior) return;
    if (!shouldSendNewMessageEmail(prior, recipientWatermark, recipientId)) {
      return;
    }

    const email = await getUserEmail(recipientId);
    if (!email) return;

    // The sender's name resolves under the SENDER's own RLS — own profile
    // (owner side) or the public trainer read — so the M11 gap never bites
    // this direction.
    const senderName = senderIsOwner
      ? (thread.profiles?.display_name ?? null)
      : (thread.trainers?.profiles.display_name ?? null);
    await sendMail({ to: email, ...newMessage({ senderName, body }) });
  } catch (e) {
    console.error("[MAIL] newMessage notification failed:", e);
  }
}

export async function sendMessage(
  _prevState: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  const parsedThread = threadIdSchema.safeParse(formData.get("threadId"));
  if (!parsedThread.success) {
    return { error: parsedThread.error.issues[0]?.message ?? GENERIC_ERROR };
  }
  const parsedBody = messageBodySchema.safeParse(formData.get("body"));
  if (!parsedBody.success) {
    return { error: parsedBody.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const { supabase, userId } = await requireUser();

  let sentAtIso: string | null = null;
  let failure: string | null = null;
  try {
    const { data, error } = await supabase
      .from("messages")
      // sender_id = self is the ONLY value the M8 sender-authenticity
      // trigger accepts; participation is the INSERT policy's job.
      .insert({
        thread_id: parsedThread.data,
        sender_id: userId,
        body: parsedBody.data,
      })
      .select("created_at")
      .maybeSingle();
    if (error) {
      // The M8 rejection signatures, mapped (42501 = grant/RLS denial —
      // a non-participant's insert; 23503 = thread FK, near-unreachable
      // since threads carry no DELETE grant; 23514 = the body CHECK, zod's
      // backstop; P0001 = trigger raises we can't honestly trigger).
      failure =
        error.code === "42501" || error.code === "23503"
          ? NOT_FOUND_MESSAGE
          : error.code === "23514"
            ? "Messages are limited to 4000 characters."
            : GENERIC_ERROR;
    } else {
      sentAtIso = data?.created_at ?? null;
      failure = sentAtIso ? null : GENERIC_ERROR;
    }
  } catch {
    failure = GENERIC_ERROR;
  }
  if (failure || !sentAtIso) {
    return { error: failure ?? GENERIC_ERROR };
  }

  const sentAt = sentAtIso;
  after(() =>
    sendNewMessageMail(supabase, parsedThread.data, userId, parsedBody.data, sentAt),
  );
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Mark a thread read: set MY watermark to the thread's newest message.
 *
 * Newest-message, NOT now() — argued: created_at is stamped by the DB
 * clock, and an app-clock now() skewed behind it would leave the newest
 * message permanently "unread" (skewed ahead, it pre-reads messages that
 * land in the gap). Deriving from the same clock the comparison uses is
 * skew-proof. The honest cost: a message arriving between this read and
 * the write is marked read unseen — a seconds-wide window the 30s interval
 * refresh (ruling 2) makes irrelevant, accepted over now()'s permanent
 * skew hazard.
 *
 * Only MY column: the M9 author-as-self amendment to
 * message_threads_validate_update rejects a write to the counterparty's
 * watermark with P0001 ("read-state is author-as-self") — so the update
 * body carries exactly the one column the trigger permits.
 *
 * Fire-and-forget from the thread page: every failure path returns void —
 * a failed mark-as-read must never break reading.
 */
export async function markThreadRead(threadId: string): Promise<void> {
  if (!threadIdSchema.safeParse(threadId).success) {
    return;
  }
  // NOT requireUser(): its redirect("/login") would ride the action
  // transport back to the client and NAVIGATE the tab — from a background
  // 30s tick, that yanks a user mid-draft the moment their session
  // expires. Fire-and-forget means every exit is a silent return; the
  // page's own guard handles the logged-out state on the next navigation.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    return;
  }

  try {
    const { data: thread } = await supabase
      .from("message_threads")
      .select(
        "owner_id, owner_last_read_at, trainer_last_read_at, latest:messages(created_at)",
      )
      .eq("id", threadId)
      .order("created_at", { referencedTable: "latest", ascending: false })
      .limit(1, { referencedTable: "latest" })
      .maybeSingle();
    // Invisible (non-participant) or empty thread → nothing to mark.
    const latest = thread?.latest[0]?.created_at;
    if (!thread || !latest) {
      return;
    }

    const isOwnerSide = thread.owner_id === userId;
    const current = isOwnerSide
      ? thread.owner_last_read_at
      : thread.trainer_last_read_at;
    // Already caught up → skip the write (also keeps two racing opens from
    // regressing the watermark in the common case; a true out-of-order
    // overlap self-heals on the next open or interval tick).
    if (current !== null && Date.parse(current) >= Date.parse(latest)) {
      return;
    }

    const { error } = await supabase
      .from("message_threads")
      .update(
        isOwnerSide
          ? { owner_last_read_at: latest }
          : { trainer_last_read_at: latest },
      )
      .eq("id", threadId);
    if (error) {
      console.error("[MESSAGES] mark-as-read failed:", error.message);
    }
  } catch (e) {
    console.error("[MESSAGES] mark-as-read threw:", e);
  }
}
