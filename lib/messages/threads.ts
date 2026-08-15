import { cache } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isThreadUnread } from "@/lib/messages/unread";
import type { Database } from "@/types/supabase";

/**
 * The messaging read paths. Every embed shape below was proven live against
 * the local stack (real GoTrue tokens, one REST query per function) before
 * this file was written — the aliased double-embed on messages and the
 * per-alias order/limit/filter are load-bearing and non-obvious:
 *
 *   latest:messages(...)  order desc limit 1            → the list preview
 *   probe:messages(...)   order desc limit 1, sender≠me → the unread check
 *
 * Two embeds of the SAME table because they answer different questions: the
 * preview wants the newest message regardless of author; the unread check
 * must EXCLUDE my own messages. The probe's query-level sender≠me filter is
 * what makes a LIMIT-1 embed sufficient (without it, my own newer message
 * could eclipse an unseen counterparty one) — but the unread AUTHORITY is
 * isThreadUnread over the fetched rows, which re-asserts the exclusion; the
 * query filter only keeps the fetch at one row (see unread.ts).
 *
 * COUNTERPARTY NAME, the known gap (proven live): the M11 profiles policy is
 * "Trainers read profiles of owners they have a BOOKING with" — in a
 * freestanding thread (ruling 1: pre-booking inquiries embraced) the
 * trainer's embed of the owner's profile returns NULL even when a name
 * exists. The fallback is therefore mandatory, not defensive. A
 * thread-scoped counterparty read policy is the flagged M13 candidate.
 *
 * Both queries fetch BOTH sides' name embeds (profiles = the owner's,
 * trainers.profiles = the trainer's) and pick by which side the caller is —
 * one query shape for both roles (ruling 4: shared surface).
 */

export type MessageRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type ThreadListItem = {
  id: string;
  bookingId: string | null;
  updatedAt: string;
  /** NULL = no name set OR hidden by the M11 booking-scoped policy — the
   * renderer cannot tell which; fall back either way. */
  counterpartyName: string | null;
  latestMessage: Pick<MessageRow, "sender_id" | "body" | "created_at"> | null;
  isUnread: boolean;
};

// One long literal — supabase-js infers row types from LITERAL select
// strings; concatenation widens to `string` and the inference dies (the
// (bookings) actions precedent, relearned by typecheck).
const THREAD_LIST_SELECT =
  "id, owner_id, trainer_id, booking_id, updated_at, owner_last_read_at, trainer_last_read_at, profiles(display_name), trainers(profiles(display_name)), latest:messages(sender_id, body, created_at), probe:messages(sender_id, created_at)";

/** The thread list — most recent activity first (updated_at is bumped by
 * message arrival, M8 §7, and deliberately NOT by mark-as-read, M9). */
export async function getThreads(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ threads: ThreadListItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from("message_threads")
    .select(THREAD_LIST_SELECT)
    // Belt-and-suspenders with the participants-only RLS (the
    // getTrainerBookings precedent) — either column, since both roles list.
    .or(`owner_id.eq.${userId},trainer_id.eq.${userId}`)
    .order("updated_at", { ascending: false })
    .order("created_at", { referencedTable: "latest", ascending: false })
    .limit(1, { referencedTable: "latest" })
    .order("created_at", { referencedTable: "probe", ascending: false })
    .limit(1, { referencedTable: "probe" })
    .neq("probe.sender_id", userId);

  if (error) {
    return { threads: [], error: error.message };
  }

  const threads = data.map((row): ThreadListItem => {
    const isOwnerSide = row.owner_id === userId;
    return {
      id: row.id,
      bookingId: row.booking_id,
      updatedAt: row.updated_at,
      counterpartyName: isOwnerSide
        ? (row.trainers?.profiles.display_name ?? null)
        : (row.profiles?.display_name ?? null),
      latestMessage: row.latest[0] ?? null,
      isUnread: isThreadUnread(
        row.probe,
        isOwnerSide ? row.owner_last_read_at : row.trainer_last_read_at,
        userId,
      ),
    };
  });
  return { threads, error: null };
}

export type ThreadDetail = {
  id: string;
  bookingId: string | null;
  counterpartyName: string | null;
  /** True when the caller sits in the owner_id column — the send/read verbs
   * don't need it, but the renderer aligns bubbles by it. */
  isOwnerSide: boolean;
  /** The other participant's id — the header's profile link (trainer id
   * when the viewer is the owner; owners have no public page). */
  counterpartyId: string;
  /** Chronological, oldest first — the conversation order. */
  messages: MessageRow[];
};

/**
 * One thread with its full message history. Takes userId (a deliberate
 * widening of the scoped signature): the counterparty pick and the bubble
 * side both need to know which column the caller is, and deriving that here
 * keeps the mapping in one place with getThreads. Non-participant → RLS
 * hides the row → null → the page 404s; a malformed id also lands in the
 * error return (PostgREST rejects a non-uuid eq) — same outcome upstream.
 */
export async function getThread(
  supabase: SupabaseClient<Database>,
  userId: string,
  threadId: string,
): Promise<{ thread: ThreadDetail | null; error: string | null }> {
  const { data, error } = await supabase
    .from("message_threads")
    .select(
      "id, owner_id, trainer_id, booking_id, profiles(display_name), trainers(profiles(display_name)), messages(id, sender_id, body, created_at)",
    )
    .eq("id", threadId)
    .order("created_at", { referencedTable: "messages", ascending: true })
    .maybeSingle();

  if (error) {
    return { thread: null, error: error.message };
  }
  if (!data) {
    return { thread: null, error: null };
  }

  const isOwnerSide = data.owner_id === userId;
  return {
    thread: {
      id: data.id,
      bookingId: data.booking_id,
      counterpartyName: isOwnerSide
        ? (data.trainers?.profiles.display_name ?? null)
        : (data.profiles?.display_name ?? null),
      isOwnerSide,
      counterpartyId: isOwnerSide ? data.trainer_id : data.owner_id,
      messages: data.messages,
    },
    error: null,
  };
}

/**
 * The account-hub number: how many CONVERSATIONS have unread messages (not
 * total messages — "3 conversations waiting" is the honest cheap count; a
 * message total would need all rows, not a limit-1 probe). One slim query,
 * derived in app code — per-thread watermarks make a cross-thread aggregate
 * inexpressible in a single PostgREST filter (the priced trade; an RPC is
 * the future shape if a nav-badge arc ever lands).
 *
 * Returns 0 on error, deliberately: this feeds a badge on /account — a
 * failed count must degrade to "no badge", never break the hub.
 *
 * cache()-wrapped: the shell header AND the account hub both ask in the
 * same request; React dedupes per-request so the query runs once.
 */
export const getUnreadThreadCount = cache(async function getUnreadThreadCount(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("message_threads")
    .select(
      "owner_id, owner_last_read_at, trainer_last_read_at, probe:messages(sender_id, created_at)",
    )
    .or(`owner_id.eq.${userId},trainer_id.eq.${userId}`)
    .order("created_at", { referencedTable: "probe", ascending: false })
    .limit(1, { referencedTable: "probe" })
    .neq("probe.sender_id", userId);

  if (error) {
    console.error("[MESSAGES] unread count failed:", error.message);
    return 0;
  }
  return data.filter((row) =>
    isThreadUnread(
      row.probe,
      row.owner_id === userId
        ? row.owner_last_read_at
        : row.trainer_last_read_at,
      userId,
    ),
  ).length;
});
