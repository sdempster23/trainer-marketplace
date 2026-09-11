import { expect, test } from "@playwright/test";

import { PASSWORD_MIN_LENGTH } from "../../lib/validators/auth";

/**
 * Auth pages: each owns a real h1 and a descriptive title, and the
 * login ⇄ sign-up links carry a validated `?next=` destination (the
 * "Log in to message" → switch-forms path) — same-origin paths only.
 * The app shell header's own "Log in" / "Sign up" links carry the same
 * validated value (and stay bare everywhere else) — pinned in the
 * "app shell header" block below; in-page link locators are scoped to
 * <main> so the two sets never collide.
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

test.describe("app shell header", () => {
  const header = (page: import("@playwright/test").Page) => page.getByRole("banner");

  test("on /login with a valid next, Sign up carries it", async ({ page }) => {
    await page.goto(`/login?next=${encodeURIComponent(DEST)}`);
    await expect(header(page).getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      `/sign-up?next=${encodeURIComponent(DEST)}`,
    );
  });

  test("on /sign-up and /sign-up/check-email with a valid next, Log in carries it", async ({
    page,
  }) => {
    for (const path of ["/sign-up", "/sign-up/check-email"]) {
      await page.goto(`${path}?next=${encodeURIComponent(DEST)}`);
      await expect(header(page).getByRole("link", { name: "Log in" })).toHaveAttribute(
        "href",
        `/login?next=${encodeURIComponent(DEST)}`,
      );
    }
  });

  test("an off-origin next is dropped from both header links", async ({ page }) => {
    await page.goto("/login?next=https%3A%2F%2Fevil.example%2Fx");
    await expect(header(page).getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
    await expect(header(page).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  test("on a route with no next, both header links stay bare", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(header(page).getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
    await expect(header(page).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });
});

test.describe("sign-up password guidance", () => {
  test("the minimum length is stated beneath the field and enforced by the browser", async ({
    page,
  }) => {
    await page.goto("/sign-up");
    const password = page.getByLabel("Password");
    // The browser attribute is sourced from the SAME constant the server
    // action's zod schema enforces — the spec imports it so the two cannot
    // drift without this test noticing.
    await expect(password).toHaveAttribute("minlength", String(PASSWORD_MIN_LENGTH));
    const guidance = new RegExp(`at least ${PASSWORD_MIN_LENGTH} characters`, "i");
    await expect(password).toHaveAccessibleDescription(guidance);
    await expect(page.getByText(guidance)).toBeVisible();

    // One character short: the field itself reports too-short, so a
    // submit stops HERE with the browser's length message — not later at
    // the unchecked consent box.
    await password.pressSequentially("x".repeat(PASSWORD_MIN_LENGTH - 1));
    await expect(password).toHaveJSProperty("validity.tooShort", true);
    await password.fill("x".repeat(PASSWORD_MIN_LENGTH));
    await expect(password).toHaveJSProperty("validity.tooShort", false);
  });
});
