import { describe, expect, test } from "vitest";

import {
  directorySearchQuery,
  parseDirectorySearch,
} from "./directory-search";

describe("parseDirectorySearch", () => {
  test("empty input is browse mode at the default radius", () => {
    expect(parseDirectorySearch({})).toEqual({
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
});

describe("directorySearchQuery", () => {
  test("browse (no zip) still serializes specialties", () => {
    expect(
      directorySearchQuery({
        zip: "",
        radiusMiles: 25,
        specialties: ["puppy"],
      }),
    ).toBe("specialties=puppy");
  });

  test("proximity writes zip + radius + specialties", () => {
    expect(
      directorySearchQuery({
        zip: "37203",
        radiusMiles: 25,
        specialties: ["agility"],
      }),
    ).toBe("zip=37203&radius=25&specialties=agility");
  });
});
