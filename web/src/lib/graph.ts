import type { Edge, Entity, EntityType, GeoPoint, Provenance, StreamEvent } from "./types";

export const entityId = (type: EntityType, value: string): string => `${type}:${value.trim().toLowerCase()}`;
export const edgeId = (source: string, type: string, target: string): string => `${source}|${type}|${target}`;

export interface EntityOptions {
  label?: string;
  confidence?: number;
  attrs?: Record<string, unknown>;
  geo?: GeoPoint;
  provenance?: Provenance;
}

export class GraphBuilder {
  readonly entities = new Map<string, Entity>();
  readonly edges = new Map<string, Edge>();

  constructor(private readonly emit: (event: StreamEvent) => void = () => {}) {}

  entity(type: EntityType, value: string, opts: EntityOptions = {}): Entity {
    const id = entityId(type, value);
    const existing = this.entities.get(id);
    if (!existing) {
      const created: Entity = {
        id,
        type,
        value: value.trim().toLowerCase(),
        label: opts.label ?? value.trim(),
        confidence: opts.confidence ?? 0.7,
        attrs: { ...(opts.attrs ?? {}) },
        provenance: opts.provenance ? [opts.provenance] : [],
        geo: opts.geo,
      };
      this.entities.set(id, created);
      this.emit({ kind: "entity", entity: created });
      return created;
    }
    let changed = false;
    for (const [k, v] of Object.entries(opts.attrs ?? {})) {
      if (JSON.stringify(existing.attrs[k]) !== JSON.stringify(v)) {
        existing.attrs[k] = v;
        changed = true;
      }
    }
    if (opts.geo && !existing.geo) {
      existing.geo = opts.geo;
      changed = true;
    }
    if (opts.confidence && opts.confidence > existing.confidence) {
      existing.confidence = opts.confidence;
      changed = true;
    }
    if (opts.provenance && !existing.provenance.some((p) => p.source === opts.provenance!.source && p.url === opts.provenance!.url)) {
      existing.provenance.push(opts.provenance);
      changed = true;
    }
    if (changed) this.emit({ kind: "entity", entity: existing });
    return existing;
  }

  edge(source: Entity, type: string, target: Entity, connector: string, confidence = 0.7): Edge | null {
    if (source.id === target.id) return null;
    const id = edgeId(source.id, type, target.id);
    const existing = this.edges.get(id);
    if (existing) return existing;
    const edge: Edge = { id, source: source.id, target: target.id, type, connector, confidence };
    this.edges.set(id, edge);
    this.emit({ kind: "edge", edge });
    return edge;
  }
}
