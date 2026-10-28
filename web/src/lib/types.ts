export type EntityType =
  | "domain"
  | "subdomain"
  | "ip"
  | "asn"
  | "org"
  | "email"
  | "nameserver"
  | "mailserver"
  | "location"
  | "cert";

export type SeedType = "domain" | "ip" | "email" | "org";

export interface Provenance {
  source: string;
  url?: string;
  fetchedAt: string;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Entity {
  id: string;
  type: EntityType;
  value: string;
  label: string;
  confidence: number;
  attrs: Record<string, unknown>;
  provenance: Provenance[];
  geo?: GeoPoint;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  type: string;
  connector: string;
  confidence: number;
}

export type Severity = "info" | "low" | "medium" | "high";

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  entityId?: string;
}

export type TransformStatus = "start" | "done" | "skipped" | "error";

export type StreamEvent =
  | { kind: "entity"; entity: Entity }
  | { kind: "edge"; edge: Edge }
  | { kind: "finding"; finding: Finding }
  | { kind: "progress"; transform: string; target: string; status: TransformStatus; message?: string }
  | { kind: "done"; score: number; level: RiskLevel; summary: string; entities: number; edges: number };

export type RiskLevel = "low" | "guarded" | "elevated" | "high";

export type LayerId = "quakes" | "disasters" | "alerts" | "aircraft" | "military" | "ships" | "cameras" | "fires" | "aurora" | "cyber" | "zones" | "ports";

export interface GeoEventProps {
  id: string;
  layer: LayerId;
  title: string;
  severity: number; // 0 to 1
  time: string | null; // ISO
  source: string;
  url?: string;
  detail?: string;
  [key: string]: unknown;
}
