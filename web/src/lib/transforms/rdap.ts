import { fetchJson } from "../http";
import type { Transform } from "./types";

interface RdapEvent {
  eventAction: string;
  eventDate: string;
}
interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, Array<[string, unknown, string, unknown]>];
  handle?: string;
}
interface RdapDomain {
  ldhName?: string;
  status?: string[];
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: Array<{ ldhName?: string }>;
}

export function registrarName(entities: RdapEntity[] | undefined): string | null {
  const registrar = (entities ?? []).find((e) => e.roles?.includes("registrar"));
  const fn = registrar?.vcardArray?.[1]?.find((row) => row[0] === "fn");
  const value = fn?.[3];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function eventDate(events: RdapEvent[] | undefined, action: string): string | null {
  return events?.find((e) => e.eventAction === action)?.eventDate ?? null;
}

const DAY = 86_400_000;

export const rdapTransform: Transform = {
  id: "rdap",
  label: "Registration (RDAP)",
  accepts: ["domain"],
  budget: 1,
  async run(entity, ctx) {
    const url = `https://rdap.org/domain/${encodeURIComponent(entity.value)}`;
    const data = await fetchJson<RdapDomain>(url, { headers: { accept: "application/rdap+json" }, timeoutMs: 10_000, signal: ctx.signal });
    const created = eventDate(data.events, "registration");
    const expires = eventDate(data.events, "expiration");
    const updated = eventDate(data.events, "last changed");
    const registrar = registrarName(data.entities);
    const prov = { source: "RDAP", url, fetchedAt: new Date().toISOString() };

    ctx.graph.entity("domain", entity.value, {
      attrs: { registered: created, expires, lastChanged: updated, registrar, status: data.status ?? [] },
      provenance: prov,
    });
    if (registrar) {
      const org = ctx.graph.entity("org", registrar, { label: registrar, confidence: 0.9, attrs: { role: "registrar" }, provenance: prov });
      ctx.graph.edge(entity, "registered_with", org, "rdap", 0.9);
    }

    const now = Date.now();
    if (created) {
      const ageDays = Math.floor((now - Date.parse(created)) / DAY);
      if (ageDays >= 0 && ageDays < 30) {
        ctx.finding({ id: `new-domain:${entity.value}`, severity: "medium", title: "Recently registered domain", detail: `${entity.value} was registered ${ageDays} days ago. New domains are over represented in phishing and fraud.`, entityId: entity.id });
      }
    }
    if (expires) {
      const daysLeft = Math.floor((Date.parse(expires) - now) / DAY);
      if (daysLeft < 0) {
        ctx.finding({ id: `expired:${entity.value}`, severity: "high", title: "Domain registration has expired", detail: `${entity.value} expired on ${expires.slice(0, 10)}.`, entityId: entity.id });
      } else if (daysLeft <= 30) {
        ctx.finding({ id: `expiring:${entity.value}`, severity: "medium", title: "Domain expires soon", detail: `${entity.value} expires in ${daysLeft} days (${expires.slice(0, 10)}).`, entityId: entity.id });
      }
    }
    const locked = (data.status ?? []).some((s) => /transfer prohibited/i.test(s));
    if (data.status && !locked) {
      ctx.finding({ id: `no-lock:${entity.value}`, severity: "low", title: "No transfer lock", detail: `${entity.value} does not show a client transfer prohibited status, which makes unauthorized transfer easier.`, entityId: entity.id });
    }
  },
};
