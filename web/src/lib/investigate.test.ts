import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { investigate } from "./investigate";
import type { StreamEvent } from "./types";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function mockNetwork(): void {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
      const u = new URL(url);
      const name = u.searchParams.get("name");
      const type = u.searchParams.get("type");
      if (name === "example.com" && type === "A") return json({ Status: 0, Answer: [{ name, type: 1, TTL: 60, data: "93.184.216.34" }] });
      if (name === "example.com" && type === "NS") return json({ Status: 0, AD: false, Answer: [{ name, type: 2, TTL: 60, data: "a.iana-servers.net." }] });
      if (name === "example.com" && type === "MX") return json({ Status: 0, Answer: [{ name, type: 15, TTL: 60, data: "10 mail.example.com." }] });
      if (name === "example.com" && type === "TXT") return json({ Status: 0, Answer: [{ name, type: 16, TTL: 60, data: '"v=spf1 -all"' }] });
      if (name === "www.example.com" && type === "A") return json({ Status: 0, Answer: [{ name, type: 1, TTL: 60, data: "93.184.216.35" }] });
      return json({ Status: 0 });
    }
    if (url.startsWith("https://rdap.org/domain/")) {
      return json({
        status: ["client transfer prohibited"],
        events: [
          { eventAction: "registration", eventDate: "1995-08-14T04:00:00Z" },
          { eventAction: "expiration", eventDate: "2099-08-13T04:00:00Z" },
        ],
        entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "RESERVED-Internet Assigned Numbers Authority"]]] }],
      });
    }
    if (url.startsWith("https://crt.sh/")) return json([{ name_value: "www.example.com\nstaging.example.com" }]);
    if (url.startsWith("https://ipwho.is/")) {
      return json({ success: true, ip: url.split("/").pop(), country: "United States", city: "Los Angeles", latitude: 34.05, longitude: -118.24, connection: { asn: 15133, org: "Edgecast" } });
    }
    return json({}, 404);
  });
}

describe("investigate", () => {
  beforeEach(mockNetwork);
  afterEach(() => vi.unstubAllGlobals());

  it("builds a connected graph with findings and a score", async () => {
    const events: StreamEvent[] = [];
    await investigate({ type: "domain", value: "example.com" }, (e) => events.push(e), { signal: new AbortController().signal });

    const entities = new Map(events.filter((e) => e.kind === "entity").map((e) => [e.entity.id, e.entity]));
    expect(entities.has("domain:example.com")).toBe(true);
    expect(entities.has("ip:93.184.216.34")).toBe(true);
    expect(entities.has("subdomain:www.example.com")).toBe(true);
    expect(entities.has("asn:as15133")).toBe(true);
    expect(entities.get("ip:93.184.216.34")?.geo).toEqual({ lat: 34.05, lon: -118.24 });

    const titles = events.filter((e) => e.kind === "finding").map((e) => e.finding.title);
    expect(titles).toContain("No DMARC policy");
    expect(titles).toContain("Non production hostnames are public");

    const done = events.find((e) => e.kind === "done");
    expect(done && done.kind === "done" && done.score).toBeGreaterThan(0);
    expect(done && done.kind === "done" && done.entities).toBeGreaterThan(5);
  });

  it("survives a failing source and reports it", async () => {
    vi.stubGlobal("fetch", async () => json({}, 500));
    const events: StreamEvent[] = [];
    await investigate({ type: "domain", value: "example.com" }, (e) => events.push(e), { signal: new AbortController().signal });
    expect(events.some((e) => e.kind === "progress" && e.status === "error")).toBe(true);
    expect(events.at(-1)?.kind).toBe("done");
  });

  it("stops when aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const events: StreamEvent[] = [];
    await investigate({ type: "domain", value: "example.com" }, (e) => events.push(e), { signal: ac.signal });
    expect(events.some((e) => e.kind === "progress")).toBe(false);
  });

  it("respects the run budget", async () => {
    const events: StreamEvent[] = [];
    await investigate({ type: "domain", value: "example.com" }, (e) => events.push(e), { signal: new AbortController().signal, maxRuns: 2 });
    expect(events.filter((e) => e.kind === "progress" && e.status === "start").length).toBeLessThanOrEqual(2);
    expect(events.some((e) => e.kind === "progress" && e.status === "skipped")).toBe(true);
  });
});
