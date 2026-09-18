import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { parseEnv } from "node:util";

import { expect, test, type Page } from "@playwright/test";

/** Local-only, seeded accounts: see README-international-listings.md. */
const DB = "supabase_db_trainer-marketplace";
const PASSWORD = "International-e2e-pass1";
const CASES = [
  {
    country: "CA", countryName: "Canada", currency: "CAD", zone: "America/Toronto",
    area: "M5V", fullPostal: "M5V 3A8", postalLabel: "Postal code", radiusLabel: "40 km",
    trainerId: "ca220001-0000-4000-8000-000000000001", trainerEmail: "international-ca-trainer@test.local",
    ownerId: "ca220001-0000-4000-8000-000000000002", ownerEmail: "international-ca-owner@test.local",
    dogId: "ca220001-0000-4000-8000-000000000003", availabilityId: "ca220001-0000-4000-8000-000000000004",
    name: "International CA Test Trainer", service: "Canadian test session",
  },
  {
    country: "GB", countryName: "United Kingdom", currency: "GBP", zone: "Europe/London",
    area: "BT1", fullPostal: "BT1 5GS", postalLabel: "Postcode", radiusLabel: "25 miles",
    trainerId: "ca220002-0000-4000-8000-000000000001", trainerEmail: "international-gb-trainer@test.local",
    ownerId: "ca220002-0000-4000-8000-000000000002", ownerEmail: "international-gb-owner@test.local",
    dogId: "ca220002-0000-4000-8000-000000000003", availabilityId: "ca220002-0000-4000-8000-000000000004",
    name: "International GB Test Trainer", service: "British test session",
  },
] as const;
type CountryCase = (typeof CASES)[number];
const trainerIds = CASES.map((c) => `'${c.trainerId}'`).join(",");
const ownerIds = CASES.map((c) => `'${c.ownerId}'`).join(",");
const userIds = `${trainerIds},${ownerIds}`;
let dockerContext: string | undefined;
let targetVerified = false;

function docker(args: string[], input?: string): string {
  if (!dockerContext) throw new Error("Local Docker context has not been verified.");
  return execFileSync("docker", ["--context", dockerContext, ...args], {
    encoding: "utf8", input, timeout: 20_000,
  }).trim();
}

function sql(query: string): string {
  return docker([
    "exec", "-i", DB, "psql", "-X", "-h", "/var/run/postgresql", "-p", "5432",
    "-U", "postgres", "-d", "postgres", "-tA", "-v", "ON_ERROR_STOP=1",
  ], query);
}

function localHttpUrl(value: string | undefined, expectedPort?: string): URL {
  const url = new URL(value ?? "");
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || (expectedPort && url.port !== expectedPort)) {
    throw new Error("International browser tests require loopback HTTP targets only.");
  }
  return url;
}

