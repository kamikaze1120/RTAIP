import type { Finding, RiskLevel, Severity } from "./types";
import type { ParsedSeed } from "./validate";

const WEIGHT: Record<Severity, number> = { info: 0, low: 3, medium: 10, high: 25 };

export function scoreFindings(findings: Finding[]): { score: number; level: RiskLevel } {
  const raw = findings.reduce((sum, f) => sum + WEIGHT[f.severity], 0);
  const score = Math.min(100, raw);
  const level: RiskLevel = score >= 50 ? "high" : score >= 25 ? "elevated" : score >= 8 ? "guarded" : "low";
  return { score, level };
}

export function summarize(seed: ParsedSeed, findings: Finding[], entities: number, edges: number): string {
  const counts = { high: 0, medium: 0, low: 0, info: 0 } as Record<Severity, number>;
  for (const f of findings) counts[f.severity] += 1;
  const issues = counts.high + counts.medium + counts.low;
  const parts = [`Mapped ${entities} entities and ${edges} relationships from ${seed.value}.`];
  if (issues === 0) parts.push("No exposure issues were detected by the checks that completed.");
  else parts.push(`Found ${issues} exposure issue${issues === 1 ? "" : "s"}: ${counts.high} high, ${counts.medium} medium, ${counts.low} low.`);
  return parts.join(" ");
}
