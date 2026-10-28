import { fetchJson } from "../http";
import type { Transform } from "./types";

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  sourcecountry?: string;
}

/** Recent open-source news coverage of an organization or domain, via the keyless GDELT DOC API. */
export const gdeltTransform: Transform = {
  id: "gdelt",
  label: "News mentions (GDELT)",
  accepts: ["org", "domain"],
  budget: 2,
  async run(entity, ctx) {
    const query = entity.type === "org" ? `"${entity.value}"` : entity.value;
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=15&sort=datedesc&timespan=3m`;
    const data = await fetchJson<{ articles?: GdeltArticle[] }>(url, { timeoutMs: 15_000, signal: ctx.signal });
    const articles = (data.articles ?? []).filter((a) => a.title && a.url && /^https?:\/\//.test(a.url ?? ""));
    if (articles.length === 0) return;

    const prov = { source: "GDELT", url, fetchedAt: new Date().toISOString() };
    ctx.graph.entity(entity.type, entity.value, { attrs: { newsMentions: articles.length }, provenance: prov });

    const top = articles
      .slice(0, 3)
      .map((a) => `• ${a.title} (${a.domain ?? "source"})`)
      .join("\n");
    ctx.finding({
      id: `news:${entity.id}`,
      severity: "info",
      title: `${articles.length} recent news mention${articles.length === 1 ? "" : "s"}`,
      detail: `Open-source coverage of ${entity.value} in the last 3 months:\n${top}\nTop link: ${articles[0]!.url}`,
      entityId: entity.id,
    });
  },
};
