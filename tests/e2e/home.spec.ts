import { test, expect } from "@playwright/test";

/**
 * Smoke of the live homepage surface. NOTE: the headline assertion tracks
 * the design-arc hero (DEFAULT_HEADLINE in components/marketing/hero.tsx) —
 * this spec went stale when the cinematic homepage shipped (2026-07-30) and
 * was reconciled during the email/legal gate arc. If the headline changes
 * again, change it HERE in the same commit.
 */
test("homepage renders the owner hero, real CTAs, and legal links", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: /find the trainer your dog needs/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /find a trainer/i })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /join as a trainer/i }),
  ).toBeVisible();

  // Launch gate: the footer carries the legal pages sitewide.
  await expect(page.getByRole("link", { name: /terms of service/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /privacy policy/i })).toBeVisible();
});
