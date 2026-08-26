/**
 * Browser-side avatar re-encode — the transform-on-upload half of the
 * investigation §4 pipeline. Runs BEFORE any byte leaves the device:
 *
 *   * downscales to a 512×512 cover-crop (a 12MB phone photo becomes tens
 *     of KB — small enough to upload on anything);
 *   * re-encodes to WebP (JPEG on encoders without WebP support), which
 *     STRIPS ALL METADATA — including EXIF GPS. A raw phone photo taken at
 *     home carries home coordinates; a canvas re-encode cannot (the privacy
 *     line the policy now states);
 *   * normalizes whatever arrived (HEIC transcoded by iOS, odd formats)
 *     into exactly what the bucket accepts.
 *
 * This is UX + privacy, NOT security — it runs on the client and a hostile
 * client skips it. The server-side magic-byte sniff in commitAvatar is the
 * trust boundary (see the M18 defense table).
 *
 * Browser-API module: import from client components only.
 */

export const AVATAR_SIZE_PX = 512;
const ENCODE_QUALITY = 0.85;
/** Refuse to even decode absurd inputs (decompression-bomb courtesy cap). */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export type EncodedAvatar = {
  blob: Blob;
  contentType: "image/webp" | "image/jpeg";
};

/**
 * Decode via HTMLImageElement (EXIF orientation is applied at draw time in
 * every current browser — the bitmap path's imageOrientation option is
 * flakier across Safari versions), cover-crop square, re-encode.
 */
export async function encodeAvatar(file: File): Promise<EncodedAvatar> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("That photo is too large. Try one under 25MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = objectUrl;
    try {
      await image.decode();
    } catch {
      throw new Error("We couldn't read that file as an image.");
    }

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (side === 0) {
      throw new Error("We couldn't read that file as an image.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE_PX;
    canvas.height = AVATAR_SIZE_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Your browser couldn't process the image.");
    }
    // Center cover-crop: the largest centered square of the source.
    ctx.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE_PX,
      AVATAR_SIZE_PX,
    );

    const webp = await toBlob(canvas, "image/webp");
    // Browsers without a WebP ENCODER return a blob of a different type (or
    // null) — fall back to JPEG, which every canvas can produce. Both are on
    // the bucket accept list.
    if (webp && webp.type === "image/webp") {
      return { blob: webp, contentType: "image/webp" };
    }
    const jpeg = await toBlob(canvas, "image/jpeg");
    if (jpeg && jpeg.type === "image/jpeg") {
      return { blob: jpeg, contentType: "image/jpeg" };
    }
    throw new Error("Your browser couldn't process the image.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, ENCODE_QUALITY));
}
