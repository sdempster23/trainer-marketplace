import { describe, expect, test } from "vitest";

import {
  isThreadUnread,
  shouldSendNewMessageEmail,
  type MessageStamp,
} from "@/lib/messages/unread";

/**
 * The unread test table — the project's third unit suite (the slot-math
 * standard: numbered rows, hand-picked instants, the values ARE the
 * documentation).
 *
 * The M9 derivation over plain rows:
 *
 *   unread(me, thread) = any message NOT SENT BY ME with
 *                        created_at > my last_read_at
 *
 * Pinned here, by ruling:
 *   - THE TRAP: my own sent messages NEVER count as unread-to-me (sending
 *     doesn't bump my watermark — U2/U3/U8 would all false-positive
 *     without the sender exclusion).
 *   - NULL watermark both ways (never read: unread iff a counterparty
 *     message exists at all — U1/U4).
 *   - THE BOUNDARY: strict `>`, matching M9's `created_at > my
 *     last_read_at` verbatim — a message exactly AT the watermark is READ
 *     (U6 pins the open side; if this flips to >=, U6 fails).
 *   - THE GATE: fully-read → send; any unread run → suppress (G1–G6).
 */

const ME = "me-0000";
const OTHER = "other-0000";

const T1 = "2026-07-05T10:00:00+00:00";
const T2 = "2026-07-05T11:00:00+00:00";
const T3 = "2026-07-05T12:00:00+00:00";

const msg = (sender: string, at: string): MessageStamp => ({
  sender_id: sender,
  created_at: at,
});

describe("isThreadUnread", () => {
  test("U1 empty thread → read, even when never opened", () => {
    expect(isThreadUnread([], null, ME)).toBe(false);
    expect(isThreadUnread([], T1, ME)).toBe(false);
  });

  test("U2 THE TRAP: only my own messages, never opened → still read", () => {
    expect(isThreadUnread([msg(ME, T1), msg(ME, T2)], null, ME)).toBe(false);
  });

  test("U3 THE TRAP: my own message newer than my watermark → still read", () => {
    expect(isThreadUnread([msg(ME, T2)], T1, ME)).toBe(false);
  });

  test("U4 counterparty message, NULL watermark → unread (never read)", () => {
    expect(isThreadUnread([msg(OTHER, T1)], null, ME)).toBe(true);
  });

  test("U5 counterparty message newer than watermark → unread", () => {
    expect(isThreadUnread([msg(OTHER, T2)], T1, ME)).toBe(true);
  });

  test("U6 THE BOUNDARY: counterparty message exactly AT the watermark → read (strict >)", () => {
    expect(isThreadUnread([msg(OTHER, T1)], T1, ME)).toBe(false);
  });

  test("U7 counterparty message older than watermark → read", () => {
    expect(isThreadUnread([msg(OTHER, T1)], T2, ME)).toBe(false);
  });

  test("U8 mixed: my newer message can't resurrect a caught-up thread", () => {
    expect(isThreadUnread([msg(OTHER, T1), msg(ME, T3)], T2, ME)).toBe(false);
  });

  test("U9 mixed: an unseen counterparty message counts even when mine is latest", () => {
    expect(isThreadUnread([msg(OTHER, T2), msg(ME, T3)], T1, ME)).toBe(true);
  });

  test("U10 compares instants, not strings — Z and +00:00 forms agree", () => {
    // Same instant in the two forms PostgREST and toISOString() emit; a
    // lexicographic comparison would order them wrong.
    expect(
      isThreadUnread([msg(OTHER, "2026-07-05T10:00:00+00:00")], "2026-07-05T10:00:00Z", ME),
    ).toBe(false);
    expect(
      isThreadUnread([msg(OTHER, "2026-07-05T10:00:00+00:00")], "2026-07-05T09:59:59Z", ME),
    ).toBe(true);
  });
});

/**
 * The email gate is the recipient's unread state, inverted: notify iff the
 * recipient was fully caught up BEFORE my message. `priorMessages` are
 * messages that predate the one just sent (the sender's new message is
 * never in the set).
 */
describe("shouldSendNewMessageEmail", () => {
  const RECIPIENT = OTHER;

  test("G1 first message of the thread (no priors, never read) → send", () => {
    expect(shouldSendNewMessageEmail([], null, RECIPIENT)).toBe(true);
  });

  test("G2 recipient fully caught up → send", () => {
    expect(shouldSendNewMessageEmail([msg(ME, T1)], T1, RECIPIENT)).toBe(true);
  });

  test("G3 an unread run already exists → suppress (they got that doorbell)", () => {
    expect(shouldSendNewMessageEmail([msg(ME, T2)], T1, RECIPIENT)).toBe(false);
  });

  test("G4 never read with prior messages → suppress", () => {
    expect(shouldSendNewMessageEmail([msg(ME, T1)], null, RECIPIENT)).toBe(false);
  });

  test("G5 the recipient's OWN prior message never suppresses (not unread to them)", () => {
    expect(shouldSendNewMessageEmail([msg(RECIPIENT, T2)], T1, RECIPIENT)).toBe(true);
  });

  test("G6 boundary rides the same strict >: prior exactly AT the watermark → send", () => {
    expect(shouldSendNewMessageEmail([msg(ME, T1)], T1, RECIPIENT)).toBe(true);
  });
});
