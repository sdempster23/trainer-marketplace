/**
 * Marketing re-capture — the repeatable version of a process that used to
 * be ad-hoc ("recapture at the same viewport and replace the file").
 *
 * Truthful-imagery contract (docs/design/arc-notes.md, lib/marketing/
 * ui-shots.ts): every asset here is an ACTUAL screen of the running app
 * against local seed data, never a mockup. Run scripts/seed-capture-images.mjs
 * first — it puts a real avatar, a real gallery, and a real conversation in
 * the local database so the captures show the features that now exist.
 *
 * Prerequisites: `pnpm build && pnpm start` on :3000, local Supabase up.
 * Usage: node scripts/capture-marketing.mjs
 */
import { execSync } from "node:child_process";
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const OUT = "public/marketing/ui";
const DB = "supabase_db_trainer-marketplace";

// Device screens: 390x844 at 2x — the viewport the existing shots used, so
// replacements drop in at the same aspect ratio and the device frames on the
// homepage don't shift.
const PHONE = { width: 390, height: 844 };
const SCALE = 2;

const OWNER_EMAIL = "capture-owner@pawmatch.local";
const OWNER_PASSWORD = "capture-shoot-2026";

function psql(query) {
  return execSync(
    `docker exec -i ${DB} psql -U postgres -d postgres -At -c ${JSON.stringify(query.replace(/\s+/g, " ").trim())}`,
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((l) => !/^(INSERT|UPDATE|DELETE|SELECT|COPY) \d/.test(l))
    .join("\n")
    .trim();
}

const trainerId = psql(
  `select trainer_id from public.trainer_gallery_photos order by position limit 1`,
);
const threadId = psql(
  `select t.id from public.message_threads t join auth.users u on u.id = t.owner_id where u.email = '${OWNER_EMAIL}'`,
);
if (!trainerId || !threadId) {
  throw new Error("Seed data missing — run scripts/seed-capture-images.mjs first.");
}

const browser = await chromium.launch();

async function phoneShot(page, path, file, prepare) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  if (prepare) await prepare(page);
  // Let lazy images inside the viewport settle before the shutter.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${file}` });
  console.log(`captured ${file}  (${path})`);
}

// ---------------------------------------------------------------------------
// 1-2. Public screens (no auth): directory + profile.
// ---------------------------------------------------------------------------
const publicCtx = await browser.newContext({
  viewport: PHONE,
  deviceScaleFactor: SCALE,
});
const publicPage = await publicCtx.newPage();
await phoneShot(publicPage, "/trainers", "ui-directory.png");
// No scroll: at 390x844 the top of the profile now carries the whole story
// the caption promises — avatar, name, bio, and the first row of photos.
await phoneShot(publicPage, `/trainers/${trainerId}`, "ui-profile.png");
await publicCtx.close();

// ---------------------------------------------------------------------------
// 3. The conversation (authenticated as the owner).
// ---------------------------------------------------------------------------
const ownerCtx = await browser.newContext({
  viewport: PHONE,
  deviceScaleFactor: SCALE,
});
const ownerPage = await ownerCtx.newPage();
await ownerPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await ownerPage.fill('input[name="email"]', OWNER_EMAIL);
await ownerPage.fill('input[name="password"]', OWNER_PASSWORD);
await ownerPage.click('button[type="submit"]');
await ownerPage.waitForURL(/\/(account|welcome)/, { timeout: 15000 });
await phoneShot(ownerPage, `/messages/${threadId}`, "ui-thread.png");

// The proof crop: the message exchange itself. The bubbles are plain divs
// with no stable hook, so the clip is computed from the first and last
// bubble's bounding boxes rather than guessed at.
const clip = await ownerPage.evaluate(() => {
  const bubbles = Array.from(document.querySelectorAll("main div")).filter(
    (el) =>
      el.className.includes("rounded-lg") &&
      el.className.includes("max-w-[80%]"),
  );
  if (bubbles.length === 0) return null;
  const boxes = bubbles.map((el) => el.getBoundingClientRect());
  const top = Math.min(...boxes.map((b) => b.top));
  const bottom = Math.max(...boxes.map((b) => b.bottom));
  return {
    x: 16,
    y: Math.max(0, top - 12),
    width: window.innerWidth - 32,
    height: Math.min(bottom - top + 24, window.innerHeight - top),
  };
});
if (!clip) {
  throw new Error("Could not locate message bubbles for the thread crop.");
}
await ownerPage.screenshot({ path: `${OUT}/crops/crop-thread.png`, clip });
console.log("captured crops/crop-thread.png");
await ownerCtx.close();

// ---------------------------------------------------------------------------
// 4. The search demo video — the same recorded flow as before, at 1280x800.
// ---------------------------------------------------------------------------
// VP8 WebM: still no H.264 encoder available (system ffmpeg absent), which
// is the standing constraint recorded in arc-notes. Poster frame is a
// still from the same flow.
const videoCtx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: "/tmp/pawmatch-capture", size: { width: 1280, height: 800 } },
});
const videoPage = await videoCtx.newPage();
await videoPage.goto(`${BASE}/trainers`, { waitUntil: "networkidle" });
await videoPage.waitForTimeout(900);
await videoPage.fill('input[name="zip"]', "37203");
await videoPage.waitForTimeout(500);
// ZIP only — no specialty checkbox. The old flow filtered on "Puppy",
// which returns NOTHING against the current roster (protection-sport
// heavy), so the demo ended on an empty state and the closing click had
// no card to land on. Proximity search alone tells the same story and
// ends on the subject's profile, which is where the new photos are.
await videoPage.getByRole("button", { name: /search/i }).first().click();
await videoPage.waitForLoadState("networkidle");
await videoPage.waitForTimeout(1200);
// The poster frame: the results, mid-flow.
await videoPage.screenshot({ path: `${OUT}/search-demo-poster.jpg`, quality: 88, type: "jpeg" });
console.log("captured search-demo-poster.jpg");
const subjectCard = videoPage.locator(`a[href="/trainers/${trainerId}"]`).first();
await subjectCard.scrollIntoViewIfNeeded();
await subjectCard.click();
await videoPage.waitForLoadState("networkidle");
await videoPage.waitForTimeout(1500);
await videoPage.evaluate(() => window.scrollTo({ top: 300, behavior: "smooth" }));
await videoPage.waitForTimeout(1600);
const video = videoPage.video();
await videoCtx.close();
if (video) {
  await video.saveAs(`${OUT}/search-demo.webm`);
  console.log("captured search-demo.webm");
}

await browser.close();
console.log("\nAll assets written to public/marketing/ui/");
