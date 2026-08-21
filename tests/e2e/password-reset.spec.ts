import { execSync } from "node:child_process";

import { expect, test } from "@playwright/test";

/**
 * PASSWORD-RESET ROUND TRIP — the local headless rehearsal of the arc's
 * production recovery proof (launch-gate ruling 3): request page → recovery
 * email in Mailpit → the real /auth/confirm route (type=recovery) →
 * /reset-password → new password → login with it.
 *
 * Also pins the two security postures: no account-enumeration oracle on the
 * request page, and /reset-password without a recovery session renders the
 * expired state (never a working form).
 */

const DB = "supabase_db_trainer-marketplace";
const MAILPIT = "http://127.0.0.1:54324";
const USER_ID = "70a17e51-0000-0000-0000-000000000010";
const EMAIL = "reset-rehearsal@test.local";
const OLD_PASSWORD = "OldRehearsal-1";
const NEW_PASSWORD = "NewRehearsal-2";

function sql(q: string): string {
  return execSync(
    `docker exec -i ${DB} psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1`,
    { encoding: "utf8", input: q },
  ).trim();
}

function seedUser(): void {
  // A confirmed, named owner with a KNOWN password (crypt/bf is what GoTrue
  // verifies against locally). Seeded INSIDE the one test that needs it —
  // a beforeAll would re-run in every parallel worker and race the insert.
  sql(`delete from auth.users where id='${USER_ID}';`);
  sql(
    `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin,confirmation_token,email_change,email_change_token_new,recovery_token)
     values ('00000000-0000-0000-0000-000000000000','${USER_ID}','authenticated','authenticated','${EMAIL}',crypt('${OLD_PASSWORD}',gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}','{"role":"owner"}',false,'','','','')`,
  );
  sql(`update public.profiles set display_name='Reset Rehearsal' where id='${USER_ID}'`);
}

type MailpitMessage = { To: { Address: string }[]; ID: string };

/** IDs of messages already in Mailpit for this address — a stale recovery
 * link from a previous run would 'confirm' into the error page. */
async function existingMessageIds(email: string): Promise<Set<string>> {
  const list = await fetch(`${MAILPIT}/api/v1/messages`).then((r) => r.json());
  return new Set(
    ((list.messages ?? []) as MailpitMessage[])
      .filter((m) => m.To.some((t) => t.Address === email))
      .map((m) => m.ID),
  );
}

async function recoveryLinkFor(
  email: string,
  ignoreIds: Set<string>,
): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const list = await fetch(`${MAILPIT}/api/v1/messages`).then((r) => r.json());
    const msg = ((list.messages ?? []) as MailpitMessage[]).find(
      (m) => !ignoreIds.has(m.ID) && m.To.some((t) => t.Address === email),
    );
    if (msg) {
      const full = await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`).then((r) =>
        r.json(),
      );
      const body: string = full.HTML || full.Text || "";
      const m = body.match(
        /https?:\/\/[^"'\s]*\/auth\/confirm\?[^"'\s]*type=recovery[^"'\s]*/,
      );
      if (m) return m[0].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no recovery email for ${email}`);
}

/** Wait for the always-pass Turnstile TEST widget to mint its token —
 * submitting before it populates fails the (fails-closed) server check. */
async function waitForTurnstileToken(page: import("@playwright/test").Page) {
  await expect
    .poll(
      async () =>
        page
          .locator('input[name="cf-turnstile-response"]')
          .first()
          .inputValue()
          .catch(() => ""),
      { timeout: 20_000 },
    )
    .not.toBe("");
}

test("password reset: request → email → new password → login", async ({
  page,
}) => {
  test.setTimeout(90_000);
  seedUser();

  // 1. REQUEST from the login page's link. (Baseline Mailpit first so a
  //    stale email from a previous run can't be mistaken for the fresh one.)
  const staleIds = await existingMessageIds(EMAIL);
  await page.goto("/login");
  await page.getByRole("link", { name: /forgot/i }).click();
  await page.waitForURL("**/forgot-password");
  await page.fill("input[name=email]", EMAIL);
  await waitForTurnstileToken(page);
  await page.getByRole("button", { name: /send reset link/i }).click();
  // Server-action round trip; generous timeout — under parallel-worker
  // load the dev server can exceed the 5s default (observed flake).
  await expect(page.getByText(/if an account exists/i)).toBeVisible({
    timeout: 15_000,
  });

  // 2. The recovery link goes through the REAL /auth/confirm route and
  //    lands on the reset form.
  const link = await recoveryLinkFor(EMAIL, staleIds);
  await page.goto(link);
  await page.waitForURL("**/reset-password");

  // 3. NEW PASSWORD → the authed landing.
  await page.fill("input[name=password]", NEW_PASSWORD);
  await page.getByRole("button", { name: /set new password/i }).click();
  await page.waitForURL("**/account");

  // 4. SINGLE-USE: revisiting the consumed link (fresh session) lands on
  //    the error surface, never a second working reset form.
  await page.context().clearCookies();
  await page.goto(link);
  await page.waitForURL("**/auth/auth-code-error");

  // 5. ROUND TRIP: the OLD password is dead…
  await page.goto("/login");
  await page.fill("input[name=email]", EMAIL);
  await page.fill("input[name=password]", OLD_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  // …and the NEW one logs in. Reload first: React resets the uncontrolled
  // form when the failed action settles, and that reset commit can land
  // AFTER immediate refills — wiping them so the retry submits an empty
  // form. A fresh document makes the second attempt deterministic.
  await page.reload();
  await page.fill("input[name=email]", EMAIL);
  await page.fill("input[name=password]", NEW_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL("**/account");
});

test("request page never reveals whether an account exists", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await page.fill("input[name=email]", "no-such-user@test.local");
  await waitForTurnstileToken(page);
  await page.getByRole("button", { name: /send reset link/i }).click();
  // Same success copy as the real-account path — no enumeration oracle.
  await expect(page.getByText(/if an account exists/i)).toBeVisible({
    timeout: 15_000,
  });
});

test("/reset-password without a recovery session shows the expired state", async ({
  page,
}) => {
  await page.goto("/reset-password");
  await expect(page.getByText(/expired or invalid/i)).toBeVisible();
  await expect(page.locator("input[name=password]")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /request a new link/i }),
  ).toBeVisible();
});
