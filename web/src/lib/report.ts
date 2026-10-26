import { ENTITY_STYLE, SEVERITY_STYLE } from "./ui";
import type { Snapshot } from "./useInvestigation";
import type { RiskLevel } from "./types";

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Prefix formula triggers so spreadsheets never execute exported values.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function entitiesCsv(snap: Snapshot): string {
  const rows = [["type", "value", "confidence", "sources", "latitude", "longitude", "attributes"]];
  for (const e of snap.entities) {
    rows.push([e.type, e.value, String(e.confidence), [...new Set(e.provenance.map((p) => p.source))].join("; "), e.geo ? String(e.geo.lat) : "", e.geo ? String(e.geo.lon) : "", JSON.stringify(e.attrs)]);
  }
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}

export function markdownReport(snap: Snapshot, meta: { score: number; level: RiskLevel; summary: string; notes?: string }): string {
  const lines: string[] = [];
  const seed = snap.seeds[0] ?? "Investigation";
  lines.push(`# Investigation report: ${seed}`, "", `Generated ${new Date().toISOString()}`, "", `Exposure score ${meta.score} of 100 (${meta.level})`, "", meta.summary, "");
  if (meta.notes?.trim()) lines.push("## Analyst notes", "", meta.notes.trim(), "");
  lines.push("## Findings", "");
  if (snap.findings.length === 0) lines.push("No findings.");
  for (const f of [...snap.findings].sort((a, b) => SEVERITY_STYLE[b.severity].rank - SEVERITY_STYLE[a.severity].rank)) {
    lines.push(`- **${SEVERITY_STYLE[f.severity].label}**: ${f.title}. ${f.detail}`);
  }
  lines.push("", "## Entities", "");
  const byType = new Map<string, string[]>();
  for (const e of snap.entities) byType.set(e.type, [...(byType.get(e.type) ?? []), e.value]);
  for (const [type, values] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const label = ENTITY_STYLE[type as keyof typeof ENTITY_STYLE]?.label ?? type;
    lines.push(`### ${label} (${values.length})`, "", ...values.slice(0, 100).map((v) => `- ${v}`), values.length > 100 ? `- and ${values.length - 100} more` : "", "");
  }
  lines.push("## Sources", "", ...[...new Set(snap.entities.flatMap((e) => e.provenance.map((p) => p.source)))].sort().map((s) => `- ${s}`), "", "All data comes from public and authorized sources.");
  return lines.join("\n");
}

export function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
