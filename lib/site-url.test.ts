import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { siteOrigin, siteUrl } from "./site-url";

/** The precedence contract, pinned: NEXT_PUBLIC_SITE_URL (set) > VERCEL_URL
 * > localhost. env is process-global, so save/restore around each case. */
describe("siteOrigin — precedence", () => {
  const saved = {
    site: process.env.NEXT_PUBLIC_SITE_URL,
    vercel: process.env.VERCEL_URL,
  };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
  });
  afterEach(() => {
    if (saved.site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = saved.site;
    if (saved.vercel === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = saved.vercel;
  });

  test("1st: NEXT_PUBLIC_SITE_URL wins over everything", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://pawmatch.app";
    process.env.VERCEL_URL = "preview-abc.vercel.app";
    expect(siteOrigin()).toBe("https://pawmatch.app");
  });

  test("2nd: VERCEL_URL when SITE_URL is unset — bare host gets https://", () => {
    process.env.VERCEL_URL = "pawmatch-git-feat-abc.vercel.app";
    expect(siteOrigin()).toBe("https://pawmatch-git-feat-abc.vercel.app");
  });

  test("3rd: localhost fallback when both unset — never empty", () => {
    expect(siteOrigin()).toBe("http://localhost:3000");
  });

  test("an empty/whitespace SITE_URL is treated as unset (falls through)", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "   ";
    process.env.VERCEL_URL = "preview.vercel.app";
    expect(siteOrigin()).toBe("https://preview.vercel.app");
  });

  test("trailing slashes are stripped from either source", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://pawmatch.app/";
    expect(siteOrigin()).toBe("https://pawmatch.app");
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = "preview.vercel.app/";
    expect(siteOrigin()).toBe("https://preview.vercel.app");
  });

  test("siteUrl joins a path with exactly one slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://pawmatch.app";
    expect(siteUrl("/api/calendar/abc")).toBe(
      "https://pawmatch.app/api/calendar/abc",
    );
    expect(siteUrl("account")).toBe("https://pawmatch.app/account");
  });
});
