import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ country: "US", readError: false, update: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/analytics/events", () => ({ maybeEmitCompleteProfile: vi.fn() }));
vi.mock("@/lib/trainer/onboarding", () => ({ getOnboardingState: vi.fn(async () => "complete") }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getClaims: async () => ({ data: { claims: { sub: "trainer-1" } } }) },
  from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => table === "profiles"
      ? { data: { role: "trainer" }, error: null }
      : { data: state.readError ? null : { country_code: state.country }, error: state.readError ? { message: "read failed" } : null },
    }) }),
    update: state.update,
  }),
}) }));

import { updateTrainerListing } from "./actions";

function form(country: string, zip: string) {
  const data = new FormData();
  Object.entries({ country, zip, bio: "Working with dogs and their families every day.",
    serviceRadiusMiles: "25", timezone: country === "CA" ? "America/Toronto" : "America/Chicago",
  }).forEach(([key, value]) => data.set(key, value));
  data.append("specialties", "puppy");
  return data;
}

beforeEach(() => {
  state.country = "US";
  state.readError = false;
  // Stop after the attempted write so these tests isolate its contents.
  state.update.mockReset().mockReturnValue({ eq: async () => ({ error: { message: "write unavailable" } }) });
});

test("a country change without a new location cannot relabel an existing point", async () => {
  expect(await updateTrainerListing(null, form("CA", ""))).toEqual({
    error: "Enter a postal code when changing your country.",
  });
  expect(state.update).not.toHaveBeenCalled();
});

test("moving writes country, coarse area, and point in the same row update", async () => {
  await updateTrainerListing(null, form("CA", "m5v 3a8"));
  expect(state.update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    country_code: "CA", postal_area: "M5V", service_point: expect.stringMatching(/^SRID=4326;POINT\(/),
  }));
});

test("a failed saved-location read never changes a listing", async () => {
  state.readError = true;
  expect(await updateTrainerListing(null, form("US", ""))).toHaveProperty("error");
  expect(state.update).not.toHaveBeenCalled();
});

test("blank location in the same country preserves every saved location field", async () => {
  await updateTrainerListing(null, form("US", ""));
  expect(state.update).toHaveBeenCalledOnce();
  const saved = state.update.mock.calls[0]?.[0];
  expect(saved).not.toHaveProperty("service_point");
  expect(saved).not.toHaveProperty("postal_area");
  expect(saved).not.toHaveProperty("country_code");
});
