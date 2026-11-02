import type { Entity } from "./types";
import type { Snapshot } from "./useInvestigation";

/** STIX 2.1 export. Maps RTAIP entities to Cyber-observable Objects (SCOs) and
 *  Domain Objects (SDOs), and edges to Relationship Objects (SROs), wrapped in a
 *  bundle. Observable-only, public-source intelligence — no sightings or actors. */

export interface StixObject {
  type: string;
  id: string;
  [key: string]: unknown;
}

export interface StixBundle {
  type: "bundle";
  id: string;
  objects: StixObject[];
}

/** Deterministic, syntactically valid v4-shaped UUID derived from a seed, so the
 *  same entity always yields the same STIX id and relationships line up. */
function uuidFrom(seed: string): string {
  const fnv = (salt: number): string => {
    let h = (2166136261 ^ salt) >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  };
  const s = fnv(1) + fnv(2) + fnv(3) + fnv(4); // 32 hex chars
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-8${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

/** The STIX object type an entity maps to, or null if it has no clean mapping. */
function stixTypeFor(entity: Entity): string | null {
  switch (entity.type) {
    case "domain":
    case "subdomain":
    case "nameserver":
    case "mailserver":
      return "domain-name";
    case "ip":
      return entity.value.includes(":") ? "ipv6-addr" : "ipv4-addr";
    case "email":
      return "email-addr";
    case "asn":
      return "autonomous-system";
    case "cert":
      return "x509-certificate";
    case "org":
      return "identity";
    case "location":
      return "location";
    default:
      return null;
  }
}

function stixId(entity: Entity): string | null {
  const t = stixTypeFor(entity);
  return t ? `${t}--${uuidFrom(entity.id)}` : null;
}

/** Build the type-specific STIX properties for one entity. */
function stixProps(entity: Entity, type: string, now: string): Record<string, unknown> {
  switch (type) {
    case "domain-name":
    case "ipv4-addr":
    case "ipv6-addr":
    case "email-addr":
      return { value: entity.value };
    case "autonomous-system":
      return { number: Number(entity.value.replace(/[^0-9]/g, "")) || 0, name: entity.label !== entity.value ? entity.label : undefined };
    case "x509-certificate":
      return { serial_number: entity.value };
    case "identity":
      return { spec_version: "2.1", created: now, modified: now, name: entity.label, identity_class: "organization" };
    case "location":
      return entity.geo ? { spec_version: "2.1", created: now, modified: now, name: entity.label, latitude: entity.geo.lat, longitude: entity.geo.lon } : { spec_version: "2.1", created: now, modified: now, name: entity.label };
    default:
      return {};
  }
}

/** Sanitize an edge type into a STIX relationship_type (lowercase, hyphenated). */
function relationshipType(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "related-to";
}

export function toStixBundle(snap: Snapshot, now: string = new Date().toISOString()): StixBundle {
  const objects: StixObject[] = [];
  const idByEntity = new Map<string, string>();

  for (const entity of snap.entities) {
    const type = stixTypeFor(entity);
    const id = stixId(entity);
    if (!type || !id) continue;
    idByEntity.set(entity.id, id);
    objects.push({ type, id, ...stixProps(entity, type, now) });
  }

  for (const edge of snap.edges) {
    const source = idByEntity.get(edge.source);
    const target = idByEntity.get(edge.target);
    if (!source || !target) continue;
    objects.push({
      type: "relationship",
      spec_version: "2.1",
      id: `relationship--${uuidFrom(edge.id)}`,
      created: now,
      modified: now,
      relationship_type: relationshipType(edge.type),
      source_ref: source,
      target_ref: target,
    });
  }

  return { type: "bundle", id: `bundle--${uuidFrom(`bundle:${snap.seeds[0] ?? ""}:${now}`)}`, objects };
}
