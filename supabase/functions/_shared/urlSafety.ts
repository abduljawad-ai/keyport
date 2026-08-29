// ============================================================================
// _shared/urlSafety.ts
// Server-side SSRF protection for user-supplied provider base URLs.
//
// A base URL is accepted only if ALL of the following hold:
//   * it is a valid absolute URL
//   * scheme is https (http allowed only for loopback when the explicit
//     development flag ALLOW_LOCAL_PROVIDER_URLS is enabled)
//   * it carries no embedded credentials
//   * the hostname is not localhost/loopback/private/link-local/metadata
//     (unless the dev flag is enabled for loopback)
//   * DNS resolution yields only public addresses (checked via an
//     injectable resolver; Deno.resolveDns in production)
//
// Requests made through safeFetch() never follow redirects
// (`redirect: "error"`), which removes redirect-based SSRF entirely.
// ============================================================================

import { appError, AppError } from "./errors.ts";

export interface UrlSafetyOptions {
  /** Allow http:// on loopback hosts (development only). */
  allowLocal?: boolean;
  /** Injectable DNS resolver; defaults to Deno.resolveDns when present. */
  resolveDns?: (hostname: string) => Promise<string[]>;
}

export class UnsafeUrlError extends AppError {
  constructor(reason: string) {
    super("validation_error", `The base URL is not allowed: ${reason}`, {
      internalMessage: `unsafe base url: ${reason}`,
    });
    this.name = "UnsafeUrlError";
  }
}

// --- IP classification -------------------------------------------------------

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function inIpv4Range(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  const ipNum = ipv4ToNumber(ip);
  const rangeNum = ipv4ToNumber(range);
  if (ipNum === null || rangeNum === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

const PRIVATE_IPV4_RANGES = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10", // CGNAT
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local incl. cloud metadata 169.254.169.254
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved
];

export function isPrivateOrSpecialIp(ip: string): boolean {
  const value = ip.trim().toLowerCase();

  // IPv6 handling
  if (value.includes(":")) {
    const bare = value.startsWith("[") && value.endsWith("]")
      ? value.slice(1, -1)
      : value;
    // IPv4-mapped IPv6 (::ffff:a.b.c.d)
    const mapped = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateOrSpecialIp(mapped[1]);
    if (bare === "::" || bare === "::1") return true; // unspecified / loopback
    if (/^f[cd][0-9a-f]{2}:/.test(bare)) return true; // fc00::/7 unique local
    if (/^fe[89ab][0-9a-f]:/.test(bare)) return true; // fe80::/10 link-local
    if (/^ff[0-9a-f]{2}:/.test(bare)) return true; // multicast
    if (/^2001:db8:/.test(bare)) return true; // documentation
    if (/^64:ff9b:/.test(bare)) return true; // NAT64 translation
    if (/^100::/.test(bare)) return true; // discard-only
    return false;
  }

  // IPv4 handling
  for (const cidr of PRIVATE_IPV4_RANGES) {
    if (inIpv4Range(value, cidr)) return true;
  }
  if (value === "255.255.255.255") return true;
  return false;
}

function isIpLiteral(hostname: string): boolean {
  if (hostname.includes(":")) return true;
  return ipv4ToNumber(hostname) !== null;
}

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".home.arpa",
  ".lan",
];

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost") return true;
  return BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

// --- DNS resolution -----------------------------------------------------------

type DenoLike = {
  resolveDns?: (
    hostname: string,
    recordType: "A" | "AAAA",
  ) => Promise<Array<{ address?: string } | string>>;
};

async function defaultResolveDns(hostname: string): Promise<string[]> {
  const deno = (globalThis as { Deno?: DenoLike }).Deno;
  if (!deno?.resolveDns) {
    // Environments without DNS resolution capability must inject a resolver.
    throw new UnsafeUrlError("hostname could not be validated");
  }
  const ips: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    try {
      const records = await deno.resolveDns(hostname, type);
      for (const record of records) {
        const address = typeof record === "string" ? record : record?.address;
        if (address) ips.push(address);
      }
    } catch {
      // NXDOMAIN / SERVFAIL for one record type is fine if the other
      // yields results; both failing is handled by the caller.
    }
  }
  return ips;
}

// --- public API -----------------------------------------------------------------

/**
 * Validate a user-supplied base URL synchronously (scheme, credentials,
 * hostname policy). Returns the parsed URL.
 */
export function parseAndValidateBaseUrl(raw: string, options: UrlSafetyOptions = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("not a valid absolute URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError("only https URLs are allowed");
  }

  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs must not contain credentials");
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname) throw new UnsafeUrlError("missing hostname");

  const isLoopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1";

  if (isLoopback) {
    if (!options.allowLocal) {
      throw new UnsafeUrlError("localhost is not allowed");
    }
    // Dev flag: loopback only, http or https permitted.
    return url;
  }

  if (url.protocol === "http:") {
    throw new UnsafeUrlError("http is not allowed; use https");
  }

  if (isBlockedHostname(hostname)) {
    throw new UnsafeUrlError("hostname resolves to a restricted namespace");
  }

  if (isIpLiteral(hostname) && isPrivateOrSpecialIp(hostname.replace(/^\[|\]$/g, ""))) {
    throw new UnsafeUrlError("address is not publicly routable");
  }

  return url;
}

/**
 * Full SSRF guard: synchronous policy checks plus DNS resolution check.
 * Every resolved address must be public. Throws UnsafeUrlError otherwise.
 */
export async function assertSafePublicUrl(
  raw: string,
  options: UrlSafetyOptions = {},
): Promise<URL> {
  const url = parseAndValidateBaseUrl(raw, options);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  // Loopback was already policy-checked when allowLocal is on.
  const isLoopback =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (isLoopback && options.allowLocal) return url;

  const resolveDns = options.resolveDns ?? defaultResolveDns;

  // IP literals: no DNS needed.
  if (isIpLiteral(hostname)) {
    if (isPrivateOrSpecialIp(hostname)) {
      throw new UnsafeUrlError("address is not publicly routable");
    }
    return url;
  }

  let addresses: string[];
  try {
    addresses = await resolveDns(hostname);
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err;
    throw new UnsafeUrlError("hostname could not be resolved");
  }
  if (!addresses.length) {
    throw new UnsafeUrlError("hostname could not be resolved");
  }
  for (const address of addresses) {
    if (isPrivateOrSpecialIp(address)) {
      throw new UnsafeUrlError("hostname resolves to a private or internal address");
    }
  }
  return url;
}

/**
 * fetch() that refuses unsafe targets and never follows redirects.
 * Redirect-based SSRF is eliminated by failing on any redirect.
 */
export async function safeFetch(
  url: string | URL,
  init: RequestInit = {},
  options: UrlSafetyOptions = {},
): Promise<Response> {
  const validated = await assertSafePublicUrl(String(url), options);
  let response: Response;
  try {
    response = await fetch(validated.toString(), {
      ...init,
      redirect: "error",
    });
  } catch (err) {
    if (err instanceof TypeError) {
      // Network failure or a redirect was attempted.
      throw appError("provider_error", "Could not reach the provider.", {
        internalMessage: "safeFetch network/redirect failure",
      });
    }
    throw err;
  }
  if (response.redirected || response.status >= 300 && response.status < 400) {
    throw appError("provider_error", "The provider endpoint redirected the request.", {
      internalMessage: "redirect rejected by safeFetch",
    });
  }
  return response;
}
