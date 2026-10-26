import { fetchJson } from "../http";
import type { Transform } from "./types";

interface IpWhoIs {
  success: boolean;
  message?: string;
  ip: string;
  type?: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  connection?: { asn?: number; org?: string; isp?: string; domain?: string };
}

export const ipGeoTransform: Transform = {
  id: "ipgeo",
  label: "IP network and location",
  accepts: ["ip"],
  budget: 40,
  async run(entity, ctx) {
    const url = `https://ipwho.is/${encodeURIComponent(entity.value)}`;
    const data = await fetchJson<IpWhoIs>(url, { timeoutMs: 8000, signal: ctx.signal });
    if (!data.success) throw new Error(data.message ?? "lookup failed");
    const prov = { source: "ipwho.is", url, fetchedAt: new Date().toISOString() };
    const hasGeo = typeof data.latitude === "number" && typeof data.longitude === "number";
    const geo = hasGeo ? { lat: data.latitude as number, lon: data.longitude as number } : undefined;

    const ip = ctx.graph.entity("ip", entity.value, {
      geo,
      attrs: { country: data.country, countryCode: data.country_code, region: data.region, city: data.city, ipVersion: data.type },
      provenance: prov,
    });

    const conn = data.connection;
    if (conn?.asn) {
      const asn = ctx.graph.entity("asn", `AS${conn.asn}`, { label: `AS${conn.asn}`, confidence: 0.9, attrs: { org: conn.org }, provenance: prov });
      ctx.graph.edge(ip, "announced_by", asn, "ipgeo", 0.9);
      const orgName = conn.org || conn.isp;
      if (orgName) {
        const org = ctx.graph.entity("org", orgName, { label: orgName, confidence: 0.8, attrs: { role: "network operator" }, provenance: prov });
        ctx.graph.edge(asn, "operated_by", org, "ipgeo", 0.8);
      }
    }
    if (hasGeo && (data.city || data.country)) {
      const label = [data.city, data.country].filter(Boolean).join(", ");
      const loc = ctx.graph.entity("location", `${(data.latitude as number).toFixed(2)},${(data.longitude as number).toFixed(2)}`, {
        label,
        confidence: 0.6,
        geo,
        attrs: { country: data.country, accuracy: "city level estimate" },
        provenance: prov,
      });
      ctx.graph.edge(ip, "located_in", loc, "ipgeo", 0.6);
    }
  },
};
