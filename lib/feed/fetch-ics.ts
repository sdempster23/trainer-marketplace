import { lookup as dnsLookup } from "node:dns";
import type { LookupAddress } from "node:dns";
import https from "node:https";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";

/**
 * The import half's SSRF layer (M16 gate rulings): the trainer pastes an
 * arbitrary URL and OUR SERVER fetches it. Defenses, in order:
 *
 *  1. URL SHAPE (validateExternalCalendarUrl): webcal:// normalized to
 *     https://; https only; hostname must not be an IP literal in ANY
 *     encoding — the WHATWG URL parser normalizes decimal/octal/hex IPv4
 *     (2130706433 → 127.0.0.1) BEFORE we look, so isIP() on the parsed
 *     hostname catches every encoding; bracketed IPv6 literals arrive as
 *     hostname too; obvious internal names rejected outright.
 *  2. CONNECT-TIME DNS-REBIND PROTECTION (the ruling's binding addition):
 *     the request runs on an https.Agent with a guarded `lookup` — the
 *     resolver result the SOCKET CONNECTS TO is the address that gets
 *     vetted, so a hostname that re-resolves to 10.0.0.1 between
 *     validation and connection is rejected at the only moment that
 *     matters. Applies to every hop. Built on node:https because the
 *     Agent lookup hook is first-class there — no new dependency, no
 *     reliance on Next's patched fetch passing a dispatcher through.
 *  3. REDIRECTS: manual, ≤ 2 hops, each hop re-validated through (1) and
 *     connected through (2).
 *  4. CAPS: 5s total budget, 1 MB body cap (a year of busy blocks is
 *     kilobytes), and the body must LOOK like a calendar
 *     (BEGIN:VCALENDAR) — content-type is spoofable, parse-or-reject is
 *     the real check (the parser itself is the final gate).
 */

export const FETCH_TIMEOUT_MS = 5_000;
export const MAX_ICS_BYTES = 1_000_000;
const MAX_REDIRECT_HOPS = 2;

const BLOCKED_HOSTNAME_SUFFIXES = [".local", ".internal", ".home.arpa"];
const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

/** Private / link-local / metadata / non-routable — the connect-time deny
 * list. v4-mapped v6 (::ffff:a.b.c.d) is unwrapped and judged as v4. */
export function isPrivateIp(address: string): boolean {
  const v4Mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const ip = v4Mapped ? v4Mapped[1]! : address;

  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 || // 0.0.0.0/8
      a === 10 || // 10/8
      a === 127 || // loopback
      (a === 100 && b! >= 64 && b! <= 127) || // 100.64/10 CGNAT
      (a === 169 && b === 254) || // link-local (cloud metadata lives here)
      (a === 172 && b! >= 16 && b! <= 31) || // 172.16/12
      (a === 192 && b === 168) || // 192.168/16
      (a === 198 && (b === 18 || b === 19)) || // 198.18/15 benchmarking
      a >= 224 // multicast + reserved
    );
  }

  // IPv6: loopback, unspecified, link-local, unique-local, and the NAT64
  // well-known prefix (an embedded private v4 rides through it).
  const lower = ip.toLowerCase();
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb") ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("64:ff9b:")
  );
}

/** Shape-validate (and normalize) a pasted calendar URL. Returns the
 * normalized https URL string, or an error message. */
export function validateExternalCalendarUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim().replace(/^webcal:\/\//i, "https://");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Calendar URLs must start with https:// (or webcal://)." };
  }
  const host = parsed.hostname.toLowerCase();
  // The URL parser has already normalized decimal/octal/hex IPv4 encodings
  // to dotted-quad, and IPv6 arrives bracket-stripped — one isIP() covers
  // every literal encoding.
  if (isIP(host.replace(/^\[|\]$/g, "")) !== 0) {
    return { ok: false, error: "Calendar URLs must use a hostname, not an IP address." };
  }
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    BLOCKED_HOSTNAME_SUFFIXES.some((s) => host.endsWith(s)) ||
    !host.includes(".")
  ) {
    return { ok: false, error: "That host can't be used for a calendar subscription." };
  }
  return { ok: true, url: parsed.toString() };
}

