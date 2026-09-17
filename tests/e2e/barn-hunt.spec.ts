import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

/**
 * Local Supabase only. Run against a production build with one worker.
 * A temporary trainer creates, edits, and removes Barn Hunt through the UI;
 * anonymous discovery must reflect the persisted specialties in both modes.
 * No seed reset, live mail, bookings, or uploads. Cleanup touches this user only.
 */
const TRAINER_ID = "ba4a0001-0000-4000-8000-000000000001";
const EMAIL = "barn-hunt-e2e@test.local";
const PASSWORD = "Barn-hunt-test1";
const NAME = "Barn Hunt Test Trainer";

function sql(query: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "supabase_db_trainer-marketplace", "psql", "-U", "postgres", "-d", "postgres", "-tA", "-v", "ON_ERROR_STOP=1"],
    { input: query, encoding: "utf8" },
  ).trim();
}

function cleanup() {
  sql(`delete from public.analytics_events where user_id = '${TRAINER_ID}';
       delete from auth.users where id = '${TRAINER_ID}';`);
}

test.beforeAll(({ baseURL }) => {
  if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
    throw new Error("Barn Hunt tests require the local PawMatch app and local Supabase.");
  }
  cleanup();
  sql(`insert into auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
     is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', '${TRAINER_ID}',
      'authenticated', 'authenticated', '${EMAIL}', crypt('${PASSWORD}', gen_salt('bf')),
      now(), now(), now(), '{"provider":"email","providers":["email"]}',
      '{"role":"trainer"}', false, '', '', '', '');`);
  // The name step precedes listing onboarding; start after that existing gate.
  sql(`update public.profiles set display_name = '${NAME}' where id = '${TRAINER_ID}';`);
});

test.afterAll(cleanup);

test("Barn Hunt persists through onboarding and edits, and filters public discovery", async ({ page, browser, baseURL }) => {
  await page.goto("/login?next=%2Ftrainer%2Fonboarding");
  await page.getByLabel("Email", { exact: true }).fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/trainer/onboarding");
  await page.getByLabel("Your name", { exact: true }).fill(NAME);
  await page.getByLabel("About you", { exact: true }).fill("I help dogs and their owners learn Barn Hunt together.");
  await page.getByRole("checkbox", { name: "Barn Hunt", exact: true }).check();
  await page.getByLabel("ZIP code", { exact: true }).fill("37203");
  await page.getByLabel("How far will you travel?").selectOption("25");
  await page.getByRole("button", { name: "Create listing", exact: true }).click();
  await page.waitForURL("**/trainer/listing");

  await page.goto("/trainer/listing/edit");
  await expect(page.getByRole("checkbox", { name: "Barn Hunt", exact: true })).toBeChecked();
  await page.locator('input[name="specialties"][value="puppy"]').check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.waitForURL("**/trainer/listing");
  expect(sql(`select specialty from public.trainer_specialty_assignments
    where trainer_id = '${TRAINER_ID}' order by specialty;`)).toBe("puppy\nbarn_hunt");

  const visitor = await browser.newContext({ baseURL });
  try {
    const directory = await visitor.newPage();
    await directory.goto(`/trainers/${TRAINER_ID}`);
    await expect(directory.getByText("Barn Hunt", { exact: true })).toBeVisible();
    await directory.goto("/trainers");
    await directory.locator("details summary").click();
    await directory.getByRole("checkbox", { name: "Barn Hunt", exact: true }).check();
    await directory.getByRole("button", { name: "Search", exact: true }).click();
    await directory.waitForURL(/specialties=barn_hunt/);
    await expect(directory.getByRole("link", { name: NAME, exact: true })).toBeVisible();
    await expect(directory.getByRole("link", { name: "Remove Barn Hunt filter" })).toBeVisible();
    await directory.locator('input[name="zip"]').fill("37203");
    await directory.getByRole("button", { name: "Search", exact: true }).click();
    await directory.waitForURL(/zip=37203.*specialties=barn_hunt/);
    await expect(directory.getByRole("link", { name: NAME, exact: true })).toBeVisible();

    // Removing Barn Hunt preserves the other specialty and removes this match.
    await page.goto("/trainer/listing/edit");
    await expect(page.locator('input[name="specialties"][value="puppy"]')).toBeChecked();
    await page.getByRole("checkbox", { name: "Barn Hunt", exact: true }).uncheck();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.waitForURL("**/trainer/listing");
    expect(sql(`select specialty from public.trainer_specialty_assignments
      where trainer_id = '${TRAINER_ID}';`)).toBe("puppy");
    for (const url of ["/trainers?specialties=barn_hunt", "/trainers?zip=37203&radius=25&specialties=barn_hunt"]) {
      await directory.goto(url);
      await expect(directory.getByRole("link", { name: "Remove Barn Hunt filter" })).toBeVisible();
      await expect(directory.getByRole("link", { name: NAME, exact: true })).toHaveCount(0);
    }
    await directory.goto("/trainers?specialties=puppy");
    await expect(directory.getByRole("link", { name: NAME, exact: true })).toBeVisible();

    await page.goto("/trainer/listing/edit");
    await page.getByRole("checkbox", { name: "Barn Hunt", exact: true }).check();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.waitForURL("**/trainer/listing");
    await directory.goto("/trainers?zip=37203&radius=25&specialties=barn_hunt");
    await expect(directory.getByRole("link", { name: NAME, exact: true })).toBeVisible();
    expect(sql(`select specialty from public.trainer_specialty_assignments
      where trainer_id = '${TRAINER_ID}' order by specialty;`)).toBe("puppy\nbarn_hunt");
  } finally {
    await visitor.close();
  }
});
