// SSRF / URL safety tests (mandatory security addendum 1.5).

import { describe, expect, it } from "vitest";
import { assertSafePublicUrl, isPrivateOrSpecialIp, UnsafeUrlError } from "../_shared/urlSafety.ts";

const publicDns = async () => ["93.184.216.34"]; // example.com-ish public IP

describe("assertSafePublicUrl", () => {
  it("accepts a public https URL", async () => {
    const url = await assertSafePublicUrl("https://api.example.com/v1", {
      resolveDns: publicDns,
    });
    expect(url.hostname).toBe("api.example.com");
  });

  it("rejects non-absolute/invalid URLs", async () => {
    await expect(assertSafePublicUrl("not a url", { resolveDns: publicDns })).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(assertSafePublicUrl("/relative", { resolveDns: publicDns })).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });

  it("rejects http in production (no dev flag)", async () => {
    await expect(
      assertSafePublicUrl("http://api.example.com/v1", { resolveDns: publicDns }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects embedded credentials", async () => {
    await expect(
      assertSafePublicUrl("https://user:pass@api.example.com/v1", { resolveDns: publicDns }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects localhost without the dev flag", async () => {
    await expect(assertSafePublicUrl("http://localhost:1234/v1")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(
      assertSafePublicUrl("http://localhost:1234/v1", { resolveDns: async () => ["127.0.0.1"] }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("allows localhost only when the explicit dev flag is on", async () => {
    const url = await assertSafePublicUrl("http://localhost:1234/v1", { allowLocal: true });
    expect(url.hostname).toBe("localhost");
  });

  it("rejects private, loopback, link-local, and metadata IP literals", async () => {
    for (const target of [
      "https://127.0.0.1/v1",
      "https://10.0.0.5/v1",
      "https://172.16.0.1/v1",
      "https://192.168.1.1/v1",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/v1",
      "https://[fd00::1234]/v1",
      "https://[fe80::1]/v1",
      "https://0.0.0.0/v1",
    ]) {
      await expect(assertSafePublicUrl(target, { resolveDns: publicDns })).rejects.toBeInstanceOf(
        UnsafeUrlError,
      );
    }
  });

  it("rejects hostnames that resolve to private addresses (DNS-check path)", async () => {
    await expect(
      assertSafePublicUrl("https://internal.corp.example/v1", {
        resolveDns: async () => ["10.1.2.3"],
      }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects hostnames resolving to mixed public/private", async () => {
    await expect(
      assertSafePublicUrl("https://rb-dns.example.com/v1", {
        resolveDns: async () => ["93.184.216.34", "169.254.169.254"],
      }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects unresolvable hostnames", async () => {
    await expect(
      assertSafePublicUrl("https://missing.example/v1", { resolveDns: async () => [] }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects special-use hostname namespaces", async () => {
    await expect(
      assertSafePublicUrl("https://foo.local/v1", { resolveDns: publicDns }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(
      assertSafePublicUrl("https://service.internal/v1", { resolveDns: publicDns }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects non-http(s) schemes", async () => {
    await expect(assertSafePublicUrl("file:///etc/passwd")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafePublicUrl("gopher://evil.example/")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });
});

describe("isPrivateOrSpecialIp", () => {
  it("classifies IPv4", () => {
    expect(isPrivateOrSpecialIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrSpecialIp("169.254.169.254")).toBe(true);
    expect(isPrivateOrSpecialIp("100.64.0.1")).toBe(true); // CGNAT
    expect(isPrivateOrSpecialIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrSpecialIp("1.1.1.1")).toBe(false);
  });

  it("classifies IPv6", () => {
    expect(isPrivateOrSpecialIp("::1")).toBe(true);
    expect(isPrivateOrSpecialIp("fc00::1")).toBe(true);
    expect(isPrivateOrSpecialIp("fe80::abcd")).toBe(true);
    expect(isPrivateOrSpecialIp("2001:4860:4860::8888")).toBe(false); // Google DNS
  });

  it("classifies IPv4-mapped IPv6", () => {
    expect(isPrivateOrSpecialIp("::ffff:10.0.0.1")).toBe(true);
  });
});
