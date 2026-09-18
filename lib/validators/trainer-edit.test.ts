import { describe, expect, test } from "vitest";

import { editListingSchema, onboardingSchema } from "@/lib/validators/trainer";

/** The edit path must not become a side door around onboarding's rules. */
const VALID = {
  bio: "I train working dogs and family pets alike.",
  specialties: ["puppy"],
  zip: "",
  serviceRadiusMiles: "25",
  timezone: "America/Chicago",
};

describe("editListingSchema (flow ruling #1)", () => {
  test("a trainer can add Barn Hunt while keeping an existing specialty", () => {
    const r = editListingSchema.safeParse({
      ...VALID,
      specialties: ["puppy", "barn_hunt"],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.specialties).toEqual(["puppy", "barn_hunt"]);
  });

  test("blank ZIP means keep the current service area", () => {
    const r = editListingSchema.safeParse(VALID);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.zip).toBeUndefined();
  });

  test("a provided ZIP is validated like onboarding's", () => {
    expect(
      editListingSchema.safeParse({ ...VALID, zip: "3720" }).success,
    ).toBe(false);
    const r = editListingSchema.safeParse({ ...VALID, zip: "37203" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.zip).toBe("37203");
  });

  test("still requires at least one specialty", () => {
    expect(
      editListingSchema.safeParse({ ...VALID, specialties: [] }).success,
    ).toBe(false);
  });

  test("has no displayName field (name is edited on /account)", () => {
    const r = editListingSchema.safeParse({
      ...VALID,
      displayName: "ignored",
    });
    expect(r.success).toBe(true);
    if (r.success) expect("displayName" in r.data).toBe(false);
  });
});

test("a new trainer can create a listing specializing in Barn Hunt", () => {
  const r = onboardingSchema.safeParse({
    ...VALID,
    displayName: "Barn Hunt Trainer",
    zip: "37203",
    specialties: ["barn_hunt"],
  });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.specialties).toEqual(["barn_hunt"]);
});

describe("international listing locations", () => {
  test.each([
    ["CA", "m5v 3a8", "America/Toronto", "M5V"],
    ["GB", "sw1a 1aa", "Europe/London", "SW1A"],
    ["GB", "BT1 5GS", "Europe/London", "BT1"],
  ])("accepts and normalizes a %s listing's postal area", (country, zip, timezone, area) => {
    const result = onboardingSchema.safeParse({
      ...VALID, displayName: "Local Trainer", country, zip, timezone,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.zip).toBe(area);
  });

  test("rejects a valid postal prefix followed by junk", () => {
    expect(onboardingSchema.safeParse({ ...VALID, displayName: "Local Trainer",
      country: "CA", zip: "M5V nonsense", timezone: "America/Toronto" }).success).toBe(false);
  });

  test("does not accept a US ZIP as a Canadian location", () => {
    expect(onboardingSchema.safeParse({ ...VALID, displayName: "Local Trainer",
      country: "CA", zip: "37203", timezone: "America/Toronto" }).success).toBe(false);
  });
});
