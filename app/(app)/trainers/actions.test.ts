import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  query: vi.fn(),
  client: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/server", () => ({ after: (callback: () => void) => callback() }));
vi.mock("@/lib/analytics/events", () => ({ emitAnalyticsEvent: mocks.emit }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/trainers/directory-search", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/trainers/directory-search")>(),
  nearbyTrainersQuery: mocks.query,
}));

import * as postal from "@/lib/location/postal";
import { recordTrainerSearch } from "./actions";

function searchForm(country: string, location = "") {
  const form = new FormData();
  form.set("country", country);
  form.set("zip", location);
  form.set("radius", "25");
  return form;
}

describe("international search action", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.emit.mockReset();
    mocks.query.mockReset().mockResolvedValue({ data: [{ id: "trainer-1" }], error: null });
    mocks.client.mockReset().mockResolvedValue({
      auth: { getClaims: async () => ({ data: { claims: null } }) },
    });
  });

  test.each([
    ["CA", "m5v 3a8", "M5V"],
    ["GB", "bt1 1aa", "BT1"],
  ])("%s searches expose only coarse areas in URLs and analytics", async (country, input, area) => {
    await expect(recordTrainerSearch(searchForm(country, input)))
      .rejects.toThrow(`redirect:/trainers?country=${country}&zip=${area}&radius=25`);
    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ country }));
    expect(mocks.emit).toHaveBeenCalledWith({
      eventName: "search", userId: null,
      props: {
        country, postal_area: area, radius_meters: 40234, radius: 25,
        specialties: [], result_count: 1, beachhead_nashville: false,
      },
    });
    expect(JSON.stringify(mocks.emit.mock.calls)).not.toContain(input.toUpperCase());
  });

  test("country-only browse remains anonymous and does not manufacture a location search", async () => {
    await expect(recordTrainerSearch(searchForm("CA"))).rejects.toThrow("redirect:/trainers?country=CA");
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  test("a US ZIP in Canada stays invalid and emits no search", async () => {
    await expect(recordTrainerSearch(searchForm("CA", "37203")))
      .rejects.toThrow("redirect:/trainers?country=CA&zip=37203&radius=25");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  test("a failed trainer read emits no invented result count", async () => {
    mocks.query.mockResolvedValue({ data: null, error: { message: "read failed" } });
    await expect(recordTrainerSearch(searchForm("GB", "SW1A")))
      .rejects.toThrow("redirect:/trainers?country=GB&zip=SW1A&radius=25");
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  test("an unexpected lookup failure is not reported as an invalid area", async () => {
    vi.spyOn(postal, "resolvePostalArea").mockImplementationOnce(() => { throw new Error("lookup unavailable"); });
    await expect(recordTrainerSearch(searchForm("GB", "SW1A"))).rejects.toThrow("lookup unavailable");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });
});
