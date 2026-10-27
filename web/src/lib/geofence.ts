import type { GeoFeature } from "./layers/geo";
import type { LayerId } from "./types";

export interface Area {
  id: string;
  name: string;
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface AreaAlert {
  id: string;
  areaId: string;
  areaName: string;
  layer: LayerId;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
}

export function normalizeArea(a: { name?: string; lon1: number; lat1: number; lon2: number; lat2: number }): Area {
  const west = Math.min(a.lon1, a.lon2);
  const east = Math.max(a.lon1, a.lon2);
  const south = Math.min(a.lat1, a.lat2);
  const north = Math.max(a.lat1, a.lat2);
  return { id: `${west.toFixed(3)}:${south.toFixed(3)}:${east.toFixed(3)}:${north.toFixed(3)}`, name: a.name?.trim() || `Area ${south.toFixed(1)}, ${west.toFixed(1)}`, west, south, east, north };
}

export function inArea(a: Area, lon: number, lat: number): boolean {
  return lon >= a.west && lon <= a.east && lat >= a.south && lat <= a.north;
}

export function pointOf(f: GeoFeature): [number, number] | null {
  return f.geometry.type === "Point" ? f.geometry.coordinates : null;
}

export function countByLayer(a: Area, layers: Partial<Record<LayerId, GeoFeature[]>>): Partial<Record<LayerId, number>> {
  const out: Partial<Record<LayerId, number>> = {};
  for (const [id, features] of Object.entries(layers) as Array<[LayerId, GeoFeature[]]>) {
    let n = 0;
    for (const f of features) {
      const p = pointOf(f);
      if (p && inArea(a, p[0], p[1])) n++;
    }
    if (n > 0) out[id] = n;
  }
  return out;
}

export function featuresInArea(a: Area, features: GeoFeature[]): GeoFeature[] {
  return features.filter((f) => {
    const p = pointOf(f);
    return p ? inArea(a, p[0], p[1]) : false;
  });
}

/** Events inside watched areas that deserve attention. Ids are stable so each alert fires once. */
export function evaluateGeofences(areas: Area[], layers: Partial<Record<LayerId, GeoFeature[]>>): AreaAlert[] {
  const out: AreaAlert[] = [];
  for (const area of areas) {
    for (const f of layers.aircraft ?? []) {
      const p = pointOf(f);
      if (p && inArea(area, p[0], p[1]) && f.properties.emergency) out.push({ id: `${area.id}:${f.properties.id}`, areaId: area.id, areaName: area.name, layer: "aircraft", severity: "critical", title: `Aircraft emergency: ${f.properties.title}`, detail: String(f.properties.detail ?? "") });
    }
    for (const f of layers.military ?? []) {
      const p = pointOf(f);
      if (p && inArea(area, p[0], p[1])) out.push({ id: `${area.id}:${f.properties.id}`, areaId: area.id, areaName: area.name, layer: "military", severity: f.properties.emergency ? "critical" : "info", title: `Military aircraft: ${f.properties.title}`, detail: String(f.properties.detail ?? "") });
    }
    for (const f of layers.quakes ?? []) {
      const p = pointOf(f);
      const mag = Number(f.properties.magnitude);
      if (p && inArea(area, p[0], p[1]) && mag >= 4) out.push({ id: `${area.id}:${f.properties.id}`, areaId: area.id, areaName: area.name, layer: "quakes", severity: mag >= 5.5 ? "critical" : "warn", title: f.properties.title, detail: String(f.properties.detail ?? "") });
    }
    for (const f of layers.disasters ?? []) {
      const p = pointOf(f);
      if (p && inArea(area, p[0], p[1]) && f.properties.severity >= 0.75) out.push({ id: `${area.id}:${f.properties.id}`, areaId: area.id, areaName: area.name, layer: "disasters", severity: "warn", title: f.properties.title, detail: String(f.properties.detail ?? "") });
    }
    for (const f of layers.cyber ?? []) {
      const p = pointOf(f);
      if (p && inArea(area, p[0], p[1]) && f.properties.online) out.push({ id: `${area.id}:${f.properties.id}`, areaId: area.id, areaName: area.name, layer: "cyber", severity: "warn", title: f.properties.title, detail: String(f.properties.detail ?? "") });
    }
  }
  return out;
}
