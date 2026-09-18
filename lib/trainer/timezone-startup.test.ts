// @vitest-environment node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const wrapper = fileURLToPath(new URL("../../scripts/with-timezone-data.mjs", import.meta.url));

describe("timezone process startup", () => {
  test("bundled build mode ignores a hosting runtime path that does not exist on the build machine", () => {
    const child = spawnSync(
      process.execPath,
      [wrapper, "--bundled", "node", "-e", "console.log(process.versions.tz)"],
      {
        env: {
          ...process.env,
          ICU_TIMEZONE_FILES_DIR: "/unavailable-function-root/data/timezones/2026d/le",
        },
        encoding: "utf8",
      }
    );
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout.trim().split("\n").at(-1)).toBe("2026d");
  });

  test("loads bundled data before the child initializes ICU", () => {
    const child = spawnSync(
      process.execPath,
      [
        wrapper,
        "node",
        "-e",
        `
      console.log(JSON.stringify({
        tz: process.versions.tz,
        clock: new Intl.DateTimeFormat('en-GB', {
          timeZone: 'America/Vancouver', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).format(new Date('2026-11-15T17:00:00Z'))
      }));
    `,
      ],
      {
        env: { ...process.env, ICU_TIMEZONE_FILES_DIR: undefined },
        encoding: "utf8",
      }
    );
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout.trim().split("\n").at(-1)!)).toEqual({
      tz: "2026d",
      clock: "10:00",
    });
  });

  test("an invalid explicit resource directory stops the command", () => {
    const child = spawnSync(
      process.execPath,
      [wrapper, "node", "-e", "console.log('COMMAND_RAN')"],
      {
        env: { ...process.env, ICU_TIMEZONE_FILES_DIR: "/pawmatch-missing-timezone-resources" },
        encoding: "utf8",
      }
    );
    expect(child.status).toBe(1);
    expect(child.stdout).not.toContain("COMMAND_RAN");
    expect(child.stderr).toContain("zoneinfo64.res");
  });

  test("preserves a failing child command's exit status", () => {
    const child = spawnSync(process.execPath, [wrapper, "node", "-e", "process.exit(7)"], {
      env: { ...process.env, ICU_TIMEZONE_FILES_DIR: undefined },
      encoding: "utf8",
    });
    expect(child.status, child.stderr).toBe(7);
  });

  test("server startup proves the actual resource directory, hashes, and calendar rules without logging other environment values", () => {
    const child = spawnSync(
      process.execPath,
      [
        wrapper,
        "node",
        "--input-type=module",
        "-e",
        `
        import { assertTimezoneReadiness } from './lib/timezones/runtime.mjs';
        assertTimezoneReadiness();
      `,
      ],
      {
        env: {
          ...process.env,
          ICU_TIMEZONE_FILES_DIR: undefined,
          PAWMATCH_TEST_PRIVATE_VALUE: "DO_NOT_LOG_THIS_VALUE",
        },
        encoding: "utf8",
      }
    );
    expect(child.status, child.stderr).toBe(0);
    const line = child.stdout.split("\n").find((item) => item.startsWith("[TIMEZONE_STARTUP] "));
    expect(line).toBeDefined();
    const report = JSON.parse(line!.slice("[TIMEZONE_STARTUP] ".length));
    expect(report).toMatchObject({
      iana: "2026d",
      clockChecks: "passed",
      calendarChecks: "passed",
      ready: true,
      bundledResources: { directory: `${process.cwd()}/data/timezones/2026d/le`, verified: true },
    });
    expect(report.bundledResources.files).toHaveLength(4);
    expect(
      report.bundledResources.files.every((file: { matchesSha256: boolean }) => file.matchesSha256)
    ).toBe(true);
    expect(child.stdout + child.stderr).not.toContain("DO_NOT_LOG_THIS_VALUE");
  });

  test("a failed runtime guard still reports the verified deployment bundle before refusing startup", () => {
    const child = spawnSync(
      process.execPath,
      [
        wrapper,
        "node",
        "--input-type=module",
        "-e",
        `
        import { assertTimezoneReadiness } from './lib/timezones/runtime.mjs';
        Object.defineProperty(process.versions, 'tz', { value: '2026a' });
        assertTimezoneReadiness();
      `,
      ],
      { env: { ...process.env, ICU_TIMEZONE_FILES_DIR: undefined }, encoding: "utf8" }
    );
    expect(child.status).toBe(1);
    const line = child.stdout.split("\n").find((item) => item.startsWith("[TIMEZONE_STARTUP] "));
    expect(line).toBeDefined();
    expect(JSON.parse(line!.slice("[TIMEZONE_STARTUP] ".length))).toMatchObject({
      iana: "2026a",
      clockChecks: "failed",
      ready: false,
      bundledResources: { verified: true },
    });
    expect(child.stderr).toContain("PawMatch timezone data is not ready");
  });
});
