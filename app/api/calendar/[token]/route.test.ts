import { beforeEach, describe, expect, test, vi } from "vitest";

import { GET } from "./route";

const getFeedEvents = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ getFeedEvents }));

const GOOD_TOKEN = "a".repeat(64);

function request(token: string) {
  return GET(new Request(`https://pawmatch.test/api/calendar/${token}`), {
    params: Promise.resolve({ token }),
  });
}

beforeEach(() => {
  getFeedEvents.mockReset();
});

describe("GET /api/calendar/[token]", () => {
  test("returns 404 for a malformed token without touching the database", async () => {
    // Act
    const res = await request("not-a-token");

    // Assert
    expect(res.status).toBe(404);
    expect(getFeedEvents).not.toHaveBeenCalled();
  });

  test("returns 404 for an unknown token", async () => {
    // Arrange
    getFeedEvents.mockResolvedValue({ valid: false, events: [] });

    // Act
    const res = await request(GOOD_TOKEN);

    // Assert
    expect(res.status).toBe(404);
  });

  test("malformed and unknown tokens are byte-identical responses (no oracle)", async () => {
    // Arrange
    getFeedEvents.mockResolvedValue({ valid: false, events: [] });

    // Act
    const malformed = await request("beef");
    const unknown = await request(GOOD_TOKEN);

    // Assert — status, body, and headers all indistinguishable
    expect(malformed.status).toBe(unknown.status);
    expect(await malformed.text()).toBe(await unknown.text());
    expect([...malformed.headers.entries()]).toEqual([
      ...unknown.headers.entries(),
    ]);
  });

  test("valid token with zero events serves a 200 EMPTY calendar (day-one feed)", async () => {
    // Arrange
    getFeedEvents.mockResolvedValue({ valid: true, events: [] });

    // Act
    const res = await request(GOOD_TOKEN);
    const body = await res.text();

    // Assert
    expect(res.status).toBe(200);
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).not.toContain("BEGIN:VEVENT");
  });

  test("valid token serves text/calendar with no-store and the events", async () => {
    // Arrange
    getFeedEvents.mockResolvedValue({
      valid: true,
      events: [
        {
          booking_id: "feed0006-0000-0000-0000-000000000006",
          starts_at: "2026-08-12T17:00:00+00:00",
          ends_at: "2026-08-12T18:00:00+00:00",
          status: "CONFIRMED",
          updated_at: "2026-07-01T12:30:00+00:00",
          owner_display_name: "Feed Owner",
          dog_name: "Rex",
          service_name: "Basic obedience",
        },
      ],
    });

    // Act
    const res = await request(GOOD_TOKEN);
    const body = await res.text();

    // Assert
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8",
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toContain(
      "UID:feed0006-0000-0000-0000-000000000006@pawmatch",
    );
  });

  test("a database failure is a 500, never a 404 (an outage must not read as 'subscription deleted')", async () => {
    // Arrange
    getFeedEvents.mockRejectedValue(new Error("connection refused"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // Act
    const res = await request(GOOD_TOKEN);

    // Assert
    expect(res.status).toBe(500);
    consoleError.mockRestore();
  });
});
