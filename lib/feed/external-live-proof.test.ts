// @vitest-environment node
//
// M16 LIVE PROOF (app layer) — a REAL network fetch of a real Google secret
// ICS URL through the real SSRF fetcher + parser + slot math. Gated behind
// LIVE_PROOF=1 so CI never depends on Google or the network; run explicitly:
//
//   LIVE_PROOF=1 EXTCAL_URL='<secret ics url>' pnpm vitest run lib/feed/external-live-proof.test.ts
//
// The URL is passed via env, never committed. Proves the whole export→import
// promise end to end: the trainer's real calendar blocks the right slots,
// the cancelled instance's slot SURVIVES, the moved instance blocks its NEW
// time.
import { describe, expect, test } from "vitest";

import { fetchIcsSafely } from "./fetch-ics";
import { parseIcsToBusyBlocks } from "./import";
import {
  computeBookableSlots,
  type BlockingBooking,
} from "@/lib/trainer/schedule";

const RUN = process.env.LIVE_PROOF === "1" && !!process.env.EXTCAL_URL;
const TZ = "America/Chicago";
const NOW = new Date("2026-07-17T12:00:00Z");

// The trainer offers Mondays AND Tuesdays 09:00–17:00, so the moved
// instance (Mon→Tue) has a real Tuesday slot to collide with.
const PATTERN = [
  { day_of_week: 1, start_time: "09:00:00", end_time: "17:00:00" }, // Mon
  { day_of_week: 2, start_time: "09:00:00", end_time: "17:00:00" }, // Tue
];

describe.skipIf(!RUN)("M16 live proof — real Google calendar → bookable slots", () => {
  test("fetch → parse matches the captured golden (real network path)", async () => {
    const fetched = await fetchIcsSafely(process.env.EXTCAL_URL!);
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;

    const blocks = parseIcsToBusyBlocks(fetched.body, {
      now: NOW,
      fallbackTimezone: TZ,
    });
    // Same instants the committed golden pins — proven over the wire.
    expect(blocks).toEqual([
      { starts_at: "2026-07-20T15:00:00.000Z", ends_at: "2026-07-20T16:00:00.000Z" },
      { starts_at: "2026-07-21T05:00:00.000Z", ends_at: "2026-07-22T05:00:00.000Z" },
      { starts_at: "2026-08-04T15:00:00.000Z", ends_at: "2026-08-04T16:00:00.000Z" },
    ]);
  });

  test("the right slots vanish, the cancelled one survives, the moved one blocks its new time", async () => {
    const fetched = await fetchIcsSafely(process.env.EXTCAL_URL!);
    if (!fetched.ok) throw new Error("fetch failed");
    const external: BlockingBooking[] = parseIcsToBusyBlocks(fetched.body, {
      now: NOW,
      fallbackTimezone: TZ,
    }).map((b) => ({ starts_at: b.starts_at, ends_at: b.ends_at, status: "CONFIRMED" }));

    const slots = computeBookableSlots({
      pattern: PATTERN,
      exceptions: [],
      bookings: external, // external blocks arrive as opaque busy (the RPC union)
      timezone: TZ,
      durationMinutes: 60,
      fromDateLocal: "2026-07-18",
      toDateLocal: "2026-08-06",
      now: NOW,
    });
    const starts = new Set(slots.map((s) => s.startUtc));

    // 7/20 Mon 10:00 CDT (15:00Z) — the weekly class: BLOCKED (slot absent)
    expect(starts.has("2026-07-20T15:00:00.000Z")).toBe(false);
    // 7/27 Mon 10:00 CDT — EXDATE'd (deleted occurrence): SURVIVES (bookable)
    expect(starts.has("2026-07-27T15:00:00.000Z")).toBe(true);
    // 8/03 Mon 10:00 CDT — the occurrence MOVED away: SURVIVES on Monday
    expect(starts.has("2026-08-03T15:00:00.000Z")).toBe(true);
    // 8/04 Tue 10:00 CDT — where it moved TO: BLOCKED (slot absent)
    expect(starts.has("2026-08-04T15:00:00.000Z")).toBe(false);
    // control: an adjacent slot with no external block IS offered
    expect(starts.has("2026-07-20T18:00:00.000Z")).toBe(true); // 7/20 13:00 CDT
  });
});
