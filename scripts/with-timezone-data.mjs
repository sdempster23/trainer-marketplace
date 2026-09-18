import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { endianness } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The wrapper itself may have old ICU data. Every command below starts a
// fresh Node process with the resource directory present BEFORE ICU loads.
const require = createRequire(import.meta.url);
const cliArgs = process.argv.slice(2);
// Hosting environment variables also reach the build machine. Its bundle
// lives at a different path, so the Vercel build explicitly selects this mode.
const forceBundled = cliArgs[0] === "--bundled";
const [command, ...args] = forceBundled ? cliArgs.slice(1) : cliArgs;
const check = fileURLToPath(new URL("./check-timezones.mjs", import.meta.url));
const bundled = fileURLToPath(new URL("../data/timezones/2026d/le/", import.meta.url));
const override = forceBundled ? undefined : process.env.ICU_TIMEZONE_FILES_DIR;

if (!override && endianness() !== "LE") {
  console.error(
    "Bundled timezone data requires a little-endian runtime. Configure a compatible ICU_TIMEZONE_FILES_DIR; see docs/timezone-data.md."
  );
  process.exit(1);
}

if (!override) {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL("../data/timezones/2026d/provenance.json", import.meta.url), "utf8")
    );
    for (const file of [
      "zoneinfo64.res",
      "windowsZones.res",
      "timezoneTypes.res",
      "metaZones.res",
    ]) {
      const bytes = readFileSync(join(bundled, file));
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (hash !== manifest.resources[file]?.sha256)
        throw new Error(`${file} does not match the verified bundle`);
    }
  } catch (error) {
    console.error(
      `Cannot load verified timezone data: ${error.message}. See data/timezones/2026d/README.md.`
    );
    process.exit(1);
  }
}

const env = { ...process.env, ICU_TIMEZONE_FILES_DIR: override || bundled };
const entries = {
  next: "next",
  vitest: "vitest",
  playwright: "@playwright/test",
};
if (command !== "check" && command !== "node" && !Object.hasOwn(entries, command ?? "")) {
  console.error(
    "Usage: node scripts/with-timezone-data.mjs [--bundled] <next|vitest|playwright|check|node> [arguments]"
  );
  process.exit(1);
}

const readiness = spawnSync(process.execPath, [check], { env, stdio: "inherit" });
if (readiness.error || readiness.status !== 0) {
  if (readiness.error) console.error(`Could not check timezone data: ${readiness.error.message}`);
  process.exit(readiness.status ?? 1);
}
if (command === "check") process.exit(0);

const packagePath = command === "node" ? null : require.resolve(`${entries[command]}/package.json`);
const childArgs = packagePath
  ? [join(dirname(packagePath), require(packagePath).bin[command]), ...args]
  : args;
const child = spawn(process.execPath, childArgs, { env, stdio: "inherit" });
const interrupt = () => child.kill("SIGINT");
const terminate = () => child.kill("SIGTERM");
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);
child.on("error", (error) => {
  console.error(`Could not start ${command}: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", terminate);
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
