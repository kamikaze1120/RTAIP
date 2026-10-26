import { fetchJson } from "../http";
import type { Transform, TransformContext } from "./types";
import type { Entity } from "../types";

const DOH = "https://cloudflare-dns.com/dns-query";
const TYPE = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 } as const;

interface DohAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}
interface DohResponse {
  Status: number;
  AD?: boolean;
  Answer?: DohAnswer[];
}

export async function dohQuery(name: string, type: keyof typeof TYPE, signal?: AbortSignal): Promise<DohResponse> {
  const url = `${DOH}?name=${encodeURIComponent(name)}&type=${type}`;
  return fetchJson<DohResponse>(url, { headers: { accept: "application/dns-json" }, timeoutMs: 8000, signal });
}

const clean = (s: string): string => s.replace(/\.$/, "").toLowerCase();
const txtValue = (s: string): string => s.replace(/^"|"$/g, "").replace(/"\s+"/g, "");

export function analyzeSpf(records: string[]): { present: boolean; policy: "none" | "strict" | "soft" | "permissive" | "neutral" } {
  const spf = records.find((r) => r.toLowerCase().startsWith("v=spf1"));
  if (!spf) return { present: false, policy: "none" };
  const terms = spf.toLowerCase().split(/\s+/);
  if (terms.includes("+all") || terms.includes("all")) return { present: true, policy: "permissive" };
  if (terms.includes("-all")) return { present: true, policy: "strict" };
  if (terms.includes("~all")) return { present: true, policy: "soft" };
  return { present: true, policy: "neutral" }; // ?all or no all mechanism
}

export function analyzeDmarc(records: string[]): { present: boolean; policy: "none" | "quarantine" | "reject" | "missing" } {
  const dmarc = records.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
  if (!dmarc) return { present: false, policy: "missing" };
  const m = /(?:^|;)\s*p=(none|quarantine|reject)/i.exec(dmarc);
  return { present: true, policy: (m?.[1]?.toLowerCase() as "none" | "quarantine" | "reject") ?? "none" };
}

async function resolveHost(entity: Entity, ctx: TransformContext, wantCname: boolean): Promise<void> {
  const { graph, signal } = ctx;
  const host = entity.value;
  const prov = (type: string) => ({ source: "Cloudflare DNS over HTTPS", url: `${DOH}?name=${host}&type=${type}`, fetchedAt: new Date().toISOString() });
  const [a, aaaa, cname] = await Promise.all([
    dohQuery(host, "A", signal).catch(() => null),
    dohQuery(host, "AAAA", signal).catch(() => null),
    wantCname ? dohQuery(host, "CNAME", signal).catch(() => null) : Promise.resolve(null),
  ]);
  if (!a && !aaaa) throw new Error("DNS lookup failed");
  for (const ans of a?.Answer ?? []) {
    if (ans.type === TYPE.A) {
      const ip = graph.entity("ip", ans.data, { confidence: 0.95, provenance: prov("A") });
      graph.edge(entity, "resolves_to", ip, "dns", 0.95);
    }
  }
  for (const ans of aaaa?.Answer ?? []) {
    if (ans.type === TYPE.AAAA) {
      const ip = graph.entity("ip", ans.data, { confidence: 0.95, provenance: prov("AAAA") });
      graph.edge(entity, "resolves_to", ip, "dns", 0.95);
    }
  }
  for (const ans of cname?.Answer ?? []) {
    if (ans.type === TYPE.CNAME) {
      const target = clean(ans.data);
      const alias = graph.entity("subdomain", target, { confidence: 0.9, provenance: prov("CNAME") });
      graph.edge(entity, "alias_of", alias, "dns", 0.9);
    }
  }
}

