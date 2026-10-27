import { cached } from "./cache";
import { USER_AGENT } from "./http";
import { matchZones } from "./layers/zones";

export interface FeedItem {
  id: string;
  kind: "news" | "cyber" | "space";
  title: string;
  source: string;
  url: string;
  time: string | null;
  zones: string[];
}

const RSS_SOURCES = [
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "DW", url: "https://rss.dw.com/rdf/rss-en-world" },
  { name: "France 24", url: "https://www.france24.com/en/rss" },
  { name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml" },
  { name: "The Guardian", url: "https://www.theguardian.com/world/rss" },
];

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'" };

export function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/<[^>]+>/g, "")
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decodeXml(m[1] ?? "") : null;
}

export function parseRss(xml: string, source: string, limit = 25): FeedItem[] {
  const items: FeedItem[] = [];
  const re = /<item[\s>][\s\S]*?<\/item>/gi;
  for (const block of xml.match(re) ?? []) {
    const title = tag(block, "title");
    const link = tag(block, "link") ?? /<link[^>]*href="([^"]+)"/i.exec(block)?.[1] ?? null;
    if (!title || !link || !/^https?:\/\//.test(link)) continue;
    const date = tag(block, "pubDate") ?? tag(block, "dc:date");
    const t = date ? Date.parse(date) : NaN;
    items.push({ id: `news:${link}`, kind: "news", title, source, url: link, time: Number.isFinite(t) ? new Date(t).toISOString() : null, zones: matchZones(title).map((z) => z.id) });
    if (items.length >= limit) break;
  }
  return items;
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(8000), cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

interface Kev {
  vulnerabilities?: Array<{ cveID: string; vendorProject: string; product: string; vulnerabilityName: string; dateAdded: string; knownRansomwareCampaignUse?: string }>;
}

export function normalizeKev(data: Kev, limit = 15): FeedItem[] {
  return [...(data.vulnerabilities ?? [])]
    .sort((a, b) => Date.parse(b.dateAdded) - Date.parse(a.dateAdded))
    .slice(0, limit)
    .map((v) => ({
      id: `kev:${v.cveID}`,
      kind: "cyber" as const,
      title: `${v.cveID} exploited in the wild: ${v.vendorProject} ${v.product}${v.knownRansomwareCampaignUse === "Known" ? " (ransomware use)" : ""}`,
      source: "CISA KEV",
      url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
      time: new Date(v.dateAdded).toISOString(),
      zones: [],
    }));
}

export async function getFeed(): Promise<{ fetchedAt: string; items: FeedItem[] }> {
  const res = await cached("feed", 5 * 60_000, async () => {
    const settled = await Promise.allSettled([
      ...RSS_SOURCES.map(async (s) => parseRss(await getText(s.url), s.name)),
      getText("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json").then((t) => normalizeKev(JSON.parse(t) as Kev)),
    ]);
    const items = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (items.length === 0) throw new Error("no feeds reachable");
    const seen = new Set<string>();
    return items
      .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
      .sort((a, b) => Date.parse(b.time ?? "0") - Date.parse(a.time ?? "0"))
      .slice(0, 120);
  });
  return { fetchedAt: new Date(res.fetchedAt).toISOString(), items: res.value };
}
