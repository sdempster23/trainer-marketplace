import { execSync } from "node:child_process";

import { expect, test } from "@playwright/test";

/**
 * FRONT-DOOR STRANGER FUNNEL — the local headless rehearsal of the arc's
 * production proof (ruled: this proof is inherently a production proof; the
 * rehearsal exercises the whole funnel free before merge). Runs against the
 * dev server with email confirmation ON (config.toml) and Cloudflare's
 * always-pass Turnstile TEST keys.
 *
 * Covers, in one walk: signup → confirmation email in Mailpit → token
 * exchange through the real /auth/confirm route → middleware bounces the
 * nameless user to /welcome (from /account AND from a DEEP LINK) → name set →
 * browse → message → payment render only after a CONFIRMED booking. Plus the
 * resend path and a bad token → the error surface.
 */

const DB = "supabase_db_trainer-marketplace";
const MAILPIT = "http://127.0.0.1:54324";
const TRAINER_ID = "70a17e51-0000-0000-0000-000000000001";

function sql(q: string): string {
  // Pipe via stdin so multi-statement scripts (with real newlines) work.
  return execSync(
    `docker exec -i ${DB} psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1`,
    { encoding: "utf8", input: q },
  ).trim();
}

test.beforeAll(() => {
  // A listable trainer (name + service_point + service) with payment info,
  // messageable (a real auth user). Idempotent cleanup-first, in FK order
  // (bookings + dogs from any prior run reference the trainer/service).
  sql(`delete from public.messages where thread_id in (select id from public.message_threads where trainer_id='${TRAINER_ID}');
       delete from public.message_threads where trainer_id='${TRAINER_ID}';
       delete from public.bookings where trainer_id='${TRAINER_ID}';
       delete from public.dogs where id='70a17e51-0000-0000-0000-000000000003';
       delete from public.trainer_payment_info where trainer_id='${TRAINER_ID}';
       delete from public.trainer_services where trainer_id='${TRAINER_ID}';
       delete from public.trainers where id='${TRAINER_ID}';
       delete from auth.users where id='${TRAINER_ID}';`);
  sql(
    `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin,confirmation_token,email_change,email_change_token_new,recovery_token)
     values ('00000000-0000-0000-0000-000000000000','${TRAINER_ID}','authenticated','authenticated','rehearsal-trainer@test.local','',now(),now(),now(),'{}','{"role":"trainer"}',false,'','','','')`,
  );
  sql(`update public.profiles set display_name='Rehearsal Trainer' where id='${TRAINER_ID}'`);
  sql(
    `insert into public.trainers (id,timezone,service_point,service_radius_meters)
     values ('${TRAINER_ID}','America/Chicago','SRID=4326;POINT(-86.78 36.16)',80000)`,
  );
  sql(
    `insert into public.trainer_services (id,trainer_id,name,session_type,price_cents,duration_minutes)
     values ('70a17e51-0000-0000-0000-000000000002','${TRAINER_ID}','Rehearsal class','in_home',9000,60)`,
  );
  sql(
    `insert into public.trainer_payment_info (trainer_id,instructions,venmo_handle,paypal_handle)
     values ('${TRAINER_ID}','Venmo preferred, or cash at the session.','rehearsal-trainer','rehearsaltrainer')`,
  );
});

