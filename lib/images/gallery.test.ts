import { beforeEach, describe, expect, test } from "vitest";

import {
  GALLERY_MAX_PHOTOS,
  galleryObjectName,
  publicGalleryUrl,
} from "./gallery";

const TRAINER = "da190001-0000-0000-0000-000000000001";
const OTHER = "da190002-0000-0000-0000-000000000002";
const FILE = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

describe("gallery constants", () => {
  test("the cap matches the DB CHECK (position 1..8)", () => {
    expect(GALLERY_MAX_PHOTOS).toBe(8);
  });
});

describe("galleryObjectName", () => {
  test("builds '{trainerId}/{fileName}'", () => {
    expect(galleryObjectName(TRAINER, FILE)).toBe(`${TRAINER}/${FILE}`);
  });
});

describe("publicGalleryUrl (render-side distrust of stored rows)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  });

  test("rebuilds the URL from the row's own trainer id + validated file name", () => {
    expect(publicGalleryUrl(TRAINER, FILE)).toBe(
      `https://example.supabase.co/storage/v1/object/public/trainer-gallery/${TRAINER}/${FILE}`,
    );
  });

  test("rejects a traversal file_name reaching another bucket", () => {
    expect(
      publicGalleryUrl(TRAINER, `../../avatars/${OTHER}/avatar`),
    ).toBeNull();
  });

  test("rejects a file_name carrying a path separator", () => {
    expect(publicGalleryUrl(TRAINER, `${OTHER}/${FILE}`)).toBeNull();
  });

  test("rejects uppercase and non-uuid file names", () => {
    expect(publicGalleryUrl(TRAINER, FILE.toUpperCase())).toBeNull();
    expect(publicGalleryUrl(TRAINER, "photo-1.webp")).toBeNull();
    expect(publicGalleryUrl(TRAINER, "")).toBeNull();
  });

  test("rejects a query-string smuggle", () => {
    expect(publicGalleryUrl(TRAINER, `${FILE}?x=1`)).toBeNull();
  });

  test("rejects a non-uuid trainer id (the row's own key is validated too)", () => {
    expect(publicGalleryUrl("../avatars", FILE)).toBeNull();
  });
});
