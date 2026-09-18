import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ical from "node-ical";

// Server/runtime readiness only. This checks native ICU; it does not patch
// Intl or encode replacement timezone rules. Booking code keeps using IANA.
const clockCases = [
  ["America/Vancouver", "2026-11-15T17:00:00Z", "10:00"],
  ["America/Edmonton", "2026-11-15T17:00:00Z", "11:00"],
  ["America/Inuvik", "2026-11-15T17:00:00Z", "11:00"],
  ["America/Vancouver", "2026-01-15T17:00:00Z", "09:00"],
  ["America/Edmonton", "2026-01-15T17:00:00Z", "10:00"],
  ["America/Inuvik", "2026-01-15T17:00:00Z", "10:00"],
  ["America/St_Johns", "2026-11-15T17:00:00Z", "13:30"],
  ["Europe/London", "2026-11-15T17:00:00Z", "17:00"],
  ["Europe/London", "2026-07-15T17:00:00Z", "18:00"],
  ["America/Los_Angeles", "2026-11-15T17:00:00Z", "09:00"],
  ["America/Chicago", "2026-11-15T17:00:00Z", "11:00"],
];

export function timezoneReadinessErrors() {
  const failures = [];
  const tzVersion = process.versions.tz ?? "unknown";
  const version = /^(\d{4})([a-z]+)$/.exec(tzVersion);
  if (
    !version ||
    Number(version[1]) < 2026 ||
    (Number(version[1]) === 2026 && version[2].length === 1 && version[2] < "d")
  ) {
    failures.push(`IANA data is ${tzVersion}; this release requires 2026d or newer.`);
  }
  for (const [timeZone, instant, expected] of clockCases) {
    try {
      const actual = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hourCycle: "h23",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(instant));
      if (actual !== expected)
        failures.push(`${timeZone} at ${instant}: expected ${expected}, received ${actual}.`);
    } catch {
      failures.push(`The runtime could not format ${timeZone}.`);
    }
  }
  return failures;
}

export function calendarReadinessErrors() {
  const failures = [];
  for (const [timeZone, expectedHour] of [
    ["America/Vancouver", "16"],
    ["America/Edmonton", "15"],
    ["America/Inuvik", "15"],
  ]) {
    try {
      const parsed = ical.sync.parseICS(
        [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//PawMatch runtime check//EN",
          "BEGIN:VEVENT",
          "UID:timezone-check",
          `DTSTART;TZID=${timeZone}:20261025T090000`,
          `DTEND;TZID=${timeZone}:20261025T100000`,
          "RRULE:FREQ=WEEKLY;COUNT=3",
          "END:VEVENT",
          "END:VCALENDAR",
        ].join("\r\n")
      );
      const event = parsed["timezone-check"];
      const actual =
        event?.type === "VEVENT" && event.rrule
          ? event.rrule
              .between(new Date("2026-10-24T00:00:00Z"), new Date("2026-11-09T00:00:00Z"), true)
              .map((date) => date.toISOString())
          : [];
      const expected = ["2026-10-25", "2026-11-01", "2026-11-08"].map(
        (date) => `${date}T${expectedHour}:00:00.000Z`
      );
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        failures.push(
          `${timeZone} calendar recurrence: expected ${expected.join(", ")}; received ${actual.join(", ") || "no occurrences"}.`
        );
      }
    } catch {
      failures.push(`The runtime could not expand the ${timeZone} calendar recurrence.`);
    }
  }
  return failures;
}

function bundledResourceReport() {
  // Vercel documents process.cwd() as the function's file root. Reporting
  // the real path and hashes lets the release owner verify its deployment
  // instead of assuming a platform-specific absolute directory.
  const dataRoot = join(process.cwd(), "data/timezones/2026d");
  const directory = join(dataRoot, "le");
  let resources = {};
  try {
    resources = JSON.parse(readFileSync(join(dataRoot, "provenance.json"), "utf8")).resources;
  } catch {
    // Missing packaging is reported below, even when ICU already loaded.
  }
  const files = ["zoneinfo64.res", "windowsZones.res", "timezoneTypes.res", "metaZones.res"].map(
    (name) => {
      try {
        const sha256 = createHash("sha256")
          .update(readFileSync(join(directory, name)))
          .digest("hex");
        return {
          name,
          readable: true,
          sha256,
          matchesSha256: sha256 === resources?.[name]?.sha256,
        };
      } catch {
        return { name, readable: false, sha256: null, matchesSha256: false };
      }
    }
  );
  return { directory, verified: files.every((file) => file.matchesSha256), files };
}

export function assertTimezoneReadiness() {
  const clockFailures = timezoneReadinessErrors();
  const calendarFailures = calendarReadinessErrors();
  const failures = [...clockFailures, ...calendarFailures];
  // Server logs only: synthetic checks and an explicit allowlist of safe
  // runtime metadata. Never log arbitrary environment variables or user data.
  // Emit before throwing so a protected preview can reveal packaging even
  // before its startup ICU directory has been configured.
  console.info(
    `[TIMEZONE_STARTUP] ${JSON.stringify({
      node: process.versions.node,
      icu: process.versions.icu ?? "unknown",
      iana: process.versions.tz ?? "unknown",
      workingDirectory: process.cwd(),
      configuredDirectory: process.env.ICU_TIMEZONE_FILES_DIR ?? null,
      bundledResources: bundledResourceReport(),
      clockChecks: clockFailures.length ? "failed" : "passed",
      clockCaseCount: clockCases.length,
      calendarChecks: calendarFailures.length ? "failed" : "passed",
      calendarCaseCount: 3,
      ready: failures.length === 0,
      failures,
    })}`
  );
  if (failures.length) {
    throw new Error(
      `PawMatch timezone data is not ready: ${failures.join(" ")} Start with pnpm dev/start, or configure ICU_TIMEZONE_FILES_DIR before Node starts. See docs/timezone-data.md.`
    );
  }
}
