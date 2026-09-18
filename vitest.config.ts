import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // Pin a negative-offset zone so the plain-date UTC-anchoring tests
    // (lib/utils/format-date.test.ts) fail deterministically on a
    // local-parsing regression — CI runners default to UTC, where that
    // regression is invisible.
    // The focused timezone suite also runs under UTC/Chicago to prove
    // scheduling and ICS parsing do not depend on the server's zone.
    env: { TZ: process.env.PAWMATCH_TEST_TZ ?? "America/Anchorage" },
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/tests/e2e/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./"),
    },
  },
});
