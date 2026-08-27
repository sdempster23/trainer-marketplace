/**
 * Seed local storage + rows with REAL photos so the marketing re-capture
 * shows the avatar and gallery features (dev-only; local stack only).
 *
 * Truthful-imagery contract (docs/design/arc-notes.md): captures must be
 * actual screens of the real app, so the photos in them must be real photos
 * too — not placeholder rectangles. Source: the project's own licensed
 * marketing images in public/marketing/ (working dogs and handlers, exactly
 * the right subject).
 *
 * DB writes go through psql, NOT PostgREST: service_role deliberately holds
 * no grants on these tables (the M14 contract), so the API path is blocked
 * by design. Storage writes must use the HTTP API — SQL cannot create
 * objects (M18: the backing files live outside the database).
 *
 * Usage: node scripts/seed-capture-images.mjs
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const API = "http://127.0.0.1:54321";
const DB = "supabase_db_trainer-marketplace";
const MARKETING = "public/marketing";

const SERVICE_KEY = JSON.parse(
  execSync("supabase status -o json", { encoding: "utf8" }),
).SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  throw new Error("No local service key — is `supabase start` running?");
}

/**
 * Run SQL as postgres inside the local db container. The query is collapsed
 * to one line: psql -c treats a literal \n in its argument as an invalid
 * meta-command, so multi-line template strings must be flattened first.
 */
function psql(query) {
  const oneLine = query.replace(/\s+/g, " ").trim();
  const out = execSync(
    `docker exec -i ${DB} psql -U postgres -d postgres -At -c ${JSON.stringify(oneLine)}`,
    { encoding: "utf8" },
  );
  // Drop psql's command tag ("INSERT 0 1"), which rides on stdout after a
  // RETURNING value and would otherwise be concatenated into it.
  return out
    .split("\n")
    .filter((line) => !/^(INSERT|UPDATE|DELETE|SELECT|COPY) \d/.test(line))
    .join("\n")
    .trim();
}

async function upload(bucket, objectName, filePath, contentType) {
  const body = readFileSync(filePath);
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": contentType,
  };
  // Delete-then-create makes a re-run idempotent. (x-upsert did NOT survive
  // the local gateway — a repeat POST still came back 409 KeyAlreadyExists,
  // observed in the storage container log — so don't reintroduce it here.)
  const url = `${API}/storage/v1/object/${bucket}/${objectName}`;
  await fetch(url, { method: "DELETE", headers }).catch(() => {});
  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) {
    throw new Error(`upload ${objectName} failed: ${await res.text()}`);
  }
}

// The capture subject: a listable trainer (the directory card and the
// profile page must be the same person), preferring one with services so
// the profile shot isn't half empty states.
const trainerId = psql(`
  select t.id from public.trainers t
  join public.profiles p on p.id = t.id
  left join public.trainer_services s on s.trainer_id = t.id and s.deleted_at is null
  where p.display_name is not null and t.service_point is not null
  group by t.id
  order by count(s.id) desc, t.id
  limit 1`);
if (!trainerId) {
  throw new Error("No listable trainer locally — run `supabase db reset` first.");
}
const name = psql(`select display_name from public.profiles where id = '${trainerId}'`);
console.log(`subject trainer: ${name} (${trainerId})`);

// 1. Avatar — a handler portrait at the M18 exact path.
await upload("avatars", `${trainerId}/avatar`, `${MARKETING}/community-sport-bite.jpg`, "image/jpeg");
psql(
  `update public.profiles set avatar_url = '${trainerId}/avatar?v=${Date.now()}' where id = '${trainerId}'`,
);
console.log("avatar: object uploaded + pointer committed");

// 2. Gallery — three working shots in slots 1..3.
const already = psql(
  `select count(*) from public.trainer_gallery_photos where trainer_id = '${trainerId}'`,
);
if (already === "0") {
  const sources = [
    // Deliberately NOT community-sport-bite.jpg — that one is the avatar,
    // and the same photo in both places reads as a bug.
    `${MARKETING}/community-sport-jump.jpg`,
    `${MARKETING}/transformation.jpg`,
    `${MARKETING}/hero-field.jpg`,
  ];
  const values = [];
  for (const [i, src] of sources.entries()) {
    const fileName = randomUUID();
    await upload("trainer-gallery", `${trainerId}/${fileName}`, src, "image/jpeg");
    values.push(`('${trainerId}', '${fileName}', ${i + 1})`);
  }
  psql(
    `insert into public.trainer_gallery_photos (trainer_id, file_name, position) values ${values.join(",")}`,
  );
  console.log(`gallery: ${values.length} photos uploaded + rows inserted`);
} else {
  console.log(`gallery: ${already} photos already present, left alone`);
}

