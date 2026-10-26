import { describe, expect, it } from "vitest";
import { analyzeDmarc, analyzeSpf } from "./dns";
import { extractHosts } from "./certs";
import { eventDate, registrarName } from "./rdap";

describe("analyzeSpf", () => {
  it("classifies policies", () => {
    expect(analyzeSpf(["v=spf1 include:_spf.google.com -all"]).policy).toBe("strict");
    expect(analyzeSpf(["v=spf1 include:_spf.google.com ~all"]).policy).toBe("soft");
    expect(analyzeSpf(["v=spf1 +all"]).policy).toBe("permissive");
    expect(analyzeSpf(["v=spf1 mx all"]).policy).toBe("permissive");
    expect(analyzeSpf(["v=spf1 a mx"]).policy).toBe("neutral");
    expect(analyzeSpf(["v=spf1 a ?all"]).policy).toBe("neutral");
    expect(analyzeSpf(["hello"]).present).toBe(false);
  });
});

describe("analyzeDmarc", () => {
  it("reads the policy", () => {
    expect(analyzeDmarc(["v=DMARC1; p=reject; rua=mailto:a@b.com"]).policy).toBe("reject");
    expect(analyzeDmarc(["v=DMARC1; p=none"]).policy).toBe("none");
    expect(analyzeDmarc([]).present).toBe(false);
  });
});

describe("extractHosts", () => {
  it("keeps only hosts under the apex and strips wildcards", () => {
    const hosts = extractHosts(["*.example.com\nwww.example.com", "mail.example.com", "evil.com", "example.com", "x.notexample.com"], "example.com");
    expect(hosts).toEqual(["mail.example.com", "www.example.com"]);
  });
});

describe("rdap helpers", () => {
  it("finds the registrar and event dates", () => {
    const entities = [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "Example Registrar, Inc."]]] as [string, Array<[string, unknown, string, unknown]>] }];
    expect(registrarName(entities as never)).toBe("Example Registrar, Inc.");
    expect(eventDate([{ eventAction: "expiration", eventDate: "2030-01-01T00:00:00Z" }], "expiration")).toBe("2030-01-01T00:00:00Z");
    expect(eventDate([], "registration")).toBeNull();
  });
});
