import { fetchJson } from "../http";
import { collection, type GeoCollection, type GeoFeature } from "./geo";

const URL_ALERTS = "https://api.weather.gov/alerts/active?status=actual&message_type=alert";

interface NwsFeature {
  id: string;
  geometry: { type: string; coordinates: unknown } | null;
  properties: {
    id?: string;
    event?: string;
    headline?: string;
    severity?: string;
    areaDesc?: string;
    effective?: string;
    expires?: string;
    sent?: string;
    web?: string;
  };
}

const SEVERITY: Record<string, number> = { Extreme: 1, Severe: 0.8, Moderate: 0.55, Minor: 0.3, Unknown: 0.25 };

export function normalizeAlerts(data: { features?: NwsFeature[] }): GeoCollection {
  const features: GeoFeature[] = [];
  for (const f of data.features ?? []) {
    const g = f.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue; // zone based alerts carry no geometry
    const p = f.properties;
    features.push({
      type: "Feature",
      id: f.id,
      geometry: { type: g.type, coordinates: g.coordinates },
      properties: {
        id: `nws:${p.id ?? f.id}`,
        layer: "alerts",
        title: p.event ?? "Weather alert",
        severity: SEVERITY[p.severity ?? "Unknown"] ?? 0.25,
        time: p.effective ?? p.sent ?? null,
        source: "US National Weather Service",
        url: p.web,
        detail: p.headline ?? p.areaDesc,
        expires: p.expires,
        area: p.areaDesc,
      },
    });
  }
  return collection(features);
}

export async function fetchAlerts(signal?: AbortSignal): Promise<GeoCollection> {
  return normalizeAlerts(await fetchJson<{ features?: NwsFeature[] }>(URL_ALERTS, { signal, timeoutMs: 15_000, headers: { accept: "application/geo+json" } }));
}