function verifyTarget(baseURL: string | undefined) {
  if (process.env.PAWMATCH_E2E_LOCAL_ONLY !== "1") {
    throw new Error("Read README-international-listings.md and confirm the local server with PAWMATCH_E2E_LOCAL_ONLY=1.");
  }
  localHttpUrl(baseURL);
  const mode = process.env.PAWMATCH_E2E_APP_MODE;
  if (mode !== "development" && mode !== "production") {
    throw new Error("Set PAWMATCH_E2E_APP_MODE to the running local server's mode: development or production.");
  }
  if (!existsSync(".env.local")) throw new Error("The local development environment file is missing.");
  // Next's precedence, read as data; never source an env file or print keys.
  let env: Record<string, string | undefined> = {};
  for (const file of [".env", `.env.${mode}`, ".env.local", `.env.${mode}.local`]) {
    if (existsSync(file)) env = { ...env, ...parseEnv(readFileSync(file, "utf8")) };
  }
  env = { ...env, ...process.env };
  localHttpUrl(env.NEXT_PUBLIC_SUPABASE_URL, "54321");
  if (env.RESEND_API_KEY && !env.RESEND_API_KEY.includes("<")) {
    throw new Error("Stopped: the local server and test runner must use email log mode.");
  }
  if (env.VERCEL) throw new Error("These fixtures must not run in a Vercel deployment.");
  const config = readFileSync("supabase/config.toml", "utf8");
  const dbSection = config.split(/^\[db\]\s*$/m)[1]?.split(/^\[/m)[0] ?? "";
  if (!/^project_id\s*=\s*"trainer-marketplace"\s*$/m.test(config)
    || !/^port\s*=\s*54322\s*$/m.test(dbSection)) {
    throw new Error("Stopped: expected the existing trainer-marketplace local stack.");
  }
  dockerContext = execFileSync("docker", ["context", "show"], { encoding: "utf8", timeout: 10_000 }).trim();
  const endpoint = docker(["context", "inspect", dockerContext, "--format", "{{.Endpoints.docker.Host}}"]);
  if (!endpoint.startsWith("unix://") || !statSync(endpoint.slice(7)).isSocket()) {
    throw new Error("Stopped: Docker must use a running local Unix socket.");
  }
  if (docker(["inspect", DB, "--format", "{{.State.Running}}"]) !== "true") {
    throw new Error("The existing local Supabase database must already be running.");
  }
  const ports = JSON.parse(docker(["inspect", DB, "--format", "{{json .NetworkSettings.Ports}}"])) as
    Record<string, { HostPort: string; HostIp: string }[] | null>;
  if (!ports["5432/tcp"]?.some((p) => p.HostPort === "54322"
    && ["127.0.0.1", "0.0.0.0", "::1", "::"].includes(p.HostIp))) {
    throw new Error("Stopped: the local database port does not match this project's configuration.");
  }
  if (sql("select inet_server_addr() is null;") !== "t"
    || sql("select exists(select 1 from supabase_migrations.schema_migrations where version = '20260918120000');") !== "t") {
    throw new Error("Stopped: require the local container socket and applied M22 migration before fixtures.");
  }
  targetVerified = true;
}

/** Collision protection precedes every cleanup; never delete a different user at a fixture ID. */
function cleanup() {
  if (!targetVerified) return;
  const expectedUsers = CASES.flatMap((c) => [
    `('${c.trainerId}'::uuid, '${c.trainerEmail}')`, `('${c.ownerId}'::uuid, '${c.ownerEmail}')`,
  ]).join(",");
  sql(`begin;
    do $$ begin
      if exists (select 1 from auth.users u join (values ${expectedUsers}) as f(id,email) on u.id=f.id where u.email is distinct from f.email) then
        raise exception 'Fixture ID collision: cleanup refused';
      end if;
      if exists (select 1 from public.bookings where (trainer_id in (${trainerIds}) or owner_id in (${ownerIds}))
        and not (trainer_id in (${trainerIds}) and owner_id in (${ownerIds}))) then
        raise exception 'Unrelated booking references a fixture: cleanup refused';
      end if;
      if exists (select 1 from public.message_threads where (trainer_id in (${trainerIds}) or owner_id in (${ownerIds}))
        and not (trainer_id in (${trainerIds}) and owner_id in (${ownerIds}))) then
        raise exception 'Unrelated conversation references a fixture: cleanup refused';
      end if;
    end $$;
    delete from public.message_threads where trainer_id in (${trainerIds}) and owner_id in (${ownerIds});
    delete from public.bookings where trainer_id in (${trainerIds}) and owner_id in (${ownerIds});
    delete from public.dogs where owner_id in (${ownerIds});
    delete from public.analytics_events where user_id in (${userIds});
    delete from auth.users where id in (${userIds});
    commit;`);
}

function seedAccounts() {
  const inserts = CASES.flatMap((c) => [
    { id: c.trainerId, email: c.trainerEmail, role: "trainer", name: c.name },
    { id: c.ownerId, email: c.ownerEmail, role: "owner", name: `International ${c.country} Test Owner` },
  ]).map((u) => `insert into auth.users
    (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,
     raw_app_meta_data,raw_user_meta_data,is_super_admin,confirmation_token,email_change,email_change_token_new,recovery_token)
    values ('00000000-0000-0000-0000-000000000000','${u.id}','authenticated','authenticated','${u.email}',
      extensions.crypt('${PASSWORD}',extensions.gen_salt('bf')),now(),now(),now(),
      '{"provider":"email","providers":["email"]}','{"role":"${u.role}"}',false,'','','','');
    update public.profiles set display_name='${u.name}' where id='${u.id}';`).join("\n");
  sql(`begin; ${inserts}
    ${CASES.map((c) => `insert into public.dogs(id,owner_id,name) values ('${c.dogId}','${c.ownerId}','International ${c.country} Test Dog');`).join("\n")}
    commit;`);
}

async function signIn(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await submitLogin(page, email);
  await expect(page).toHaveURL((url) => url.pathname === next);
}

async function submitLogin(page: Page, email: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

/** Two trainer-local calendar days ahead avoids UTC-midnight and lead-time races. */
function bookingDate(zone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day") + 2)).toISOString().slice(0, 10);
}

function bookingSnapshot(c: CountryCase) {
  return JSON.parse(sql(`select row_to_json(b) from (
    select id, service_id, price_cents, currency, status, starts_at from public.bookings
    where owner_id='${c.ownerId}' and trainer_id='${c.trainerId}'
  ) b;`)) as { id: string; service_id: string; price_cents: number; currency: string; status: string; starts_at: string };
}

test.describe.configure({ mode: "default" });
test.beforeAll(({ baseURL }, info) => {
  if (info.config.workers !== 1 || info.project.repeatEach !== 1) {
    throw new Error("Run this deterministic fixture spec with --workers=1 and --repeat-each=1.");
  }
  verifyTarget(baseURL);
  cleanup();
  seedAccounts();
});
test.afterAll(cleanup);

for (const c of CASES) {
  test(`${c.country}: onboard, find anonymously, book in ${c.currency}, preserve the original price`, async ({ page, browser, baseURL }) => {
    test.setTimeout(120_000);
    const price = new RegExp(`${c.currency}\\s+62\\.50`);
    const updatedPrice = new RegExp(`${c.currency}\\s+87\\.25`);
    await signIn(page, c.trainerEmail, "/trainer/onboarding");
    async function fillListingFields() {
      await page.getByLabel("Your name", { exact: true }).fill(c.name);
      await page.getByLabel("About you", { exact: true }).fill("Local test trainer helping dogs and owners learn Barn Hunt together.");
      await page.getByRole("checkbox", { name: "Barn Hunt", exact: true }).check();
      await page.getByLabel("How far will you travel?").selectOption("25");
    }
    await expect(page.getByLabel("Country", { exact: true }).locator("option")).toHaveText(["United States", "Canada", "United Kingdom"]);
    await page.getByLabel("Country", { exact: true }).selectOption(c.country);
    await page.getByLabel("Your timezone", { exact: true }).selectOption(c.zone);
    // Foreign-country ZIP and invalid full suffix must not silently become a valid prefix.
    for (const invalid of ["37203", `${c.area} !!!`]) {
      await fillListingFields();
      await page.getByLabel(c.postalLabel, { exact: true }).fill(invalid);
      await page.getByRole("button", { name: "Create listing", exact: true }).click();
      await expect(page.getByRole("button", { name: "Create listing", exact: true })).toBeEnabled();
      await expect(page.getByRole("alert").filter({
        hasText: `Enter a valid ${c.postalLabel.toLowerCase()} for ${c.countryName}.`,
      })).toBeVisible();
      expect(sql(`select count(*) from public.trainers where id='${c.trainerId}';`)).toBe("0");
    }
    await fillListingFields();
    await page.getByLabel(c.postalLabel, { exact: true }).fill(c.fullPostal);
    await page.getByRole("button", { name: "Create listing", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/trainer/listing");
    expect(sql(`select country_code || '|' || postal_area || '|' || timezone from public.trainers where id='${c.trainerId}';`))
      .toBe(`${c.country}|${c.area}|${c.zone}`);

    await page.goto("/trainer/services");
    await page.getByLabel("Service name", { exact: true }).fill(c.service);
    await page.getByLabel(`Price (${c.currency})`, { exact: true }).fill("62.50");
    await page.getByLabel("Minutes", { exact: true }).fill("60");
    await page.getByLabel("Where", { exact: true }).selectOption("in_home");
    await page.getByRole("button", { name: "Add service", exact: true }).click();
    await expect(page.getByText(price)).toBeVisible();
    const serviceId = sql(`select id from public.trainer_services where trainer_id='${c.trainerId}' and deleted_at is null;`);
    expect(serviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sql(`select currency || '|' || price_cents from public.trainer_services where id='${serviceId}';`)).toBe(`${c.currency}|6250`);

    const localDate = bookingDate(c.zone);
    sql(`insert into public.trainer_availability_exceptions(id,trainer_id,exception_date,is_blocked,start_time,end_time)
      values ('${c.availabilityId}','${c.trainerId}','${localDate}',false,'09:00','10:00');`);
    // Separate fresh context proves discovery works without an owner account/session.
    const visitor = await browser.newContext({ baseURL });
    try {
      const owner = await visitor.newPage();
      await owner.goto("/trainers");
      await owner.getByLabel("Country", { exact: true }).selectOption(c.country);
      await owner.getByRole("button", { name: "Search", exact: true }).click();
      await expect(owner).toHaveURL((url) => url.pathname === "/trainers" && url.search === `?country=${c.country}`);
      await expect(owner.getByRole("link", { name: c.name, exact: true })).toBeVisible();
      for (const other of CASES.filter((item) => item.country !== c.country)) {
        await expect(owner.getByRole("link", { name: other.name, exact: true })).toHaveCount(0);
      }
      await expect(owner.getByLabel("Within", { exact: true }).locator('option[value="25"]')).toHaveText(c.radiusLabel);
      await owner.locator('input[name="zip"]').fill(`${c.area} !!!`);
      await owner.getByRole("button", { name: "Search", exact: true }).click();
      await expect(owner.getByText(`We couldn't find that ${c.postalLabel.toLowerCase()} in ${c.countryName}`, { exact: false })).toBeVisible();
      await expect(owner.getByRole("link", { name: c.name, exact: true })).toHaveCount(0);
      await owner.locator('input[name="zip"]').fill(c.fullPostal);
      await owner.getByRole("button", { name: "Search", exact: true }).click();
      await expect(owner).toHaveURL((url) => url.pathname === "/trainers"
        && url.search === `?country=${c.country}&zip=${c.area}&radius=25`);
      await expect(owner.locator('input[name="zip"]')).toHaveValue(c.area);
      await owner.getByRole("link", { name: c.name, exact: true }).click();
      await expect(owner.getByText(price)).toBeVisible();
      const profilePath = `/trainers/${c.trainerId}`;
      const bookPath = `${profilePath}/book`;
      await owner.getByRole("link", { name: "Log in to message", exact: true }).first().click();
      await expect(owner).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("next") === profilePath);
      expect(sql(`select count(*) from public.message_threads where trainer_id='${c.trainerId}';`)).toBe("0");
      await owner.goto(profilePath);
      await owner.getByRole("link", { name: "Book a session", exact: true }).click();
      await expect(owner).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("next") === bookPath);
      // Direct entry must enforce the same guard, not just the visible link.
      await owner.goto(bookPath);
      await expect(owner).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("next") === bookPath);
      await submitLogin(owner, c.ownerEmail);
      await expect(owner).toHaveURL((url) => url.pathname === bookPath);
      await owner.getByLabel("Which dog?", { exact: true }).selectOption(c.dogId);
      await expect(owner.getByLabel("Which service?", { exact: true }).locator(`option[value="${serviceId}"]`)).toContainText(price);
      const slot = owner.getByRole("radio", { name: "9:00 AM", exact: true });
      await expect(slot).toHaveCount(1);
      const startUtc = await slot.inputValue();
      const localStart = new Intl.DateTimeFormat("en-CA", {
        timeZone: c.zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).format(new Date(startUtc));
      expect(localStart).toContain(localDate);
      expect(localStart).toContain("09:00");
      await slot.check();
      await owner.getByRole("button", { name: "Request booking", exact: true }).click();
      await expect(owner).toHaveURL((url) => url.pathname === "/owner/bookings" && url.searchParams.has("requested"));
      await expect(owner.getByText("Request sent", { exact: true })).toBeVisible();
      await expect(owner.getByText(price)).toBeVisible();
      const before = bookingSnapshot(c);
      expect(before).toMatchObject({ service_id: serviceId, price_cents: 6250, currency: c.currency, status: "PENDING" });
      expect(new Date(before.starts_at).toISOString()).toBe(startUtc);
      expect(new URL(owner.url()).searchParams.get("requested")).toBe(before.id);

      await page.getByRole("button", { name: "Edit", exact: true }).click();
      const edit = page.locator("form").filter({ has: page.locator(`input[name="serviceId"][value="${serviceId}"]`) });
      await edit.getByLabel(`Price (${c.currency})`, { exact: true }).fill("87.25");
      await edit.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(page.getByText(updatedPrice)).toBeVisible();
      expect(sql(`select currency || '|' || price_cents from public.trainer_services where id='${serviceId}';`)).toBe(`${c.currency}|8725`);
      await owner.reload();
      await expect(owner.getByText(price)).toBeVisible();
      await expect(owner.getByText(updatedPrice)).toHaveCount(0);
      expect(bookingSnapshot(c)).toEqual(before);
      await page.goto("/trainer/bookings");
      await expect(page.getByText(price)).toBeVisible();
    } finally {
      await visitor.close();
    }
  });
}