async function confirmationLinkFor(email: string): Promise<string> {
  // Poll Mailpit for the confirmation email and extract our /auth/confirm link.
  for (let i = 0; i < 20; i++) {
    const list = await fetch(`${MAILPIT}/api/v1/messages`).then((r) => r.json());
    const msg = (list.messages ?? []).find((m: { To: { Address: string }[]; ID: string }) =>
      m.To.some((t) => t.Address === email),
    );
    if (msg) {
      const full = await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`).then((r) => r.json());
      const body: string = full.HTML || full.Text || "";
      const m = body.match(/https?:\/\/[^"'\s]*\/auth\/confirm\?[^"'\s]*/);
      if (m) return m[0].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no confirmation email for ${email}`);
}

test("the complete stranger funnel, headless", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `stranger-${Date.now()}@pawmatch.test`;
  const password = "Rehearsal-pass1";

  // 1. SIGN UP (Turnstile test widget auto-passes; role owner is default).
  await page.goto("/sign-up");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  // Consent checkbox (launch gate): unchecked by default, must be checked.
  await page.check("input[name=consent]");
  // Wait for the always-pass test widget to populate the response token.
  await expect
    .poll(
      async () =>
        page.locator('input[name="cf-turnstile-response"]').first().inputValue().catch(() => ""),
      { timeout: 20_000 },
    )
    .not.toBe("");
  await page.getByRole("button", { name: /create account/i }).click();

  // Confirmation ON → no session → the check-email page.
  await page.waitForURL("**/sign-up/check-email");
  await expect(page.getByText(/check your email/i)).toBeVisible();

  // 2. RESEND path (from the check-email page).
  await page.fill("#resend-email", email);
  await page.getByRole("button", { name: /re-send/i }).click();
  await expect(page.getByText(/we've sent a new link|sent a new link/i)).toBeVisible();

  // 3. CONFIRM via the emailed token_hash link → the real /auth/confirm route.
  const link = await confirmationLinkFor(email);
  await page.goto(link);

  // 4. verifyOtp establishes the session → /account → MIDDLEWARE bounces the
  //    nameless user to /welcome.
  await page.waitForURL("**/welcome");
  await expect(page.getByRole("heading", { name: /one last thing/i })).toBeVisible();

  // 5. DEEP-LINK bounce (the review-fixed bug): a nameless user hitting a
  //    non-/account authed surface is ALSO bounced to /welcome.
  await page.goto("/owner/bookings");
  await page.waitForURL("**/welcome");
  await page.goto("/messages");
  await page.waitForURL("**/welcome");

  // 6. Set the name (no skip) → /account.
  await page.goto("/welcome");
  await page.fill("input[name=displayName]", "Stranger Rehearsal");
  await page.getByRole("button", { name: /continue/i }).click();
  await page.waitForURL("**/account");
  await expect(page.getByText(/stranger rehearsal/i)).toBeVisible();

  // 7. BROWSE — the seeded trainer is listable.
  await page.goto("/trainers");
  await expect(page.getByText(/rehearsal trainer/i).first()).toBeVisible();

  // 8. MESSAGE the trainer from the detail page → find-or-create thread.
  await page.goto(`/trainers/${TRAINER_ID}`);
  await page.getByRole("button", { name: /^message/i }).click();
  await page.waitForURL("**/messages/**");

  // 9. PAYMENT gate — BEFORE a confirmed booking, /owner/bookings shows no
  //    payment for this trainer.
  const ownerId = sql(`select id from auth.users where email='${email}'`);
  await page.goto("/owner/bookings");
  await expect(page.getByText(/how to pay/i)).toHaveCount(0);

  // Seed a CONFIRMED booking (owner ↔ trainer) via the trigger-disable
  // convention, then the payment render appears (M17 booking-scoped).
  sql(
    `insert into public.dogs (id,owner_id,name) values ('70a17e51-0000-0000-0000-000000000003','${ownerId}','Rex') on conflict do nothing;
     alter table public.bookings disable trigger trg_bookings_validate_insert;
     insert into public.bookings (id,owner_id,trainer_id,dog_id,service_id,starts_at,duration_minutes,price_cents,status)
     values ('70a17e51-0000-0000-0000-000000000004','${ownerId}','${TRAINER_ID}','70a17e51-0000-0000-0000-000000000003','70a17e51-0000-0000-0000-000000000002', now() + interval '2 days',60,9000,'CONFIRMED');
     alter table public.bookings enable trigger trg_bookings_validate_insert;`,
  );
  await page.goto("/owner/bookings");
  await expect(page.getByText(/how to pay/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /venmo/i })).toHaveAttribute(
    "href",
    "https://venmo.com/u/rehearsal-trainer",
  );

  // 10. BAD/EXPIRED token → the error surface.
  await page.goto("/auth/confirm?token_hash=badtokenhash&type=email&next=/account");
  await page.waitForURL("**/auth/auth-code-error");
});
