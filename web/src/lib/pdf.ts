import { jsPDF } from "jspdf";
import type { RiskLevel } from "./types";
import { ENTITY_STYLE, SEVERITY_STYLE } from "./ui";
import type { Snapshot } from "./useInvestigation";

/**
 * Render an investigation snapshot to a paginated PDF document. Returns the jsPDF
 * instance so callers can `.save()` it in the browser (or `.output()` it in tests).
 * Text only, no external assets — public/authorized data, same content as the Markdown report.
 */
export function investigationPdf(snap: Snapshot, meta: { score: number; level: RiskLevel; summary: string }): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const width = doc.internal.pageSize.getWidth();
  const bottom = doc.internal.pageSize.getHeight() - margin;
  let y = margin;

  const ensure = (h: number): void => {
    if (y + h > bottom) {
      doc.addPage();
      y = margin;
    }
  };
  const write = (s: string, size: number, opts: { bold?: boolean; color?: [number, number, number]; gap?: number } = {}): void => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const [r, g, b] = opts.color ?? [20, 20, 20];
    doc.setTextColor(r, g, b);
    for (const line of doc.splitTextToSize(s, width - margin * 2) as string[]) {
      ensure(size * 1.3);
      doc.text(line, margin, y);
      y += size * 1.3;
    }
    y += opts.gap ?? 0;
  };

  const seed = snap.seeds[0] ?? "Investigation";
  write("RTAIP investigation report", 18, { bold: true, gap: 2 });
  write(seed, 13, { color: [90, 90, 90], gap: 6 });
  write(`Generated ${new Date().toISOString()}`, 9, { color: [130, 130, 130], gap: 12 });

  write(`Exposure score ${meta.score} / 100  (${meta.level})`, 12, { bold: true, gap: 4 });
  if (meta.summary) write(meta.summary, 10, { color: [50, 50, 50], gap: 12 });

  write("Findings", 13, { bold: true, gap: 4 });
  if (snap.findings.length === 0) write("No findings.", 10, { color: [90, 90, 90], gap: 8 });
  for (const f of [...snap.findings].sort((a, b) => SEVERITY_STYLE[b.severity].rank - SEVERITY_STYLE[a.severity].rank)) {
    write(`[${SEVERITY_STYLE[f.severity].label}] ${f.title}`, 10, { bold: true });
    if (f.detail) write(f.detail, 9, { color: [80, 80, 80], gap: 4 });
  }
  y += 8;

  write("Entities", 13, { bold: true, gap: 4 });
  const byType = new Map<string, string[]>();
  for (const e of snap.entities) byType.set(e.type, [...(byType.get(e.type) ?? []), e.value]);
  for (const [type, values] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const label = ENTITY_STYLE[type as keyof typeof ENTITY_STYLE]?.label ?? type;
    write(`${label} (${values.length})`, 10, { bold: true });
    for (const v of values.slice(0, 60)) write(`- ${v}`, 9, { color: [60, 60, 60] });
    if (values.length > 60) write(`and ${values.length - 60} more`, 9, { color: [120, 120, 120] });
    y += 4;
  }

  write("Sources", 13, { bold: true, gap: 4 });
  for (const s of [...new Set(snap.entities.flatMap((e) => e.provenance.map((p) => p.source)))].sort()) write(`- ${s}`, 9, { color: [60, 60, 60] });
  y += 6;
  write("All data comes from public and authorized sources.", 9, { color: [120, 120, 120] });

  return doc;
}
