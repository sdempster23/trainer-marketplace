import { createRequire } from "node:module";
import { join } from "node:path";

// Compilation alone does not execute Next's instrumentation hook. Load the
// actual production artifact so dependency-bundling failures stop the build.
// The calling wrapper must already have configured ICU before Node started.
process.env.NEXT_RUNTIME = "nodejs";
try {
  const require = createRequire(import.meta.url);
  const instrumentation = require(join(process.cwd(), ".next/server/instrumentation.js"));
  if (typeof instrumentation.register !== "function") {
    throw new Error("The compiled instrumentation hook has no register function.");
  }
  await instrumentation.register();
  console.log("Verified the compiled Next.js timezone startup hook.");
} catch (error) {
  console.error("Compiled timezone startup check failed:", error);
  process.exitCode = 1;
}
