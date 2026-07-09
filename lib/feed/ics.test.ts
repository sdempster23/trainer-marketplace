import { describe, expect, test } from "vitest";

import { buildTrainerFeedCalendar, type FeedEventRow } from "./ics";

const SITE = "https://pawmatch.test";

/** Fixed inputs → fixed bytes. DTSTAMP comes from updated_at (never render
 * time), so the whole document is deterministic and golden-testable. */
function row(overrides: Partial<FeedEventRow> = {}): FeedEventRow {
  return {
    booking_id: "feed0006-0000-0000-0000-000000000006",
    starts_at: "2026-08-12T17:00:00+00:00",
    ends_at: "2026-08-12T18:00:00+00:00",
    status: "CONFIRMED",
    updated_at: "2026-07-01T12:30:00+00:00",
    owner_display_name: "Feed Owner",
    dog_name: "Rex",
    service_name: "Basic obedience",
    ...overrides,
  };
}

describe("buildTrainerFeedCalendar", () => {
  test("golden: one CONFIRMED event, exact bytes", () => {
    // Arrange
    const events = [row()];

    // Act
    const ics = buildTrainerFeedCalendar(events, SITE);

    // Assert — byte-level, CRLF included
    expect(ics).toBe(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//pawmatch//calendar-feed//EN",
        "METHOD:PUBLISH",
        "NAME:PawMatch — Bookings",
        "X-WR-CALNAME:PawMatch — Bookings",
        "BEGIN:VEVENT",
        "UID:feed0006-0000-0000-0000-000000000006@pawmatch",
        "SEQUENCE:0",
        "DTSTAMP:20260701T123000Z",
        "DTSTART:20260812T170000Z",
        "DTEND:20260812T180000Z",
        "SUMMARY:Feed Owner (Rex) — Basic obedience",
        "DESCRIPTION:Status: CONFIRMED\\nDog: Rex\\nService: Basic obedience\\nManage:",
        "  https://pawmatch.test/trainer/bookings",
        "STATUS:CONFIRMED",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );
  });

  test("every line break is CRLF and no folded line exceeds 75 octets", () => {
    // Arrange — a summary long enough to force folding
    const events = [
      row({
        owner_display_name:
          "A Client With A Remarkably Long Display Name For Folding Purposes",
        service_name: "Advanced protection-sport foundation session",
      }),
    ];

    // Act
    const ics = buildTrainerFeedCalendar(events, SITE);
    const lines = ics.split("\r\n");

    // Assert — CRLF only (no bare \n or \r survives outside CRLF pairs)…
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    // …every physical line fits the RFC 5545 75-octet limit…
    for (const line of lines) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    // …and folding actually happened: a continuation line starts with SP.
    expect(lines.some((l) => l.startsWith(" "))).toBe(true);
  });

  test("UID is stable across a status transition (ghost prevention)", () => {
    // Arrange — same booking, PENDING then CANCELLED (updated_at moved too,
    // as a real transition would)
    const pending = buildTrainerFeedCalendar([row({ status: "PENDING" })], SITE);
    const cancelled = buildTrainerFeedCalendar(
      [row({ status: "CANCELLED", updated_at: "2026-07-02T09:00:00+00:00" })],
      SITE,
    );

    // Act
    const uidOf = (ics: string) =>
      ics.split("\r\n").find((l) => l.startsWith("UID:"));

    // Assert — one UID forever; only STATUS (and DTSTAMP) move
    expect(uidOf(pending)).toBe(
      "UID:feed0006-0000-0000-0000-000000000006@pawmatch",
    );
    expect(uidOf(cancelled)).toBe(uidOf(pending));
    expect(pending).toContain("STATUS:TENTATIVE");
    expect(cancelled).toContain("STATUS:CANCELLED");
  });

  test("status mapping: PENDING→TENTATIVE, CONFIRMED/COMPLETED→CONFIRMED, CANCELLED→CANCELLED", () => {
    // Arrange / Act
    const ics = buildTrainerFeedCalendar(
      [
        row({ booking_id: "feed0006-0000-0000-0000-000000000006", status: "PENDING" }),
        row({ booking_id: "feed0007-0000-0000-0000-000000000007", status: "CONFIRMED" }),
        row({ booking_id: "feed0008-0000-0000-0000-000000000008", status: "COMPLETED" }),
        row({ booking_id: "feed0009-0000-0000-0000-000000000009", status: "CANCELLED" }),
      ],
      SITE,
    );
    const statuses = ics
      .split("\r\n")
      .filter((l) => l.startsWith("STATUS:"));

    // Assert — ruling 1: cancelled emitted explicitly, never omitted
    expect(statuses).toEqual([
      "STATUS:TENTATIVE",
      "STATUS:CONFIRMED",
      "STATUS:CONFIRMED",
      "STATUS:CANCELLED",
    ]);
  });

  test("renders whatever it is given — no re-filtering (the window is the RPC's)", () => {
    // Arrange — a row far older than any window; if the builder filtered,
    // the window would have two owners and they would drift
    const ics = buildTrainerFeedCalendar(
      [row({ starts_at: "2020-01-01T00:00:00+00:00", ends_at: "2020-01-01T01:00:00+00:00" })],
      SITE,
    );

    // Assert
    expect(ics).toContain("DTSTART:20200101T000000Z");
  });

  test("null display_name falls back to the established string", () => {
    // Arrange / Act
    const ics = buildTrainerFeedCalendar(
      [row({ owner_display_name: null })],
      SITE,
    );

    // Assert
    expect(ics).toContain("SUMMARY:An owner (Rex) — Basic obedience");
  });

  test("null siteUrl omits the Manage line — never a dead relative path", () => {
    // Arrange / Act
    const ics = buildTrainerFeedCalendar([row()], null);

    // Assert
    expect(ics).not.toContain("Manage:");
    expect(ics).toContain("Service: Basic obedience");
  });

  test("empty events produce a valid empty calendar (the §6 day-one feed)", () => {
    // Arrange / Act
    const ics = buildTrainerFeedCalendar([], SITE);

    // Assert
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
