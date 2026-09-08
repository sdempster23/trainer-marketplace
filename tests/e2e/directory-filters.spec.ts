import { expect, test, type Page } from "@playwright/test";

/**
 * Directory filter controls must agree with the URL after every
 * client-side transition (chips, Clear all, Search within N miles,
 * browser back/forward). The bug this pins: the form's controls are
 * uncontrolled (default*), seeded from the URL only at mount; a
 * next/link transition re-renders the page but React leaves mounted
 * controls alone, so Search re-submits stale DOM state
 * (docs/scratch/directory-filter-probe.md, 2026-09-08).
 *
 * Every scenario sets a window marker before its clicks and asserts it
 * survives, so the test provably exercises the client-side transition
 * path: a full reload would null the marker and FAIL the test, so this
 * suite cannot silently degrade into a hard-reload test.
 *
 * Seed dependency (supabase/seed.sql, ten trainers around Nashville):
 *   - browse mode has results and the specialty boxes exist;
 *   - `gun_dog` is carried only by a trainer ~31 miles from 37203, so
 *     zip=37203&radius=25&specialties=gun_dog renders the empty state
 *     with "Search within 50 miles", and 50 miles returns one card.
 * Run against a PRODUCTION build with one worker (the dev server under
 * host load cannot meet the per-test budget).
 */

const MARKER = "directory-filters-soft-nav";
const box = (page: Page, value: string) =>
  page.locator(`input[name=specialties][value=${value}]`);
const radius = (page: Page) => page.locator("select[name=radius]");
const zip = (page: Page) => page.locator("input[name=zip]");
const summary = (page: Page) => page.locator("details summary");
const chip = (page: Page, label: string) =>
  page.getByRole("link", { name: `Remove ${label} filter` });

async function setMarker(page: Page) {
  await page.evaluate((m) => {
    (window as unknown as { __probe: string }).__probe = m;
  }, MARKER);
}
async function expectMarkerSurvived(page: Page) {
  expect(
    await page.evaluate(
      () => (window as unknown as { __probe?: string }).__probe ?? null,
    ),
    "navigation must be a client-side transition (marker survives)",
  ).toBe(MARKER);
}
/** After any navigation, wait for the (possibly re-created) form. */
async function formSettled(page: Page) {
  await summary(page).waitFor();
}
async function search(page: Page) {
  await page.getByRole("button", { name: "Search" }).click();
}

test("1. Clear all really clears the boxes, and Search does not bring them back", async ({ page }) => {
  await page.goto("/trainers");
  await setMarker(page);
  await summary(page).click();
  await box(page, "agility").check();
  await box(page, "scent_work").check();
  await search(page);
  await page.waitForURL(/specialties=agility.*specialties=scent_work/);
  await formSettled(page);

  await page.getByRole("link", { name: "Clear all" }).click();
  await page.waitForURL((u) => u.pathname === "/trainers" && u.search === "");
  await formSettled(page);
  await expectMarkerSurvived(page);
  await expect(box(page, "agility")).not.toBeChecked();
  await expect(box(page, "scent_work")).not.toBeChecked();
  await expect(summary(page)).not.toContainText("selected");
  await expect(chip(page, "Agility")).toHaveCount(0);

  await search(page);
  await page.waitForTimeout(1500);
  await formSettled(page);
  expect(new URL(page.url()).search).toBe("");
  await expect(chip(page, "Agility")).toHaveCount(0);
});

test("2. Removing one chip unchecks that box only, and Search keeps the rest", async ({ page }) => {
  await page.goto("/trainers?specialties=agility&specialties=scent_work");
  await setMarker(page);
  await chip(page, "Agility").click();
  await page.waitForURL((u) => !u.search.includes("agility"));
  await formSettled(page);
  await expectMarkerSurvived(page);
  expect(new URL(page.url()).searchParams.getAll("specialties")).toEqual(["scent_work"]);
  await expect(box(page, "agility")).not.toBeChecked();
  await expect(box(page, "scent_work")).toBeChecked();
  await expect(summary(page)).toContainText("1 selected");

  await search(page);
  await page.waitForTimeout(1500);
  expect(new URL(page.url()).searchParams.getAll("specialties")).toEqual(["scent_work"]);
});

test("3. Search within 50 miles moves the dropdown too, and Search keeps 50", async ({ page }) => {
  await page.goto("/trainers?zip=37203&radius=25&specialties=gun_dog");
  await setMarker(page);
  await expect(radius(page)).toHaveValue("25");
  await page.getByRole("link", { name: /Search within 50 miles/ }).click();
  await page.waitForURL(/radius=50/);
  await formSettled(page);
  await expectMarkerSurvived(page);
  await expect(radius(page)).toHaveValue("50");
  await expect(page.getByText(/within 50 miles of 37203/)).toBeVisible();

  await search(page);
  await page.waitForTimeout(1500);
  expect(new URL(page.url()).searchParams.get("radius")).toBe("50");
});

test("4. An unsearched ZIP draft is discarded when a chip commits URL state (ruled)", async ({ page }) => {
  await page.goto("/trainers?zip=37203&radius=25&specialties=puppy&specialties=agility");
  await setMarker(page);
  await zip(page).fill("90210");
  await chip(page, "Agility").click();
  await page.waitForURL((u) => !u.search.includes("agility"));
  await formSettled(page);
  await expectMarkerSurvived(page);
  await expect(zip(page)).toHaveValue("37203");
  expect(new URL(page.url()).searchParams.get("zip")).toBe("37203");

  await search(page);
  await page.waitForTimeout(1500);
  expect(new URL(page.url()).searchParams.get("zip")).toBe("37203");
});

test("5. Browser back/forward re-syncs the controls with each history entry", async ({ page }) => {
  await page.goto("/trainers");
  await setMarker(page);
  await summary(page).click();
  await box(page, "agility").check();
  await search(page);
  await page.waitForURL(/specialties=agility/);
  await formSettled(page);
  await page.getByRole("link", { name: "Clear all" }).click();
  await page.waitForURL((u) => u.search === "");
  await formSettled(page);

  await page.goBack();
  await page.waitForURL(/specialties=agility/);
  await formSettled(page);
  await expectMarkerSurvived(page);
  await expect(box(page, "agility")).toBeChecked();
  await expect(chip(page, "Agility")).toBeVisible();

  await page.goForward();
  await page.waitForURL((u) => u.search === "");
  await formSettled(page);
  await expectMarkerSurvived(page);
  await expect(box(page, "agility")).not.toBeChecked();
  await expect(chip(page, "Agility")).toHaveCount(0);
});
