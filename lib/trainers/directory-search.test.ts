import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

import {
  directorySearchQuery,
  nearbyTrainersQuery,
  parseDirectorySearch,
} from "./directory-search";

describe("parseDirectorySearch", () => {
  test("preserves Barn Hunt in a shareable search while dropping unknown specialties", () => {
    const parsed = parseDirectorySearch({
      zip: "37203",
      radius: "25",
      specialties: ["barn_hunt", "not-a-real-specialty"],
    });
    expect(parsed.specialties).toEqual(["barn_hunt"]);
    expect(directorySearchQuery(parsed)).toBe(
      "zip=37203&radius=25&specialties=barn_hunt",
    );
  });

  test("empty input is browse mode at the default radius", () => {
    expect(parseDirectorySearch({})).toEqual({
      country: "US",
      zip: "",
      radiusMiles: 25,
      specialties: [],
    });
  });

  test("drops an unknown radius and an unknown specialty silently", () => {
    const parsed = parseDirectorySearch({
      zip: " 37203 ",
      radius: "999",
      specialties: ["puppy", "not-a-real-specialty", "agility"],
    });
    expect(parsed.zip).toBe("37203");
    expect(parsed.radiusMiles).toBe(25);
    expect(parsed.specialties).toEqual(["puppy", "agility"]);
  });

  test("keeps a legal radius", () => {
    expect(parseDirectorySearch({ radius: "50" }).radiusMiles).toBe(50);
  });

  test.each([
    ["CA", " m5v 3a8 ", "M5V"],
    ["GB", " sw1a 1aa ", "SW1A"],
    ["GB", "bt1 1aa", "BT1"],
    ["US", "02108", "02108"],
  ])("normalizes %s location %s to its public postal area", (country, zip, expected) => {
    expect(parseDirectorySearch({ country, zip })).toMatchObject({ country, zip: expected });
  });

  test("does not turn a valid prefix plus junk into a valid area", () => {
    const parsed = parseDirectorySearch({ country: "CA", zip: "M5V INVALID" });
    expect(parsed.country).toBe("CA");
    expect(parsed.zip).toBe("M5V INVALID");
  });
});

describe("directorySearchQuery", () => {
  test("browse (no zip) still serializes specialties", () => {
    expect(
      directorySearchQuery({
        country: "US",
        zip: "",
        radiusMiles: 25,
        specialties: ["puppy"],
      }),
    ).toBe("specialties=puppy");
  });

  test("proximity writes zip + radius + specialties", () => {
    expect(
      directorySearchQuery({
        country: "US",
        zip: "37203",
        radiusMiles: 25,
        specialties: ["agility"],
      }),
    ).toBe("zip=37203&radius=25&specialties=agility");
  });

  test.each(["CA", "GB"] as const)("country %s survives browse, specialty clearing, and location clearing", (country) => {
    const selected = parseDirectorySearch({ country, specialties: ["barn_hunt"] });
    expect(directorySearchQuery(selected)).toBe(`country=${country}&specialties=barn_hunt`);
    expect(directorySearchQuery({ ...selected, specialties: [] })).toBe(`country=${country}`);
    expect(directorySearchQuery({ ...selected, zip: "", radiusMiles: 50 })).toBe(`country=${country}&specialties=barn_hunt`);
  });

  test("Canada's shared search keeps only a coarse area when widening", () => {
    const parsed = parseDirectorySearch({ country: "CA", zip: "m5v 3a8", specialties: ["puppy"] });
    expect(directorySearchQuery({ ...parsed, radiusMiles: 50 })).toBe("country=CA&zip=M5V&radius=50&specialties=puppy");
  });

  test("returning to US keeps the existing US URL shape", () => {
    expect(directorySearchQuery(parseDirectorySearch({ country: "US", zip: "02108" })))
      .toBe("zip=02108&radius=25");
  });
});

test("proximity sends the country and integer meters to the filtering RPC", () => {
  const query = { not: vi.fn(), overlaps: vi.fn() };
  query.not.mockReturnValue(query);
  query.overlaps.mockReturnValue(query);
  const rpc = vi.fn().mockReturnValue(query);
  const client = { rpc } as unknown as SupabaseClient<Database>;
  nearbyTrainersQuery(client, {
    country: "CA", lat: 43.64, lng: -79.40, radiusMiles: 25, specialties: ["barn_hunt"],
  });
  expect(rpc).toHaveBeenCalledWith("nearby_trainers_v2", {
    search_country: "CA", search_lat: 43.64, search_lng: -79.40, radius_meters: 40234,
  });
  expect(query.overlaps).toHaveBeenCalledWith("specialties", ["barn_hunt"]);
});
