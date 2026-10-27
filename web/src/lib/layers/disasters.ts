import { fetchJson } from "../http";
import { clamp01, collection, ringCentroid, validLonLat, type GeoCollection, type GeoFeature, type Position } from "./geo";

const URL_EVENTS = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=200";

interface EonetGeometry {
  date: string;
  type: string;
  coordinates: unknown;
  magnitudeValue?: number | null;
  magnitudeUnit?: string | null;
}
interface EonetEvent {
  id: string;
  title: string;
  link?: string;
  description?: string | null;
  categories?: Array<{ id: string; title: string }>;
  sources?: Array<{ id: string; url: string }>;
  geometry?: EonetGeometry[];
}

const CATEGORY_SEVERITY: Record<string, number> = {
  volcanoes: 0.85,
  severeStorms: 0.75,
  wildfires: 0.65,
  floods: 0.7,
  earthquakes: 0.7,
  landslides: 0.6,
  drought: 0.45,
  dustHaze: 0.35,
  seaLakeIce: 0.25,
  snow: 0.3,
  tempExtremes: 0.5,
  waterColor: 0.15,
  manmade: 0.4,
};

function pointOf(g: EonetGeometry): Position | null {
  if (g.type === "Point" && Array.isArray(g.coordinates)) {
    const [lon, lat] = g.coordinates as number[];
    return validLonLat(lon, lat) ? [lon, lat as number] : null;
  }
  if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
    const ring = (g.coordinates as Position[][])[0];
    return ring ? ringCentroid(ring) : null;
  }
  return null;
}

export function normalizeDisasters(data: { events?: EonetEvent[] }): GeoCollection {
  const features: GeoFeature[] = [];
  for (const ev of data.events ?? []) {
    const latest = [...(ev.geometry ?? [])].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
    if (!latest) continue;
    const point = pointOf(latest);
    if (!point) continue;
    const category = ev.categories?.[0];
    features.push({
      type: "Feature",
      id: ev.id,
      geometry: { type: "Point", coordinates: point },
      properties: {
        id: `eonet:${ev.id}`,
        layer: "disasters",
        title: ev.title,
        severity: clamp01(CATEGORY_SEVERITY[category?.id ?? ""] ?? 0.4),
        time: new Date(latest.date).toISOString(),
        source: "NASA EONET",
        url: ev.sources?.[0]?.url ?? ev.link,
        detail: category?.title,
        category: category?.title,
      },
    });
  }
  return collection(features);
}

const URL_GDACS = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;WF;DR&alertlevel=Orange;Red";

interface GdacsFeature {
  geometry?: { type?: string; coordinates?: number[] };
  properties?: {
    eventtype?: string;
    eventid?: number;
    episodeid?: number;
    name?: string;
    htmldescription?: string;
    alertlevel?: string;
    country?: string;
    fromdate?: string;
    url?: { report?: string };
  };
}

const GDACS_TYPE: Record<string, string> = { EQ: "Earthquake", TC: "Tropical cyclone", FL: "Flood", VO: "Volcano", WF: "Wildfire", DR: "Drought" };

export function normalizeGdacs(data: { features?: GdacsFeature[] }): GeoCollection {
  const features: GeoFeature[] = [];
  for (const f of data.features ?? []) {
    const [lon, lat] = f.geometry?.coordinates ?? [];
    const p = f.properties;
    if (!p || f.geometry?.type !== "Point" || typeof lon !== "number" || typeof lat !== "number" || !validLonLat(lon, lat)) continue;
    const level = (p.alertlevel ?? "").toLowerCase();
    features.push({
      type: "Feature",
      id: `${p.eventtype}${p.eventid}`,
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        id: `gdacs:${p.eventtype}:${p.eventid}`,
        layer: "disasters",
        title: p.name ?? "Disaster alert",
        severity: level === "red" ? 0.95 : level === "orange" ? 0.78 : 0.4,
        time: p.fromdate ? new Date(p.fromdate).toISOString() : null,
        source: "GDACS (UN and EU)",
        url: p.url?.report,
        detail: `${p.alertlevel ?? ""} alert${p.country ? `, ${p.country}` : ""}`.trim(),
        category: GDACS_TYPE[p.eventtype ?? ""] ?? p.eventtype,
      },
    });
  }
  return collection(features);
}

export async function fetchDisasters(signal?: AbortSignal): Promise<GeoCollection> {
  const [eonet, gdacs] = await Promise.allSettled([
    fetchJson<{ events?: EonetEvent[] }>(URL_EVENTS, { signal, timeoutMs: 12_000 }),
    fetchJson<{ features?: GdacsFeature[] }>(URL_GDACS, { signal, timeoutMs: 15_000 }),
  ]);
  if (eonet.status === "rejected" && gdacs.status === "rejected") throw eonet.reason;
  const features = [...(eonet.status === "fulfilled" ? normalizeDisasters(eonet.value).features : []), ...(gdacs.status === "fulfilled" ? normalizeGdacs(gdacs.value).features : [])];
  return collection(features);
}
