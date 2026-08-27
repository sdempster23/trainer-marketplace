import Image from "next/image";

import { avatarInitials, publicAvatarUrl } from "@/lib/images/avatar";

/**
 * The one avatar renderer — directory card, detail header, thread header,
 * and the /account editor preview all use this so the image-or-initials
 * fallback can never drift between surfaces.
 *
 * profileId is REQUIRED and must come from the row the caller joined (the
 * trainer id, the counterparty id, the session's sub) — publicAvatarUrl
 * validates the stored path against it and refuses to render anything that
 * isn't this profile's own object (the column is user-writable; see
 * lib/images/avatar.ts). A stored value that fails validation falls back
 * to initials exactly like a null column.
 *
 * No-avatar state is an INITIALS TILE on the graphite system (gate ruling:
 * honest, never confusable with a photo, zero image weight). When there are
 * no initials either (RLS-hidden counterparty → null name), render NOTHING —
 * a blank disc would read as a broken image, and the text fallback ("A
 * trainer") carries the identity alone.
 *
 * Fixed square via explicit width/height (CLS 0 stays the bar); callers pass
 * `size` in px. next/image optimizes the storage URL (the Vercel-optimizer
 * lane priced in the investigation §4); `sizes` matches the rendered size so
 * the optimizer serves the small variant, not the 512px source.
 */
export function Avatar({
  profileId,
  avatarPath,
  displayName,
  size,
  className = "",
}: {
  /** The profile's id from the joined row — never from user-writable data. */
  profileId: string;
  /** The stored profiles.avatar_url value ('{uid}/avatar?v=…'), or null. */
  avatarPath: string | null;
  displayName: string | null;
  size: number;
  className?: string;
}) {
  const url = avatarPath ? publicAvatarUrl(profileId, avatarPath) : null;
  if (url) {
    return (
      <Image
        src={url}
        alt={displayName ? `Photo of ${displayName}` : "Profile photo"}
        width={size}
        height={size}
        sizes={`${size}px`}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const initials = avatarInitials(displayName);
  if (initials === "") {
    return null;
  }
  return (
    <span
      aria-hidden="true"
      className={`bg-primary text-primary-foreground font-display flex shrink-0 select-none items-center justify-center rounded-full font-semibold ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </span>
  );
}
