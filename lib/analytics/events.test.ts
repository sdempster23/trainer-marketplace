import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const insertAnalyticsEvent = vi.fn();
const track = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  insertAnalyticsEvent: (...args: unknown[]) => insertAnalyticsEvent(...args),
}));

vi.mock("@vercel/analytics/server", () => ({
  track: (...args: unknown[]) => track(...args),
}));

import { emitAnalyticsEvent } from "./events";

describe("emitAnalyticsEvent", () => {
  beforeEach(() => {
    insertAnalyticsEvent.mockReset();
    track.mockReset();
    insertAnalyticsEvent.mockResolvedValue({ inserted: true });
    track.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  test("writes the DB row then mirrors to Vercel", async () => {
    await emitAnalyticsEvent({
      eventName: "search",
      userId: null,
      props: {
        zip: "37203",
        radius: 25,
        specialties: ["puppy", "agility"],
        result_count: 3,
        beachhead_nashville: true,
      },
    });

    expect(insertAnalyticsEvent).toHaveBeenCalledWith({
      event_name: "search",
      user_id: null,
      props: {
        zip: "37203",
        radius: 25,
        specialties: ["puppy", "agility"],
        result_count: 3,
        beachhead_nashville: true,
      },
    });
    expect(track).toHaveBeenCalledWith("search", {
      zip: "37203",
      radius: 25,
      specialties: "puppy,agility",
      result_count: 3,
      beachhead_nashville: true,
    });
  });

  test("skips once-per-user events that have no user_id", async () => {
    await emitAnalyticsEvent({ eventName: "trainer_signup" });
    expect(insertAnalyticsEvent).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  test("a DB failure does not throw and still attempts the Vercel mirror", async () => {
    insertAnalyticsEvent.mockRejectedValue(new Error("db down"));
    await expect(
      emitAnalyticsEvent({
        eventName: "booking_request",
        userId: "owner-1",
        props: { booking_id: "b1" },
      }),
    ).resolves.toBeUndefined();
    expect(track).toHaveBeenCalledWith("booking_request", { booking_id: "b1" });
  });
});
