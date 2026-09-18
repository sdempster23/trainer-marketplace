import { describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { postalArea, distanceLabel } from "./countries";
import { resolvePostalArea } from "./postal";
import ukAreas from "./data/gb-postal-areas.json";

describe("offline international locations", () => {
  test("a leading-zero US ZIP stays intact", () => {
    expect(resolvePostalArea("US", "02108")?.postalArea).toBe("02108");
  });
  test("a Canadian full code and its FSA have the same approximate location", () => {
    expect(resolvePostalArea("CA", "m5v 3a8")).toEqual(resolvePostalArea("CA", "M5V"));
    expect(resolvePostalArea("CA", "M5V")?.latitude).toBeGreaterThan(40);
  });
  test.each(["SW1A 1AA", "EH1 1YZ", "CF10 3NQ", "BT1 5GS"])("resolves %s in the UK", (code) => {
    const point = resolvePostalArea("GB", code);
    expect(point).not.toBeNull();
    expect(point!.latitude).toBeGreaterThan(49);
    expect(point!.latitude).toBeLessThan(61);
    expect(point!.longitude).toBeGreaterThan(-9);
    expect(point!.longitude).toBeLessThan(3);
  });
  test("a rural Canadian area resolves without pretending to be address-level", () => {
    const point = resolvePostalArea("CA", "K0A 1L0");
    expect(point?.postalArea).toBe("K0A");
  });
  test("unrecognized areas and country mismatches are rejected", () => {
    expect(resolvePostalArea("GB", "ZZ99 9ZZ")).toBeNull();
    expect(resolvePostalArea("US", "M5V 3A8")).toBeNull();
    expect(resolvePostalArea("CA", "37203")).toBeNull();
    expect(resolvePostalArea("CA", "M5V garbage")).toBeNull();
  });
  test("every bundled UK area is a valid coarse code with finite coordinates", () => {
    for (const [area, point] of Object.entries(ukAreas)) {
      expect(postalArea(area, "GB"), area).toBe(area);
      expect(point.every(Number.isFinite), area).toBe(true);
    }
  });
  test("distance displays follow the selected country", () => {
    expect(distanceLabel(40234, "CA")).toBe("40 km");
    expect(distanceLabel(40234, "US")).toBe("25 miles");
    expect(distanceLabel(40234, "GB")).toBe("25 miles");
  });
});
