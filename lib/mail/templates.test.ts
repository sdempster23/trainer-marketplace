import { describe, expect, test } from "vitest";

import {
  cancelledByOwner,
  completed,
  confirmed,
  declinedByTrainer,
  MESSAGE_PREVIEW_LENGTH,
  newMessage,
  requestReceived,
  type BookingMailContext,
  type RenderedMail,
} from "@/lib/mail/templates";

/**
 * The template suite: every function renders with full context and with a
 * NULL counterparty name; the trainer-zone label appears in the output; and
 * the classic template bug — a literal "undefined" leaking into a rendered
 * string — is asserted ABSENT everywhere.
 */

const FULL: BookingMailContext = {
  counterpartyName: "Olivia Park",
  dogName: "Riley",
  serviceName: "Intro Session",
  startsAtIso: "2026-07-06T14:00:00Z", // 9:00 AM Central
  trainerTimezone: "America/Chicago",
  priceCents: 8000,
};

const templates: Array<{
  name: string;
  render: (c: BookingMailContext) => RenderedMail;
  nullFallback: string;
}> = [
  { name: "requestReceived", render: requestReceived, nullFallback: "A dog owner" },
  { name: "confirmed", render: confirmed, nullFallback: "Your trainer" },
  { name: "declinedByTrainer", render: declinedByTrainer, nullFallback: "Your trainer" },
  { name: "cancelledByOwner", render: cancelledByOwner, nullFallback: "A dog owner" },
  { name: "completed", render: completed, nullFallback: "Your trainer" },
];

describe.each(templates)("$name", ({ render, nullFallback }) => {
  test("renders full context — name, dog, service, zone; no 'undefined'", () => {
    const { subject, text } = render(FULL);
    const all = `${subject}\n${text}`;
    expect(all).toContain("Olivia Park");
    expect(all).toContain("Riley");
    expect(all).toContain("Intro Session");
    expect(all).toContain("9:00 AM"); // trainer-zone wall clock
    expect(all).toContain("Central (Chicago)"); // the zone, stated
    expect(all).not.toContain("undefined");
  });

  test("NULL counterparty name falls back, still no 'undefined'", () => {
    const { subject, text } = render({ ...FULL, counterpartyName: null });
    const all = `${subject}\n${text}`;
    expect(all).toContain(nullFallback);
    expect(all).not.toContain("undefined");
    expect(all).not.toContain("null");
  });

  test("an unknown IANA zone falls back to the raw string (no crash)", () => {
    const { text } = render({ ...FULL, trainerTimezone: "UTC" });
    expect(text).toContain("(UTC)"); // raw zone named, not blank
    expect(text).not.toContain("undefined");
  });
});

/**
 * newMessage is direction-agnostic (either party may be the sender), so its
 * context carries the sender's name directly — no per-template fallback
 * pair. The body PREVIEW is truncated: the email is a doorbell, not the
 * conversation; the full text lives behind the /messages link.
 */
describe("newMessage", () => {
  const CONTEXT = { senderName: "Olivia Park", body: "Where do we meet?" };

  test("renders sender, preview, and the /messages link; no 'undefined'", () => {
    const { subject, text } = newMessage(CONTEXT);
    const all = `${subject}\n${text}`;
    expect(all).toContain("Olivia Park");
    expect(all).toContain("Where do we meet?");
    expect(text).toContain("/messages");
    expect(all).not.toContain("undefined");
  });

  test("NULL sender name falls back, still no 'undefined' or 'null'", () => {
    const { subject, text } = newMessage({ ...CONTEXT, senderName: null });
    const all = `${subject}\n${text}`;
    expect(all).not.toContain("undefined");
    expect(all).not.toContain("null");
    expect(text).toContain("/messages");
  });

  test("long bodies are truncated with an ellipsis at the preview cap", () => {
    const { text } = newMessage({ ...CONTEXT, body: "x".repeat(500) });
    expect(text).toContain("x".repeat(MESSAGE_PREVIEW_LENGTH) + "…");
    expect(text).not.toContain("x".repeat(MESSAGE_PREVIEW_LENGTH + 1));
  });

  test("short bodies render whole — no ellipsis", () => {
    const { text } = newMessage(CONTEXT);
    expect(text).not.toContain("…");
  });
});
