/**
 * Browser-side image re-encode — the transform-on-upload half of the
 * investigation §4 pipeline. Runs BEFORE any byte leaves the device:
 *
 *   * downscales (avatar: 512×512 cover-crop; gallery: long edge ≤1600px,
 *     aspect preserved) so a 12MB phone photo becomes tens of KB;
 *   * re-encodes to WebP (JPEG on encoders without WebP support), which
 *     STRIPS ALL METADATA — including EXIF GPS. A raw phone photo taken at
 *     home carries home coordinates; a canvas re-encode cannot (the privacy
 *     line the policy states, scoped there to the in-app path);
 *   * normalizes whatever arrived (HEIC transcoded by iOS, odd formats)
 *     into exactly what the buckets accept.
 *
 * This is UX + privacy, NOT security — it runs on the client and a hostile
 * client skips it. The server-side magic-byte sniff in the commit actions is
 * the trust boundary (see the M18 defense table).
 *
 * Browser-API module: import from client components only.
 */

export const AVATAR_SIZE_PX = 512;
/** Gallery photos keep their aspect ratio; this caps the LONG edge. */
export const GALLERY_MAX_EDGE_PX = 1600;
const ENCODE_QUALITY = 0.85;
/** Refuse to even decode absurd inputs (decompression-bomb courtesy cap). */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export type EncodedImage = {
  blob: Blob;
  contentType: "image/webp" | "image/jpeg";
};

/** What to draw: a source rectangle, scaled into a target canvas size. */
type DrawPlan = {
  target: { width: number; height: number };
  source: { x: number; y: number; width: number; height: number };
};

/** Square cover-crop: the largest centered square of the source. */
export async function encodeAvatar(file: File): Promise<EncodedImage> {
  return encodeToCanvas(file, (width, height) => {
    const side = Math.min(width, height);
    return {
      target: { width: AVATAR_SIZE_PX, height: AVATAR_SIZE_PX },
      source: {
        x: (width - side) / 2,
        y: (height - side) / 2,
        width: side,
        height: side,
      },
    };
  });
}

/**
 * Gallery variant: same guarantees, but the photo keeps its aspect ratio —
 * a square crop would ruin training shots — with the long edge capped.
 */
export async function encodeGalleryPhoto(file: File): Promise<EncodedImage> {
  return encodeToCanvas(file, (width, height) => {
    // Never upscale: the scale factor caps at 1.
    const scale = Math.min(1, GALLERY_MAX_EDGE_PX / Math.max(width, height));
    return {
      target: {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      },
      source: { x: 0, y: 0, width, height },
    };
  });
}

/**
 * Decode via HTMLImageElement (EXIF orientation is applied at draw time in
 * every current browser — the bitmap path's imageOrientation option is
 * flakier across Safari versions), draw per the plan, re-encode.
 */
async function encodeToCanvas(
  file: File,
  plan: (width: number, height: number) => DrawPlan,
): Promise<EncodedImage> {
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
    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
      throw new Error("We couldn't read that file as an image.");
    }

    const { target, source } = plan(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Your browser couldn't process the image.");
    }
    ctx.drawImage(
      image,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      target.width,
      target.height,
    );

    const webp = await toBlob(canvas, "image/webp");
    // Browsers without a WebP ENCODER return a blob of a different type (or
    // null) — fall back to JPEG, which every canvas can produce. Both are on
    // the bucket accept lists.
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
