import { describe, expect, test } from "vitest";

import { editListingSchema } from "@/lib/validators/trainer";

/** The edit path must not become a side door around onboarding's rules. */
const VALID = {
  bio: "I train working dogs and family pets alike.",
  specialties: ["puppy"],
  zip: "",
  serviceRadiusMiles: "25",
  timezone: "America/Chicago",
};

describe("editListingSchema (flow ruling #1)", () => {
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
