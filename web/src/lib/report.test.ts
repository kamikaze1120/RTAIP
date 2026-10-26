import { describe, expect, it } from "vitest";
import { entitiesCsv, markdownReport } from "./report";
import type { Snapshot } from "./useInvestigation";

const snap: Snapshot = {
  seeds: ["example.com"],
  entities: [
    { id: "domain:example.com", type: "domain", value: "example.com", label: "example.com", confidence: 1, attrs: {}, provenance: [{ source: "Seed", fetchedAt: "2026-01-01T00:00:00Z" }] },
    { id: "subdomain:=cmd", type: "subdomain", value: "=cmd.example.com", label: "x", confidence: 0.8, attrs: { a: 1 }, provenance: [{ source: "crt.sh", fetchedAt: "2026-01-01T00:00:00Z" }] },
  ],
  edges: [],
  findings: [{ id: "f1", severity: "low", title: "SPF is not enforcing", detail: "Soft fail." }],
};

describe("report", () => {
  it("neutralizes spreadsheet formulas and escapes quotes", () => {
    const csv = entitiesCsv(snap);
    expect(csv).toContain("\"'=cmd.example.com\"");
    expect(csv.split("\n")).toHaveLength(3);
  });
  it("builds a markdown report with findings and sources", () => {
    const md = markdownReport(snap, { score: 3, level: "low", summary: "Mapped 2 entities.", notes: "Check DMARC." });
    expect(md).toContain("# Investigation report: example.com");
    expect(md).toContain("SPF is not enforcing");
    expect(md).toContain("Check DMARC.");
    expect(md).toContain("- crt.sh");
  });
});