console.log(`\nCAPTURE_TRAINER_ID=${trainerId}`);

// ---------------------------------------------------------------------------
// 3. A real message thread for the conversation shot.
// ---------------------------------------------------------------------------
// Created through the DB rather than the UI because the capture needs a
// specific, repeatable exchange. The MESSAGES are the point of the shot
// (alt text: "An owner and trainer messaging about puppy training
// sessions"), so they read like a real first contact, not lorem.
const CAPTURE_OWNER_EMAIL = "capture-owner@pawmatch.local";
const CAPTURE_OWNER_PASSWORD = "capture-shoot-2026";

let ownerId = psql(
  `select id from auth.users where email = '${CAPTURE_OWNER_EMAIL}'`,
);
if (!ownerId) {
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: CAPTURE_OWNER_EMAIL,
      password: CAPTURE_OWNER_PASSWORD,
      email_confirm: true,
      user_metadata: { role: "owner" },
    }),
  });
  if (!res.ok) throw new Error(`owner create failed: ${await res.text()}`);
  ownerId = (await res.json()).id;
  psql(
    `update public.profiles set display_name = 'Jess Carter' where id = '${ownerId}'`,
  );
  console.log(`capture owner created: ${ownerId}`);
}

// Get-or-create the thread, then seed messages only if it has none — the
// two steps are checked separately so a half-finished run self-heals.
let threadId = psql(
  `select id from public.message_threads where owner_id = '${ownerId}' and trainer_id = '${trainerId}'`,
);
if (!threadId) {
  threadId = psql(
    `insert into public.message_threads (owner_id, trainer_id) values ('${ownerId}', '${trainerId}') returning id`,
  );
  console.log(`capture thread created: ${threadId}`);
}

const messageCount = psql(
  `select count(*) from public.messages where thread_id = '${threadId}'`,
);
if (messageCount === "0") {
  const exchange = [
    [ownerId, "Hi! I have a 5-month-old shepherd mix — pulling hard on the leash and jumping on guests. Do you work with puppies this age?"],
    [trainerId, "That age is a great time to start. Loose-leash and impulse control are the two things I'd focus on first."],
    [ownerId, "That's exactly what we need. Are Saturday mornings possible?"],
    [trainerId, "Saturdays work — I keep 9am and 11am open for puppy sessions. Happy to do the first one at your place so I can see the door-greeting behavior."],
  ];
  for (const [sender, body] of exchange) {
    // Escape for a SQL string literal: double any single quote.
    const literal = body.replace(/'/g, "''");
    // Insert AS THE SENDER: M8's messages_validate_insert trigger enforces
    // sender_id = auth.uid() (no third-party authorship), so a plain
    // postgres insert is rejected — correctly. Setting the JWT claim inside
    // a transaction is the same path the app takes, which is what makes
    // this seed honest rather than a bypass.
    psql(`
      begin;
      select set_config('request.jwt.claims', '{"sub":"${sender}","role":"authenticated"}', true);
      set local role authenticated;
      insert into public.messages (thread_id, sender_id, body)
        values ('${threadId}', '${sender}', '${literal}');
      commit;
    `);
  }
  console.log(`capture thread seeded: ${exchange.length} messages`);
}

console.log(`CAPTURE_OWNER_EMAIL=${CAPTURE_OWNER_EMAIL}`);
console.log(`CAPTURE_OWNER_PASSWORD=${CAPTURE_OWNER_PASSWORD}`);

// ---------------------------------------------------------------------------
// 4. Services for the capture subject.
// ---------------------------------------------------------------------------
// seed.sql creates no services, but the profile shot's caption promises
// "services with real prices" — the page must actually have them or the
// capture would illustrate a claim the screen doesn't support.
const serviceCount = psql(
  `select count(*) from public.trainer_services where trainer_id = '${trainerId}' and deleted_at is null`,
);
if (serviceCount === "0") {
  psql(`
    insert into public.trainer_services
      (trainer_id, name, session_type, price_cents, duration_minutes)
    values
      ('${trainerId}', 'Foundation session', 'in_home', 12000, 60),
      ('${trainerId}', 'Protection sport intro', 'at_trainer_location', 15000, 90),
      ('${trainerId}', 'Decoy work (club)', 'at_trainer_location', 18000, 120)
  `);
  console.log("services: 3 inserted for the capture subject");
}
