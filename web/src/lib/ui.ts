import type { EntityType, LayerId, RiskLevel, Severity } from "./types";

export const ENTITY_STYLE: Record<EntityType, { color: string; label: string }> = {
  domain: { color: "#38bdf8", label: "Domain" },
  subdomain: { color: "#22d3ee", label: "Subdomain" },
  ip: { color: "#f5a524", label: "IP address" },
  asn: { color: "#a78bfa", label: "Network (ASN)" },
  org: { color: "#34d399", label: "Organization" },
  email: { color: "#f472b6", label: "Email" },
  nameserver: { color: "#60a5fa", label: "Name server" },
  mailserver: { color: "#fb7185", label: "Mail server" },
  location: { color: "#facc15", label: "Location" },
  cert: { color: "#c084fc", label: "Certificate" },
};

export const SEVERITY_STYLE: Record<Severity, { color: string; label: string; rank: number }> = {
  high: { color: "#f43f5e", label: "High", rank: 3 },
  medium: { color: "#f5a524", label: "Medium", rank: 2 },
  low: { color: "#38bdf8", label: "Low", rank: 1 },
  info: { color: "#8798ad", label: "Info", rank: 0 },
};

export const RISK_STYLE: Record<RiskLevel, { color: string; label: string }> = {
  low: { color: "#34d399", label: "Low exposure" },
  guarded: { color: "#38bdf8", label: "Guarded" },
  elevated: { color: "#f5a524", label: "Elevated" },
  high: { color: "#f43f5e", label: "High exposure" },
};

export const LAYER_STYLE: Record<LayerId, { color: string; label: string }> = {
  quakes: { color: "#f5a524", label: "Earthquakes" },
  disasters: { color: "#f43f5e", label: "Natural events" },
  alerts: { color: "#a78bfa", label: "Weather alerts" },
  aircraft: { color: "#38bdf8", label: "Aircraft" },
};

export function timeAgo(iso: string | number | null | undefined, now = Date.now()): string {
  if (iso === null || iso === undefined) return "unknown";
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return "unknown";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}
