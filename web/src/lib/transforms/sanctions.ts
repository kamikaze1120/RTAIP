import { fetchText } from "../http";
import type { Transform } from "./types";

const TTL = 24 * 3_600_000;
let cache: { at: number; names: Set<string> } | null = null;

/** Uppercase, strip accents and punctuation, collapse whitespace — for stable name comparison. */
export function normName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Extract the primary names from an OFAC SDN CSV (`ent_num,"SDN_Name",SDN_Type,...`). */
export function parseSdnNames(csv: string): Set<string> {
  const names = new Set<string>();
  for (const line of csv.split(/\r?\n/)) {
    const m = line.match(/^\d+,"(.*?)",/);
    if (!m) continue;
    const n = normName(m[1]!);
    if (n.length >= 3) names.add(n);
  }
  return names;
}

/** True when the normalized name exactly matches, or is the leading token-run of, a listed name. */
export function screen(name: string, names: Set<string>): boolean {
  if (names.has(name)) return true;
  if (name.length >= 6) {
    const prefix = `${name} `;
    for (const n of names) if (n.startsWith(prefix)) return true;
  }
  return false;
}

async function ofacNames(signal: AbortSignal): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL) return cache.names;
  const csv = await fetchText("https://www.treasury.gov/ofac/downloads/sdn.csv", { timeoutMs: 30_000, signal });
  const names = parseSdnNames(csv);
  if (names.size > 0) cache = { at: Date.now(), names };
  return names;
}

/** Screens an organization name against the US Treasury OFAC SDN list (keyless public download). */
export const sanctionsTransform: Transform = {
  id: "sanctions",
  label: "OFAC sanctions screening",
  accepts: ["org"],
  budget: 12,
  async run(entity, ctx) {
    const norm = normName(entity.value);
    if (norm.length < 3) return;
    const names = await ofacNames(ctx.signal);
    const hit = screen(norm, names);
    const prov = { source: "US OFAC SDN", url: "https://sanctionslist.ofac.treas.gov/", fetchedAt: new Date().toISOString() };
    ctx.graph.entity("org", entity.value, { attrs: { ofacScreened: true, sanctioned: hit }, provenance: prov });
    if (hit) {
      ctx.finding({
        id: `ofac:${entity.id}`,
        severity: "high",
        title: "Appears on the OFAC SDN sanctions list",
        detail: `"${entity.value}" matches a Specially Designated National on the US Treasury OFAC list. Dealing with sanctioned parties may be legally prohibited — verify against the official list before acting.`,
        entityId: entity.id,
      });
    }
  },
};
