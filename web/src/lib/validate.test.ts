import { describe, expect, it } from "vitest";
import { guessSeedType, isPublicIp, normalizeDomain, normalizeEmail, parseSeed } from "./validate";

describe("normalizeDomain", () => {
  it("strips scheme, path, port and case", () => {
    expect(normalizeDomain("HTTPS://Example.COM:8443/a/b?x=1")).toBe("example.com");
  });
  it("converts unicode to punycode", () => {
    expect(normalizeDomain("bücher.de")).toBe("xn--bcher-kva.de");
  });
  it("rejects ips, local names and junk", () => {
    for (const bad of ["1.2.3.4", "localhost", "printer.local", "a b.com", "user@example.com", "", "nodot", "http://"]) {
      expect(normalizeDomain(bad)).toBeNull();
    }
  });
});

describe("isPublicIp", () => {
  it("accepts public addresses", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("2606:4700:4700::1111")).toBe(true);
  });
  it("rejects private, loopback, link local, cgnat and multicast", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.4", "192.168.1.1", "100.64.0.1", "224.0.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPublicIp(ip)).toBe(false);
    }
  });
});

describe("normalizeEmail and guessSeedType", () => {
  it("normalizes the domain half", () => {
    expect(normalizeEmail("Jane@Example.COM")).toBe("jane@example.com");
    expect(normalizeEmail("nope")).toBeNull();
  });
  it("guesses the seed type", () => {
    expect(guessSeedType("a@b.com")).toBe("email");
    expect(guessSeedType("8.8.8.8")).toBe("ip");
    expect(guessSeedType("example.com")).toBe("domain");
    expect(guessSeedType("???")).toBeNull();
  });
});

describe("parseSeed", () => {
  it("blocks private ips", () => {
    const r = parseSeed("ip", "192.168.0.1");
    expect(r.ok).toBe(false);
  });
  it("auto detects", () => {
    const r = parseSeed("auto", "https://Example.com/x");
    expect(r).toEqual({ ok: true, seed: { type: "domain", value: "example.com" } });
  });
});