export const dnsTransform: Transform = {
  id: "dns",
  label: "DNS records",
  accepts: ["domain", "subdomain", "nameserver", "mailserver"],
  budget: 60,
  async run(entity, ctx) {
    const { graph, signal } = ctx;
    if (entity.type !== "domain") {
      await resolveHost(entity, ctx, entity.type === "subdomain");
      return;
    }
    const domain = entity.value;
    await resolveHost(entity, ctx, false);

    const prov = (type: string, name = domain) => ({ source: "Cloudflare DNS over HTTPS", url: `${DOH}?name=${name}&type=${type}`, fetchedAt: new Date().toISOString() });
    const [ns, mx, txt, dmarcTxt] = await Promise.all([
      dohQuery(domain, "NS", signal).catch(() => null),
      dohQuery(domain, "MX", signal).catch(() => null),
      dohQuery(domain, "TXT", signal).catch(() => null),
      dohQuery(`_dmarc.${domain}`, "TXT", signal).catch(() => null),
    ]);

    for (const ans of ns?.Answer ?? []) {
      if (ans.type !== TYPE.NS) continue;
      const server = graph.entity("nameserver", clean(ans.data), { confidence: 0.95, provenance: prov("NS") });
      graph.edge(entity, "uses_nameserver", server, "dns", 0.95);
    }
    const mailHosts: string[] = [];
    for (const ans of mx?.Answer ?? []) {
      if (ans.type !== TYPE.MX) continue;
      const [prio, host] = ans.data.split(/\s+/);
      if (!host) continue;
      const hostName = clean(host);
      if (hostName === "") continue; // null MX
      mailHosts.push(hostName);
      const server = graph.entity("mailserver", hostName, { confidence: 0.95, attrs: { priority: Number(prio) }, provenance: prov("MX") });
      graph.edge(entity, "mail_handled_by", server, "dns", 0.95);
    }

    const txtRecords = (txt?.Answer ?? []).filter((a) => a.type === TYPE.TXT).map((a) => txtValue(a.data));
    const dmarcRecords = (dmarcTxt?.Answer ?? []).filter((a) => a.type === TYPE.TXT).map((a) => txtValue(a.data));
    const spf = analyzeSpf(txtRecords);
    const dmarc = analyzeDmarc(dmarcRecords);
    const dnssec = Boolean(ns?.AD);
    graph.entity("domain", domain, {
      attrs: { spf: spf.policy, dmarc: dmarc.policy, dnssec, mailServers: mailHosts.length, nameServers: (ns?.Answer ?? []).length },
    });

    if (mailHosts.length > 0) {
      if (!spf.present) {
        ctx.finding({ id: `spf-missing:${domain}`, severity: "medium", title: "No SPF record", detail: `${domain} receives mail but publishes no SPF policy, so anyone can claim to send as this domain.`, entityId: entity.id });
      } else if (spf.policy === "permissive") {
        ctx.finding({ id: `spf-permissive:${domain}`, severity: "high", title: "SPF allows any sender", detail: `The SPF policy for ${domain} ends in +all, which authorizes every server on the internet to send as this domain.`, entityId: entity.id });
      } else if (spf.policy === "soft" || spf.policy === "neutral") {
        ctx.finding({ id: `spf-soft:${domain}`, severity: "low", title: "SPF is not enforcing", detail: `The SPF policy for ${domain} does not use a hard fail (-all), so spoofed mail may still be delivered.`, entityId: entity.id });
      }
      if (!dmarc.present) {
        ctx.finding({ id: `dmarc-missing:${domain}`, severity: "medium", title: "No DMARC policy", detail: `${domain} has no DMARC record at _dmarc.${domain}, so receivers have no instruction on spoofed mail.`, entityId: entity.id });
      } else if (dmarc.policy === "none") {
        ctx.finding({ id: `dmarc-none:${domain}`, severity: "low", title: "DMARC is monitor only", detail: `The DMARC policy for ${domain} is p=none, which reports but does not block spoofed mail.`, entityId: entity.id });
      }
    }
    if (!dnssec) {
      ctx.finding({ id: `dnssec-off:${domain}`, severity: "info", title: "DNSSEC not validated", detail: `Resolvers did not return an authenticated answer for ${domain}.`, entityId: entity.id });
    }
  },
};
