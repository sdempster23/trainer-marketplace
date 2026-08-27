/**
 * Gallery path + URL helpers, shared by server renders and the client
 * manager (isomorphic, like the avatar sibling).
 *
 * STORAGE CONTRACT (M18 bucket + M19 table): the DB row owns order and the
 * cap; storage owns bytes. A row stores the trainer_id and a `file_name`
 * that is a lowercase uuid (DB CHECK-pinned) — never a full path. Readers
 * rebuild '{trainer_id}/{file_name}'.
 *
 * UNTRUSTED AT EVERY READ SITE (CLAUDE.md, added after the avatar finding —
 * and this table has N rows per trainer, so the rule applies N times over):
 * `trainer_gallery_photos` carries a table-level UPDATE grant for
 * authenticated, so a trainer can PATCH their own row's file_name directly
 * via PostgREST. The DB CHECK already refuses anything but a uuid; this
 * function refuses it AGAIN at render and rebuilds the URL from validated
 * parts only, so a hostile or legacy value renders as NO photo rather than
 * as a URL into someone else's folder.
 */

/** Must equal the DB CHECK (position between 1 and 8) — asserted in tests. */
export const GALLERY_MAX_PHOTOS = 8;

export const GALLERY_BUCKET = "trainer-gallery";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The object's full name in the bucket: '{trainerId}/{fileName}'. */
export function galleryObjectName(trainerId: string, fileName: string): string {
  return `${trainerId}/${fileName}`;
}

/**
 * A v4 uuid for a new gallery object's name.
 *
 * crypto.randomUUID() is SECURE-CONTEXT ONLY — undefined on plain http://
 * origins other than localhost, which is exactly how Shane tests on a phone
 * against `next dev` (http://192.168.x.x:3000). Without the fallback the
 * upload throws "crypto.randomUUID is not a function" at the user. The
 * fallback uses getRandomValues (available on http) and only formats the
 * bits; the name is a collision-avoidance token, not a secret — a row is
 * still gated by RLS and the DB's uuid CHECK.
 */
export function newGalleryFileName(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Public URL for one gallery row — or null when either identifier fails
 * validation. Null means "skip this photo", the same as no row.
 */
export function publicGalleryUrl(
  trainerId: string,
  fileName: string,
): string | null {
  if (!UUID_RE.test(trainerId) || !UUID_RE.test(fileName)) {
    return null;
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    return null;
  }
  return `${base}/storage/v1/object/public/${GALLERY_BUCKET}/${trainerId}/${fileName}`;
}
