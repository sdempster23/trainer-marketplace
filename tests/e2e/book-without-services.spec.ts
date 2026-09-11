import { execSync } from "node:child_process";

import { expect, test } from "@playwright/test";

/**
 * The zero-services booking dead end (audit, reported three times): a
 * trainer with no bookable service must not offer "Book a session". The
 * profile's sticky bar carries the message fallback instead, and the book
 * page — still reachable by URL — says the same thing BEFORE the dog
 * guard. A control trainer WITH a service pins that ≥1 is untouched.
 *
 * Self-contained seeding (this spec must not depend on the funnel's
 * trainer existing): a zero-service trainer, a one-service control
 * trainer, and a named owner with a KNOWN password and NO dogs.
 * The failed-read case is NOT e2e-testable and is pinned by the unit
 * table in lib/trainer/book-bar-state.test.ts.
 */

const DB = "supabase_db_trainer-marketplace";
const ZERO_TRAINER_ID = "70a17e51-0000-0000-0000-000000000020";
const OWNER_ID = "70a17e51-0000-0000-0000-000000000021";
const CONTROL_TRAINER_ID = "70a17e51-0000-0000-0000-000000000022";
const CONTROL_SERVICE_ID = "70a17e51-0000-0000-0000-000000000023";
const OWNER_EMAIL = "zero-services-owner@test.local";
const OWNER_PASSWORD = "Rehearsal-pass1";
const ZERO_NAME = "Zero Services Trainer";

function sql(q: string): string {
  return execSync(
    `docker exec -i ${DB} psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1`,
    { encoding: "utf8", input: q },
  ).trim();
}

function seedUser(id: string, email: string, role: "owner" | "trainer", name: string) {
  sql(
    `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin,confirmation_token,email_change,email_change_token_new,recovery_token)
     values ('00000000-0000-0000-0000-000000000000','${id}','authenticated','authenticated','${email}',crypt('${OWNER_PASSWORD}',gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}','{"role":"${role}"}',false,'','','','')`,
  );
  sql(`update public.profiles set display_name='${name}' where id='${id}'`);
}

test.beforeAll(() => {
  const ids = `'${ZERO_TRAINER_ID}','${OWNER_ID}','${CONTROL_TRAINER_ID}'`;
  sql(`delete from public.messages where thread_id in (select id from public.message_threads where trainer_id in (${ids}) or owner_id in (${ids}));
       delete from public.message_threads where trainer_id in (${ids}) or owner_id in (${ids});
       delete from public.bookings where trainer_id in (${ids}) or owner_id in (${ids});
       delete from public.dogs where owner_id in (${ids});
       delete from public.trainer_services where trainer_id in (${ids});
       delete from public.trainers where id in (${ids});
       delete from auth.users where id in (${ids});`);
  seedUser(ZERO_TRAINER_ID, "zero-services-trainer@test.local", "trainer", ZERO_NAME);
  seedUser(CONTROL_TRAINER_ID, "control-trainer@test.local", "trainer", "Control Trainer");
  seedUser(OWNER_ID, OWNER_EMAIL, "owner", "Zero Services Owner");
  sql(
    `insert into public.trainers (id,timezone,service_point,service_radius_meters)
     values ('${ZERO_TRAINER_ID}','America/Chicago','SRID=4326;POINT(-86.78 36.16)',80000),
            ('${CONTROL_TRAINER_ID}','America/Chicago','SRID=4326;POINT(-86.78 36.16)',80000)`,
  );
  sql(
    `insert into public.trainer_services (id,trainer_id,name,session_type,price_cents,duration_minutes)
     values ('${CONTROL_SERVICE_ID}','${CONTROL_TRAINER_ID}','Control class','in_home',9000,60)`,
  );
});

const ZERO_COPY = new RegExp(`${ZERO_NAME} isn't taking bookings right now`);
const ZERO_PROFILE = `/trainers/${ZERO_TRAINER_ID}`;
const ZERO_BOOK = `${ZERO_PROFILE}/book`;

async function logInAsOwner(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("input[name=email]", OWNER_EMAIL);
  await page.fill("input[name=password]", OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/account");
}

test("logged-out: the bar offers Log in to message, and nothing links to /book", async ({ page }) => {
  await page.goto(ZERO_PROFILE);
  await expect(page.getByText(ZERO_COPY)).toBeVisible();
  // Header + bar: both carry the SAME login link, back to the PROFILE.
  const loginLinks = page.getByRole("link", { name: "Log in to message" });
  await expect(loginLinks).toHaveCount(2);
  for (const link of await loginLinks.all()) {
    await expect(link).toHaveAttribute("href", `/login?next=${encodeURIComponent(ZERO_PROFILE)}`);
  }
  await expect(page.locator(`a[href="${ZERO_BOOK}"]`)).toHaveCount(0);
  await expect(page.locator(`a[href*="${encodeURIComponent(ZERO_BOOK)}"]`)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Book a session" })).toHaveCount(0);
  // The Services section no longer claims a history it cannot know.
  await expect(page.getByText("No services listed.", { exact: true })).toBeVisible();
  await expect(page.getByText(/No services listed yet/)).toHaveCount(0);
});

test("owner: the bar offers Message, and nothing links to /book", async ({ page }) => {
  await logInAsOwner(page);
  await page.goto(ZERO_PROFILE);
  await expect(page.getByText(ZERO_COPY)).toBeVisible();
  // Header + bar: two Message forms, both find-or-create (fine by design).
  await expect(page.getByRole("button", { name: "Message" })).toHaveCount(2);
  await expect(page.locator(`a[href="${ZERO_BOOK}"]`)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Book a session" })).toHaveCount(0);
});

test("owner with NO dogs, direct to /book: the zero state with Message, not 'Add a dog first'", async ({ page }) => {
  await logInAsOwner(page);
  await page.goto(ZERO_BOOK);
  await expect(page.getByText(ZERO_COPY)).toBeVisible();
  await expect(page.getByRole("button", { name: "Message" })).toBeVisible();
  await expect(page.getByText(/Add a dog first/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to the trainer" })).toHaveAttribute("href", ZERO_PROFILE);
});

test("control: a trainer WITH a service still gets Book a session", async ({ page }) => {
  await page.goto(`/trainers/${CONTROL_TRAINER_ID}`);
  await expect(page.getByRole("link", { name: "Book a session" })).toHaveAttribute(
    "href",
    `/login?next=${encodeURIComponent(`/trainers/${CONTROL_TRAINER_ID}/book`)}`,
  );
  await expect(page.getByText(/isn't taking bookings right now/)).toHaveCount(0);
  await logInAsOwner(page);
  await page.goto(`/trainers/${CONTROL_TRAINER_ID}`);
  await expect(page.getByRole("link", { name: "Book a session" })).toHaveAttribute(
    "href",
    `/trainers/${CONTROL_TRAINER_ID}/book`,
  );
});
