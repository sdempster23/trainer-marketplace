import { test, expect } from "@playwright/test";

test("homepage renders the hero heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /PawMatch/i })).toBeVisible();
});
