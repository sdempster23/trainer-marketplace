import { describe, expect, test } from "vitest";

import { sniffImageType } from "./sniff";

/** Build a byte array from a leading signature plus zero-padding. */
function bytes(sig: number[], length = 32): Uint8Array {
  const out = new Uint8Array(length);
  out.set(sig);
  return out;
}

const JPEG_SIG = [0xff, 0xd8, 0xff, 0xe0];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// RIFF <4-byte size> WEBP
const WEBP_SIG = [
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
];

describe("sniffImageType", () => {
  test("identifies JPEG by magic bytes", () => {
    expect(sniffImageType(bytes(JPEG_SIG))).toBe("image/jpeg");
  });

  test("identifies PNG by magic bytes", () => {
    expect(sniffImageType(bytes(PNG_SIG))).toBe("image/png");
  });

  test("identifies WebP by RIFF container + WEBP tag", () => {
    expect(sniffImageType(bytes(WEBP_SIG))).toBe("image/webp");
  });

  test("rejects RIFF containers that are not WebP (e.g. WAV)", () => {
    const wav = bytes([
      0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(sniffImageType(wav)).toBeNull();
  });

  test("rejects GIF (excluded from the accept list by ruling 3)", () => {
    expect(sniffImageType(bytes([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]))).toBeNull();
  });

  test("rejects SVG/HTML text smuggled under an image content-type", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');
    expect(sniffImageType(svg)).toBeNull();
  });

  test("rejects the empty file", () => {
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
  });

  test("rejects a file shorter than the longest signature it could match", () => {
    // 'RIFF' alone (4 bytes) must not pass as WebP.
    expect(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull();
  });
});
