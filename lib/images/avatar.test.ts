import { beforeEach, describe, expect, test } from "vitest";

import { avatarInitials, publicAvatarUrl } from "./avatar";

const UID = "d28c605f-4b86-4eff-bffd-83269ff9b855";
const OTHER_UID = "a1111111-1111-1111-1111-111111111111";

describe("avatarInitials", () => {
  test("takes the first letter of the first two words", () => {
    expect(avatarInitials("Casey Jones")).toBe("CJ");
  });

  test("single word yields a single initial", () => {
    expect(avatarInitials("Annie")).toBe("A");
  });

  test("collapses extra whitespace between words", () => {
    expect(avatarInitials("  Marcus   Webb  ")).toBe("MW");
  });

  test("more than two words still yields two initials", () => {
    expect(avatarInitials("Ana Maria Silva")).toBe("AM");
  });

  test("null and empty names yield the empty string", () => {
    expect(avatarInitials(null)).toBe("");
    expect(avatarInitials("   ")).toBe("");
  });

  test("non-BMP first characters survive whole (no split surrogates)", () => {
    // displayNameSchema restricts only length, so emoji-leading names exist.
    expect(avatarInitials("😀 Buddy")).toBe("😀B");
    expect(avatarInitials("𝕁ohn Doe")).toBe("𝕁D");
  });
});

describe("publicAvatarUrl (render-side distrust of the stored column)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  });

  test("rebuilds the URL for the profile's own well-formed path", () => {
    expect(publicAvatarUrl(UID, `${UID}/avatar?v=123`)).toBe(
      `https://example.supabase.co/storage/v1/object/public/avatars/${UID}/avatar?v=123`,
    );
  });

  test("rejects a stored path pointing at ANOTHER user's avatar (hijack)", () => {
    expect(publicAvatarUrl(UID, `${OTHER_UID}/avatar?v=1`)).toBeNull();
  });

  test("rejects path traversal into other buckets", () => {
    expect(
      publicAvatarUrl(UID, `../trainer-gallery/${UID}/photo-1?v=1`),
    ).toBeNull();
  });

  test("rejects a non-numeric version (no arbitrary query smuggling)", () => {
    expect(publicAvatarUrl(UID, `${UID}/avatar?v=1&x=../../x`)).toBeNull();
  });

  test("rejects arbitrary strings", () => {
    expect(publicAvatarUrl(UID, "https://evil.example/x.png")).toBeNull();
    expect(publicAvatarUrl(UID, `${UID}/other-object?v=1`)).toBeNull();
  });
});
