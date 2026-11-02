import { describe, expect, it } from "vitest";
import { investigationPdf } from "./pdf";
import type { Snapshot } from "./useInvestigation";

const snap: Snapshot = { seeds: ["example.com"], entities: [], edges: [], findings: [] };

describe("investigationPdf", () => {
  it("renders a valid PDF document", () => {
    const doc = investigationPdf(snap, { score: 42, level: "elevated", summary: "Test summary" });
    const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
    const head = String.fromCharCode(...bytes.slice(0, 5));
    expect(head).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(500);
  });
});
