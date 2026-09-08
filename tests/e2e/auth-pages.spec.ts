import { expect, test } from "@playwright/test";

/**
 * Auth pages: each owns a real h1 and a descriptive title, and the
 * login ⇄ sign-up links carry a validated `?next=` destination (the
 * "Log in to message" → switch-forms path) — same-origin paths only.
 * Link locators are scoped to <main>: the app shell header carries its
 * own bare "Log in" / "Sign up" links.
 */

const DEST = "/trainers/70a17e51-0000-0000-0000-000000000001";

test("login page: h1, title, and Sign up carries a valid next", async ({ page }) => {
  await page.goto(`/login?next=${encodeURIComponent(DEST)}`);
  await expect(page).toHaveTitle("Log in — PawMatch");
  await expect(page.getByRole("heading", { level: 1, name: "Log in" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Sign up" })).toHaveAttribute(
    "href",
    `/sign-up?next=${encodeURIComponent(DEST)}`,
  );
  await expect(page.locator("input[name=next]")).toHaveValue(DEST);
});

test("login page: an off-origin next is dropped from the Sign up link and the form", async ({ page }) => {
  await page.goto("/login?next=https%3A%2F%2Fevil.example%2Fx");
  await expect(page.getByRole("main").getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
  await expect(page.locator("input[name=next]")).toHaveCount(0);
});

test("sign-up page: h1, title, preset role, and Log in carries next back", async ({ page }) => {
  await page.goto(`/sign-up?role=trainer&next=${encodeURIComponent(DEST)}`);
  await expect(page).toHaveTitle("Create your account — PawMatch");
  await expect(
    page.getByRole("heading", { level: 1, name: "Create your account" }),
  ).toBeVisible();
  await expect(page.locator("input[name=role][value=trainer]")).toBeChecked();
  await expect(page.getByRole("main").getByRole("link", { name: "Log in" })).toHaveAttribute(
    "href",
    `/login?next=${encodeURIComponent(DEST)}`,
  );
  await expect(page.locator("input[name=next]")).toHaveValue(DEST);
});

test("reset-password page without a session: h1 and title", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page).toHaveTitle("Choose a new password — PawMatch");
  await expect(
    page.getByRole("heading", { level: 1, name: /this link didn't work/i }),
  ).toBeVisible();
});

test("forgot-password page: h1 and title", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page).toHaveTitle("Reset your password — PawMatch");
  await expect(
    page.getByRole("heading", { level: 1, name: "Reset your password" }),
  ).toBeVisible();
});

test("check-email page: h1, title, and Log in carries next", async ({ page }) => {
  await page.goto(`/sign-up/check-email?next=${encodeURIComponent(DEST)}`);
  await expect(page).toHaveTitle("Check your email — PawMatch");
  await expect(page.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Log in" })).toHaveAttribute(
    "href",
    `/login?next=${encodeURIComponent(DEST)}`,
  );
});
