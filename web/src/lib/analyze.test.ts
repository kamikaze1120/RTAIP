import { describe, expect, it } from "vitest";
import { scoreFindings } from "./analyze";
import type { Finding } from "./types";

const f = (severity: Finding["severity"]): Finding => ({ id: severity + Math.random(), severity, title: "t", detail: "d" });

describe("scoreFindings", () => {
  it("is low with no findings", () => {
    expect(scoreFindings([])).toEqual({ score: 0, level: "low" });
  });
  it("weights severities and caps at 100", () => {
    expect(scoreFindings([f("medium"), f("low")])).toEqual({ score: 13, level: "guarded" });
    expect(scoreFindings([f("high"), f("high"), f("medium")])).toEqual({ score: 60, level: "high" });
    expect(scoreFindings(Array.from({ length: 10 }, () => f("high"))).score).toBe(100);
  });
});
