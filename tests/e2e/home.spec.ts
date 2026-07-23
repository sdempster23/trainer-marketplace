import { test, expect } from "@playwright/test";

test("homepage renders the owner hero and real CTAs", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: /find a dog trainer/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /find a trainer/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /join as a trainer/i })).toBeVisible();
});
