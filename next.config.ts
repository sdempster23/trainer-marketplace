import type { NextConfig } from "next";

/**
 * The images block is the repo's first: it allowlists exactly ONE remote
 * source — this project's Supabase Storage public-object namespace — for
 * next/image (avatars now, gallery later). The host is derived from
 * NEXT_PUBLIC_SUPABASE_URL so dev (127.0.0.1:54321) and prod (the hosted
 * project) each allow only their own storage, with no hardcoded ref to
 * drift.
 *
 * The var may be ABSENT (CI's build step sets no env; fresh clones before
 * .env.local exists) — building without the allowlist is valid then: pages
 * render, remote avatars would 400 through the optimizer, and nothing
 * crashes. A bare `new URL(undefined!)` here would kill every `next`
 * command with an unnamed TypeError instead (review finding).
 *
 * Optimizer economics and the 402-fallback behavior are priced in
 * docs/scratch/trainer-images-investigation-2026-08-25.md §4.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(supabaseUrl
    ? {
        images: {
          remotePatterns: [
            {
              protocol: supabaseUrl.protocol === "http:" ? "http" : "https",
              hostname: supabaseUrl.hostname,
              port: supabaseUrl.port,
              pathname: "/storage/v1/object/public/**",
            },
          ],
        },
      }
    : {}),
};

export default nextConfig;
