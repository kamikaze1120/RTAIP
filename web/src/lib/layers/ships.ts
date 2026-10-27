import { fetchJson } from "../http";
import { collection, validLonLat, type GeoCollection, type GeoFeature } from "./geo";

const URL_LOCATIONS = "https://meri.digitraffic.fi/api/ais/v1/locations";
const URL_VESSELS = "https://meri.digitraffic.fi/api/ais/v1/vessels";
const MAX_SHIPS = 4000;

interface AisFeature {
  mmsi?: number;
  geometry?: { coordinates?: [number, number] };
  properties?: { mmsi?: number; sog?: number; cog?: number; navStat?: number; heading?: number; timestampExternal?: number };
}
export interface VesselMeta {
  mmsi: number;
  name?: string;
  shipType?: number;
  destination?: string;
  callSign?: string;
  imo?: number;
}

const NAV_STATUS: Record<number, string> = {
  0: "Under way using engine",
  1: "At anchor",
  2: "Not under command",
  3: "Restricted manoeuvrability",
  4: "Constrained by draught",
  5: "Moored",
  6: "Aground",
  7: "Engaged in fishing",
  8: "Under way sailing",
};

export function shipTypeLabel(code: number | undefined): string {
  if (code === undefined) return "Vessel";
  if (code >= 80 && code <= 89) return "Tanker";
  if (code >= 70 && code <= 79) return "Cargo ship";
  if (code >= 60 && code <= 69) return "Passenger ship";
  if (code === 30) return "Fishing vessel";
  if (code === 35) return "Military vessel";
  if (code === 36 || code === 37) return "Pleasure craft";
  if (code >= 31 && code <= 32) return "Tug";
  if (code === 52) return "Tug";
  if (code === 51) return "Search and rescue";
  if (code === 55) return "Law enforcement";
  return "Vessel";
}

export function normalizeShips(data: { features?: AisFeature[] }, meta: Map<number, VesselMeta> = new Map()): GeoCollection {
  const features: GeoFeature[] = [];
  for (const f of data.features ?? []) {
    const [lon, lat] = f.geometry?.coordinates ?? [];
    const p = f.properties ?? {};
    const mmsi = p.mmsi ?? f.mmsi;
    if (mmsi === undefined || typeof lon !== "number" || typeof lat !== "number" || !validLonLat(lon, lat)) continue;
    const m = meta.get(mmsi);
    const knots = typeof p.sog === "number" ? p.sog : null;
    const kind = shipTypeLabel(m?.shipType);
    features.push({
      type: "Feature",
      id: String(mmsi),
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        id: `ais:${mmsi}`,
        layer: "ships",
        title: m?.name?.trim() || `MMSI ${mmsi}`,
        severity: m?.shipType === 35 ? 0.6 : 0.1,
        time: p.timestampExternal ? new Date(p.timestampExternal).toISOString() : null,
        source: "Digitraffic AIS (Finnish Transport Infrastructure Agency)",
        detail: [kind, knots !== null ? `${knots.toFixed(1)} kn` : null, m?.destination ? `to ${m.destination.trim()}` : null, p.navStat !== undefined ? NAV_STATUS[p.navStat] : null].filter(Boolean).join(", "),
        mmsi,
        speedKn: knots,
        course: p.cog ?? null,
        heading: p.heading !== undefined && p.heading !== 511 ? p.heading : (p.cog ?? null),
        shipType: m?.shipType ?? null,
        shipKind: kind,
        destination: m?.destination?.trim() || null,
        imo: m?.imo ?? null,
      },
    });
    if (features.length >= MAX_SHIPS) break;
  }
  return collection(features);
}

let metaCache: { at: number; map: Map<number, VesselMeta> } | null = null;

async function vesselMeta(signal?: AbortSignal): Promise<Map<number, VesselMeta>> {
  if (metaCache && Date.now() - metaCache.at < 6 * 3_600_000) return metaCache.map;
  try {
    const list = await fetchJson<VesselMeta[]>(URL_VESSELS, { signal, timeoutMs: 15_000 });
    const map = new Map<number, VesselMeta>();
    for (const v of list) if (typeof v.mmsi === "number") map.set(v.mmsi, v);
    metaCache = { at: Date.now(), map };
    return map;
  } catch {
    return metaCache?.map ?? new Map();
  }
}

/** Live AIS positions from the open Finnish feed. Coverage is the Baltic and northern Europe. */
export async function fetchShips(signal?: AbortSignal): Promise<GeoCollection> {
  const [data, meta] = await Promise.all([fetchJson<{ features?: AisFeature[] }>(URL_LOCATIONS, { signal, timeoutMs: 12_000 }), vesselMeta(signal)]);
  return normalizeShips(data, meta);
}
