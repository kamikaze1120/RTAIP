import { fetchJson } from "../http";
import { normalizeDomain } from "../validate";
import type { Transform, TransformContext } from "./types";
import type { Entity } from "../types";

interface CrtRow {
  name_value?: string;
  issuer_name?: string;
  not_after?: string;
}
interface CertSpotterRow {
  dns_names?: string[];
  not_after?: string;
}

const MAX_SUBDOMAINS = 150;

export function extractHosts(names: string[], apex: string): string[] {
  const out = new Set<string>();
  for (const raw of names) {
    for (const piece of raw.split(/\s+/)) {
      const host = normalizeDomain(piece.replace(/^\*\./, ""));
      if (host && (host === apex || host.endsWith(`.${apex}`)) && host !== apex) out.add(host);
    }
  }
  return [...out].sort();
}

async function fromCrtSh(apex: string, signal: AbortSignal): Promise<{ hosts: string[]; source: string; url: string }> {
  const url = `https://crt.sh/?q=%25.${encodeURIComponent(apex)}&output=json`;
  const rows = await fetchJson<CrtRow[]>(url, { timeoutMs: 20_000, signal });
  return { hosts: extractHosts(rows.map((r) => r.name_value ?? ""), apex), source: "crt.sh Certificate Transparency", url };
}

async function fromCertSpotter(apex: string, signal: AbortSignal): Promise<{ hosts: string[]; source: string; url: string }> {
  const url = `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(apex)}&include_subdomains=true&expand=dns_names`;
  const rows = await fetchJson<CertSpotterRow[]>(url, { timeoutMs: 15_000, signal });
  return { hosts: extractHosts(rows.flatMap((r) => r.dns_names ?? []), apex), source: "Cert Spotter Certificate Transparency", url };
}

async function run(entity: Entity, ctx: TransformContext): Promise<void> {
  let result: { hosts: string[]; source: string; url: string };
  try {
    result = await fromCrtSh(entity.value, ctx.signal);
  } catch {
    result = await fromCertSpotter(entity.value, ctx.signal);
  }
  const prov = { source: result.source, url: result.url, fetchedAt: new Date().toISOString() };
  const hosts = result.hosts.slice(0, MAX_SUBDOMAINS);
  for (const host of hosts) {
    const sub = ctx.graph.entity("subdomain", host, { confidence: 0.85, provenance: prov });
    ctx.graph.edge(sub, "subdomain_of", entity, "certs", 0.85);
  }
  ctx.graph.entity("domain", entity.value, { attrs: { subdomainsFound: result.hosts.length }, provenance: prov });
  if (result.hosts.length > MAX_SUBDOMAINS) {
    ctx.finding({ id: `many-subdomains:${entity.value}`, severity: "info", title: "Large certificate footprint", detail: `${result.hosts.length} hostnames appear in certificate logs for ${entity.value}. The first ${MAX_SUBDOMAINS} are shown.`, entityId: entity.id });
  }
  const risky = hosts.filter((h) => /(^|[.-])(dev|test|staging|stage|uat|qa|internal|admin|vpn|old|backup|beta)([.-]|$)/.test(h.slice(0, h.length - entity.value.length - 1)));
  if (risky.length > 0) {
    ctx.finding({ id: `exposed-envs:${entity.value}`, severity: "medium", title: "Non production hostnames are public", detail: `Certificate logs reveal ${risky.length} hostnames that look like development, staging or admin systems, for example ${risky.slice(0, 3).join(", ")}.`, entityId: entity.id });
  }
}

export const certsTransform: Transform = {
  id: "certs",
  label: "Subdomains (certificate logs)",
  accepts: ["domain"],
  budget: 1,
  run,
};
