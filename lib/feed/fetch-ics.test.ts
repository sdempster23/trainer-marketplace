import { describe, expect, test } from "vitest";

import { isPrivateIp, validateExternalCalendarUrl } from "./fetch-ics";

describe("validateExternalCalendarUrl — the bypass catalog", () => {
  test("accepts a real Google secret address and normalizes webcal://", () => {
    // Arrange / Act
    const https = validateExternalCalendarUrl(
      "https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/private-abc123/basic.ics",
    );
    const webcal = validateExternalCalendarUrl(
      "webcal://p123-caldav.icloud.com/published/2/abc",
    );

    // Assert
    expect(https.ok).toBe(true);
    expect(webcal.ok && webcal.url.startsWith("https://")).toBe(true);
  });

  test("rejects http and unknown schemes", () => {
    expect(validateExternalCalendarUrl("http://example.com/a.ics").ok).toBe(false);
    expect(validateExternalCalendarUrl("ftp://example.com/a.ics").ok).toBe(false);
    expect(validateExternalCalendarUrl("file:///etc/passwd").ok).toBe(false);
  });

  test("rejects IPv4 literals in EVERY encoding (WHATWG normalizes them first)", () => {
    // Arrange — dotted, decimal, octal, hex: the URL parser folds all of
    // these to a dotted-quad hostname before we look.
    const encodings = [
      "https://127.0.0.1/cal.ics",
      "https://2130706433/cal.ics", // decimal
      "https://0177.0.0.1/cal.ics", // octal
      "https://0x7f000001/cal.ics", // hex
      "https://192.168.1.10/cal.ics",
    ];

    // Act / Assert
    for (const url of encodings) {
      expect(validateExternalCalendarUrl(url).ok, url).toBe(false);
    }
  });

  test("rejects IPv6 literals including v4-mapped", () => {
    expect(validateExternalCalendarUrl("https://[::1]/cal.ics").ok).toBe(false);
    expect(validateExternalCalendarUrl("https://[fe80::1]/cal.ics").ok).toBe(false);
    expect(
      validateExternalCalendarUrl("https://[::ffff:10.0.0.1]/cal.ics").ok,
    ).toBe(false);
  });

  test("rejects internal hostnames and dotless hosts", () => {
    expect(validateExternalCalendarUrl("https://localhost/cal.ics").ok).toBe(false);
    expect(validateExternalCalendarUrl("https://intranet/cal.ics").ok).toBe(false);
    expect(validateExternalCalendarUrl("https://nas.local/cal.ics").ok).toBe(false);
    expect(validateExternalCalendarUrl("https://vault.internal/cal.ics").ok).toBe(false);
    expect(
      validateExternalCalendarUrl("https://metadata.google.internal/computeMetadata").ok,
    ).toBe(false);
    expect(validateExternalCalendarUrl("https://router.home.arpa/c.ics").ok).toBe(false);
  });
});

describe("isPrivateIp — the connect-time deny list (rebind guard's core)", () => {
  test("blocks private, loopback, link-local, CGNAT, benchmarking, multicast v4", () => {
    for (const ip of [
      "10.0.0.1",
      "127.0.0.1",
      "127.8.9.10",
      "169.254.169.254", // cloud metadata
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1",
      "100.127.255.255",
      "198.18.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  test("allows public v4", () => {
    for (const ip of ["8.8.8.8", "142.250.80.14", "172.15.0.1", "172.32.0.1", "100.63.0.1", "198.17.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  test("blocks IPv6 loopback/link-local/ULA/NAT64 and v4-mapped private", () => {
    for (const ip of [
      "::1",
      "::",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "64:ff9b::a00:1", // NAT64-embedded 10.0.0.1
      "::ffff:192.168.1.1",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  test("allows public IPv6 and v4-mapped public", () => {
    expect(isPrivateIp("2607:f8b0:4004:c07::6a")).toBe(false);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
  });
});
