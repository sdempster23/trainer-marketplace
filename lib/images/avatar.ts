/**
 * Avatar path + display helpers, shared by server renders and the client
 * editor (deliberately isomorphic — no "server-only").
 *
 * STORAGE CONTRACT (M18): each user owns exactly ONE avatar object at the
 * fixed path '{uid}/avatar' in the public `avatars` bucket — the RLS
 * policies enforce the exact name, so replace is an upsert and orphans are
 * impossible. profiles.avatar_url stores '{uid}/avatar?v=<epoch>': the path
 * PLUS a cache-buster, because the public-object URL is CDN-cached and an
 * upsert under the same name would otherwise serve the stale image
 * indefinitely. The `?v=` changes on every commit; resolution to a full URL
 * happens here in app code, never in the database (the dogs.photo_url
 * precedent: "path resolution lives in app code").
 *
 * RENDER MUST NOT TRUST THE COLUMN (review finding, avatar commit): the
 * profiles UPDATE grant is table-level and the update trigger freezes only
 * `role`, so any user can write ANY string into their own avatar_url via
 * PostgREST directly — bypassing commitAvatar entirely. A concatenating
 * URL builder would let them render a VICTIM's photo (or any public-bucket
 * object, via '../') as their own. So publicAvatarUrl PARSES the stored
 * value and rebuilds the URL from trusted parts only: the caller-supplied
 * profile id (from the row we joined, never from the column) and the
 * digits-only version. A stored value that isn't exactly this profile's
 * own '{their-uid}/avatar?v=<digits>' renders as NO avatar, not as a URL.
 */

export const AVATARS_BUCKET = "avatars";

/** The one legal object name for a user's avatar (the M18 exact-path law). */
export function avatarObjectName(userId: string): string {
  return `${userId}/avatar`;
}

/** The value written to profiles.avatar_url on commit: path + cache-buster. */
export function avatarStoredPath(userId: string, versionEpochMs: number): string {
  return `${avatarObjectName(userId)}?v=${versionEpochMs}`;
}

const STORED_PATH_RE = /^([0-9a-fA-F-]{36})\/avatar\?v=(\d+)$/;

/**
 * Full public URL for a stored avatar_url value — or null when the stored
 * value is not this profile's own well-formed path (see header). Null means
 * "render the initials tile", exactly like a null column.
 */
export function publicAvatarUrl(
  profileId: string,
  storedPath: string,
): string | null {
  const match = STORED_PATH_RE.exec(storedPath);
  if (!match || match[1] !== profileId) {
    return null;
  }
  // Missing env degrades to the initials tile like every other invalid
  // input here — throwing would 500 a page that next.config.ts explicitly
  // says must still render without the var (and the gallery sibling
  // behaves the same way).
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    return null;
  }
  // Rebuilt from trusted parts — the stored string itself never reaches the
  // URL (match[2] is digits-only by the regex).
  return `${base}/storage/v1/object/public/${AVATARS_BUCKET}/${profileId}/avatar?v=${match[2]}`;
}

/**
 * Initials for the no-avatar tile: first character of the first two words,
 * uppercased. Code-POINT aware ([...word], not word[0]) so a name starting
 * with an emoji or non-BMP character yields the character, not a broken
 * surrogate half. Honest by construction — initials on the graphite system
 * are never confusable with a real photo.
 */
export function avatarInitials(displayName: string | null): string {
  if (!displayName) {
    return "";
  }
  return displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]!.toUpperCase())
    .join("");
}
