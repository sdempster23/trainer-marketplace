import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  country: "CA",
  countryError: false,
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/analytics/events", () => ({ maybeEmitCompleteProfile: vi.fn() }));
vi.mock("@/lib/trainer/onboarding", () => ({ getOnboardingState: vi.fn(async () => "complete") }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "trainer-1" } } }) },
    from: (table: string) => {
      if (table === "trainer_services") {
        return { insert: state.insert, update: state.update };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => table === "profiles"
          ? { data: { role: "trainer" }, error: null }
          : { data: state.countryError ? null : { country_code: state.country }, error: state.countryError ? { message: "failed" } : null },
        }) }),
      };
    },
  }),
}));

import { createService, updateService } from "./actions";

function serviceForm(currency: string) {
  const form = new FormData();
  Object.entries({
    name: "Private training",
    description: "",
    priceDollars: "62.50",
    currency,
    durationMinutes: "60",
    sessionType: "in_home",
    serviceId: "ba4a0001-0000-4000-8000-000000000002",
  }).forEach(([key, value]) => form.set(key, value));
  return form;
}

describe("service currency boundary", () => {
  beforeEach(() => {
    state.country = "CA";
    state.countryError = false;
    state.insert.mockReset().mockResolvedValue({ error: null });
    state.update.mockReset().mockReturnValue({
      eq: () => ({ eq: () => ({ is: () => ({ select: () => ({
        maybeSingle: async () => ({ data: { id: "service-1" }, error: null }),
      }) }) }) }),
    });
  });

  test.each([ ["US", "USD"], ["CA", "CAD"], ["GB", "GBP"] ])("creates a %s service in %s without converting the amount", async (country, currency) => {
    state.country = country;
    expect(await createService(null, serviceForm(currency))).toEqual({ success: true });
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({
      trainer_id: "trainer-1", price_cents: 6250, currency,
    }));
  });

  test("a stale or tampered currency cannot reinterpret the submitted amount", async () => {
    expect(await createService(null, serviceForm("USD"))).toEqual({
      error: "Your listing country changed. Refresh this page to see the currency for new services.",
    });
    expect(state.insert).not.toHaveBeenCalled();
  });

  test("a failed country read never defaults a new service to USD", async () => {
    state.countryError = true;
    expect(await createService(null, serviceForm("USD"))).toHaveProperty("error");
    expect(state.insert).not.toHaveBeenCalled();
  });

  test("an unsupported saved country does not produce a service", async () => {
    state.country = "ZZ";
    expect(await createService(null, serviceForm("USD"))).toHaveProperty("error");
    expect(state.insert).not.toHaveBeenCalled();
  });

  test("editing an old service after moving never writes a new currency", async () => {
    state.country = "GB";
    expect(await updateService(null, serviceForm("GBP"))).toEqual({ success: true });
    const [saved] = state.update.mock.calls[0] ?? [];
    expect(saved).toMatchObject({ price_cents: 6250 });
    expect(saved).not.toHaveProperty("currency");
  });
});
