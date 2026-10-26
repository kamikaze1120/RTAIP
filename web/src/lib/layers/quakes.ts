import { fetchJson } from "../http";
import { clamp01, collection, validLonLat, type GeoCollection, type GeoFeature } from "./geo";

const URL_DAY = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const URL_WEEK_M25 = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";

interface UsgsFeature {
  id: string;
  geometry: { coordinates: [number, number, number] };
  properties: { mag: number | null; place: string | null; time: number; url?: string; tsunami?: number; alert?: string | null; felt?: number | null; sig?: number };
}

export function normalizeQuakes(data: { features?: UsgsFeature[] }): GeoCollection {
  const features: GeoFeature[] = [];
  for (const f of data.features ?? []) {
    const [lon, lat, depth] = f.geometry?.coordinates ?? [];
    if (!validLonLat(lon, lat)) continue;
    const mag = f.properties.mag ?? 0;
    features.push({
      type: "Feature",
      id: f.id,
      geometry: { type: "Point", coordinates: [lon, lat as number] },
      properties: {
        id: `usgs:${f.id}`,
        layer: "quakes",
        title: `M${mag.toFixed(1)} ${f.properties.place ?? "Unknown location"}`,
        severity: clamp01(mag / 8),
        time: new Date(f.properties.time).toISOString(),
        source: "USGS Earthquake Hazards Program",
        url: f.properties.url,
        detail: `Depth ${Number(depth ?? 0).toFixed(0)} km${f.properties.tsunami ? ", tsunami flag set" : ""}${f.properties.alert ? `, PAGER ${f.properties.alert}` : ""}`,
        magnitude: mag,
        depthKm: depth,
      },
    });
  }
  return collection(features);
}

export async function fetchQuakes(signal?: AbortSignal): Promise<GeoCollection> {
  const [day, week] = await Promise.all([
    fetchJson<{ features?: UsgsFeature[] }>(URL_DAY, { signal, timeoutMs: 10_000 }),
    fetchJson<{ features?: UsgsFeature[] }>(URL_WEEK_M25, { signal, timeoutMs: 10_000 }).catch(() => ({ features: [] as UsgsFeature[] })),
  ]);
  const merged = new Map<string, UsgsFeature>();
  for (const f of [...(week.features ?? []), ...(day.features ?? [])]) merged.set(f.id, f);
  return normalizeQuakes({ features: [...merged.values()] });
}