/** The rebind guard: a dns.lookup wrapper that fails the CONNECTION when
 * any resolved address is private — the vetted IP is the connected IP.
 * Shaped as net.LookupFunction so it slots into https.Agent directly;
 * handles both single-address and all:true array results. */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(
    hostname,
    options,
    (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => {
      if (err) {
        callback(err, address as never, family as never);
        return;
      }
      const resolved: string[] = Array.isArray(address)
        ? address.map((entry) => entry.address)
        : [address];
      const bad = resolved.find((ip) => isPrivateIp(ip));
      if (bad) {
        // Deliberately NO hostname in the message — it is part of the
        // trainer's secret calendar URL, and this string surfaces to logs.
        callback(
          Object.assign(
            new Error("Refusing to connect: calendar host resolves to a private address"),
            { code: "EPRIVATEADDR" },
          ),
          address as never,
          family as never,
        );
        return;
      }
      callback(null, address as never, family as never);
    },
  );
};

export type IcsFetchResult =
  | { ok: true; body: string }
  | { ok: false; error: string };

/** One GET with the guarded agent, manual redirect surfaced to the caller. */
function guardedGet(
  url: string,
  signal: AbortSignal,
): Promise<
  | { kind: "body"; body: string }
  | { kind: "redirect"; location: string }
  | { kind: "error"; error: string }
> {
  return new Promise((resolve) => {
    const agent = new https.Agent({
      lookup: guardedLookup,
      keepAlive: false, // sockets die with the request — no idle keep-alive to a stranger's host
    });

    const req = https.get(
      url,
      {
        agent,
        signal,
        headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume(); // drain
          const location = res.headers.location;
          resolve(
            location
              ? { kind: "redirect", location }
              : { kind: "error", error: "Redirect without a location" },
          );
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          resolve({ kind: "error", error: `Calendar host returned ${status}` });
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.byteLength;
          if (received > MAX_ICS_BYTES) {
            res.destroy();
            resolve({ kind: "error", error: "Calendar file too large" });
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({ kind: "body", body: Buffer.concat(chunks).toString("utf8") }),
        );
        res.on("error", (e) => resolve({ kind: "error", error: e.message }));
      },
    );
    req.on("error", (e) => resolve({ kind: "error", error: e.message }));
  });
}

/** Fetch a validated calendar URL with the full defense stack. Never
 * throws — the caller maps { ok: false } to the fetch_ok=false lane
 * (stale-beats-none is the DB's job; ours is to report honestly). */
export async function fetchIcsSafely(startUrl: string): Promise<IcsFetchResult> {
  const deadline = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let url = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    // Every hop re-passes the shape gate (redirect-to-private/http is a
    // classic bypass) and connects through the rebind guard.
    const shaped = validateExternalCalendarUrl(url);
    if (!shaped.ok) {
      return { ok: false, error: `Redirected to a disallowed URL (${shaped.error})` };
    }

    const result = await guardedGet(shaped.url, deadline);

    if (result.kind === "redirect") {
      if (hop === MAX_REDIRECT_HOPS) {
        return { ok: false, error: "Too many redirects" };
      }
      try {
        url = new URL(result.location, shaped.url).toString();
      } catch {
        return { ok: false, error: "Redirect to an invalid URL" };
      }
      continue;
    }
    if (result.kind === "error") {
      return { ok: false, error: result.error };
    }

    const body = result.body;
    if (!body.trimStart().replace(/^﻿/, "").startsWith("BEGIN:VCALENDAR")) {
      return { ok: false, error: "Response is not an ICS calendar" };
    }
    return { ok: true, body };
  }
  return { ok: false, error: "Too many redirects" };
}
