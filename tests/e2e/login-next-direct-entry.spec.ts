import { execSync } from "node:child_process";

import { expect, test } from "@playwright/test";

/**
 * Logged-out DIRECT ENTRY to an authed page (saved link, typed URL, expired
 * session) must carry that page's own path through `?next=` — the same
 * convention the profile's "Book a session" and "Log in to message" links
 * already use. PR #55/#57 fixed the LINKS; this pins the pages' OWN guards,
 * a different call site: reported as a logged-out visitor opening
 * /trainers/{id}/book directly, landing on a bare /login, and losing where
 * they were going.
 *
 * The redirect table needs no data: every guard checks auth BEFORE any row
 * read, so a well-formed id is enough. The round trip (log in from the
 * bounced page → land on the book page) seeds a one-service trainer and an
 * owner with a known password and no dogs, so the book page's first honest
 * state ("Add a dog first") proves the destination was reached.
 *
 * Out of scope by ruling (docs/design/arc-notes.md, KNOWN GAP): a brand-new
 * user's destination still dies at the confirmation email, which hardcodes
 * next=/account. This spec covers a RETURNING user who logs in directly.
 */

const DB = "supabase_db_trainer-marketplace";
const TRAINER_ID = "70a17e51-0000-0000-0000-000000000030";
const SERVICE_ID = "70a17e51-0000-0000-0000-000000000031";
const OWNER_ID = "70a17e51-0000-0000-0000-000000000032";
const THREAD_ID = "70a17e51-0000-0000-0000-000000000033"; // well-formed; never read
const OWNER_EMAIL = "direct-entry-owner@test.local";
const OWNER_PASSWORD = "Rehearsal-pass1";

const BOOK_PATH = `/trainers/${TRAINER_ID}/book`;

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
  const ids = `'${TRAINER_ID}','${OWNER_ID}'`;
  sql(`delete from public.messages where thread_id in (select id from public.message_threads where trainer_id in (${ids}) or owner_id in (${ids}));
       delete from public.message_threads where trainer_id in (${ids}) or owner_id in (${ids});
       delete from public.bookings where trainer_id in (${ids}) or owner_id in (${ids});
       delete from public.dogs where owner_id in (${ids});
       delete from public.trainer_services where trainer_id in (${ids});
       delete from public.trainers where id in (${ids});
       delete from auth.users where id in (${ids});`);
  seedUser(TRAINER_ID, "direct-entry-trainer@test.local", "trainer", "Direct Entry Trainer");
  seedUser(OWNER_ID, OWNER_EMAIL, "owner", "Direct Entry Owner");
  sql(
    `insert into public.trainers (id,timezone,service_point,service_radius_meters)
     values ('${TRAINER_ID}','America/Chicago','SRID=4326;POINT(-86.78 36.16)',80000)`,
  );
  sql(
    `insert into public.trainer_services (id,trainer_id,name,session_type,price_cents,duration_minutes)
     values ('${SERVICE_ID}','${TRAINER_ID}','Direct entry class','in_home',9000,60)`,
  );
});

/** Every authed page guard that should carry its own path. */
const CARRIES_OWN_PATH = [
  BOOK_PATH,
  "/owner/bookings",
  "/owner/dogs",
  "/messages",
  `/messages/${THREAD_ID}`,
  "/trainer/bookings",
  "/trainer/services",
  "/trainer/availability",
  "/trainer/listing",
  "/trainer/listing/edit",
  "/trainer/onboarding",
];

for (const path of CARRIES_OWN_PATH) {
  test(`logged-out direct entry to ${path} carries it as next`, async ({ page }) => {
    await page.goto(path);
    await page.waitForURL("**/login**");
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe(path);
    // The login page validated and consumed it: the form carries it back.
    await expect(page.locator("input[name=next]")).toHaveValue(path);
  });
}

/**
 * Ruled bare: /account IS the post-login default, so carrying it is noise;
 * /welcome is a transitional gate (the middleware routes a nameless user
 * there after login regardless), never a destination anyone intended.
 */
for (const path of ["/account", "/welcome"]) {
  test(`logged-out direct entry to ${path} stays a bare /login`, async ({ page }) => {
    await page.goto(path);
    await page.waitForURL("**/login**");
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBeNull();
  });
}

test("round trip: bounced from /book, logging in lands on the book page", async ({ page }) => {
  await page.goto(BOOK_PATH);
  await page.waitForURL("**/login**");
  await page.fill("input[name=email]", OWNER_EMAIL);
  await page.fill("input[name=password]", OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(`**${BOOK_PATH}`);
  // The owner has no dogs: the book page's first honest state proves the
  // destination was reached, not merely the URL.
  await expect(page.getByText("Add a dog first")).toBeVisible();
});
