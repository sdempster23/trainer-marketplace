/**
 * Magic-byte sniffing for uploaded images — the byte-level half of the M18
 * defense table (investigation §3). The bucket's allowed_mime_types validates
 * only the DECLARED Content-Type header; this function is what makes "never
 * trust the extension (or the header)" true. It runs in the commit action
 * BEFORE any pointer (profiles.avatar_url / gallery row) is written — an
 * object that fails here is deleted and never referenced.
 *
 * Exactly the three formats the buckets accept. Anything else — including a
 * valid GIF or SVG — returns null and is rejected: the accept list is pinned
 * by ruling 3 (SVG is a script container; these are public buckets).
 */
export type SniffedImageType = "image/jpeg" | "image/png" | "image/webp";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: the full 8-byte signature
  if (bytes.length >= 8 && PNG_SIG.every((b, i) => bytes[i] === b)) {
    return "image/png";
  }
  // WebP: 'RIFF' <size> 'WEBP' — bytes 8-11 matter; 'RIFF' alone is any
  // RIFF container (WAV, AVI), not an image.
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}
