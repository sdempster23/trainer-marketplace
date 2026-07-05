/**
 * The M9 watermark logic over PLAIN ROWS — pure, so the tested logic is the
 * shipped logic: every unread surface (thread-list badge, account-hub
 * count) and the email gate consume THESE functions; nothing reimplements
 * the comparison in a query layer.
 *
 *   unread(me, thread) = any message NOT SENT BY ME with
 *                        created_at > my last_read_at
 *
 * The sender exclusion lives HERE (not only in a query filter) because it
 * is the trap: sending never bumps my watermark, so my own message is
 * always "newer than last read" and a sender-blind derivation would show me
 * my own words as unread. Callers MAY pre-exclude in the query (a limit-1
 * probe needs the filter to be sufficient); this function re-asserts the
 * rule over whatever rows arrive.
 *
 * NULL watermark = never read (M9's documented semantics). Strict `>`
 * matches the migration verbatim — a message exactly AT the watermark is
 * READ (the open side, pinned by U6). Date.parse both sides: PostgREST
 * emits `+00:00`, toISOString() emits `Z` — instants compare, not strings.
 */

/** The two columns any unread question needs — a structural slice of a
 * messages row, so query results feed straight in. */
export type MessageStamp = { sender_id: string; created_at: string };

export function isThreadUnread(
  messages: readonly MessageStamp[],
  myLastReadAtIso: string | null,
  myUserId: string,
): boolean {
  return messages.some(
    (m) =>
      m.sender_id !== myUserId &&
      (myLastReadAtIso === null ||
        Date.parse(m.created_at) > Date.parse(myLastReadAtIso)),
  );
}

/**
 * The new-message email gate (ruling 3): notify iff the recipient was fully
 * caught up BEFORE the message just sent — i.e. the thread was NOT unread
 * to them over the PRIOR messages (the sender's new message must not be in
 * the set). One inversion, so the gate can never drift from the badge:
 * whatever the list would have shown the recipient pre-send decides the
 * doorbell. An existing unread run suppresses (they got that doorbell); the
 * recipient's own unwatermarked messages never do (G5).
 */
export function shouldSendNewMessageEmail(
  priorMessages: readonly MessageStamp[],
  recipientLastReadAtIso: string | null,
  recipientId: string,
): boolean {
  return !isThreadUnread(priorMessages, recipientLastReadAtIso, recipientId);
}
