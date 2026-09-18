export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Deployment platforms can start Node without our local CLI wrapper.
    // Refuse stale booking rules; setting the ICU directory here is too late.
    const { assertTimezoneReadiness } = await import("./lib/timezones/runtime.mjs");
    assertTimezoneReadiness();
  }
}
