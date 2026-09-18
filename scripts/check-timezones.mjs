import { accessSync, constants } from "node:fs";
import { isAbsolute, join } from "node:path";
import { calendarReadinessErrors, timezoneReadinessErrors } from "../lib/timezones/runtime.mjs";

// A readiness check, not a timezone implementation. Expected values come
// from IANA 2026d; scheduling/imports still use the runtime's actual rules.
// Do not set ICU_TIMEZONE_FILES_DIR here: ICU initializes before this script.
const failures = [...timezoneReadinessErrors(), ...calendarReadinessErrors()];
const tzVersion = process.versions.tz ?? "unknown";
console.log(
  `Timezone runtime: Node ${process.versions.node}, ICU ${process.versions.icu ?? "unknown"}, IANA ${tzVersion}`
);

const override = process.env.ICU_TIMEZONE_FILES_DIR;
if (override) {
  if (!isAbsolute(override)) {
    failures.push("ICU_TIMEZONE_FILES_DIR must be an absolute directory path.");
  } else {
    for (const file of [
      "zoneinfo64.res",
      "windowsZones.res",
      "timezoneTypes.res",
      "metaZones.res",
    ]) {
      try {
        accessSync(join(override, file), constants.R_OK);
      } catch {
        failures.push(`The configured ICU directory does not contain readable ${file}.`);
      }
    }
  }
}

if (failures.length) {
  console.error("Timezone readiness check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    "Install verified current ICU timezone data before starting Node; see docs/timezone-data.md. Do not release Canadian bookings with this runtime."
  );
  process.exitCode = 1;
} else {
  console.log(
    "Verified timezone version, clock cases, and 3 calendar recurrences. Run the scheduling/import regression tests too."
  );
}
