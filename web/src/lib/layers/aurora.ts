import { fetchJson } from "../http";
import { collection, type GeoCollection, type GeoFeature } from "./geo";

const URL_AURORA = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";

/** NOAA OVATION model grid as points. Strength is a probability from 0 to 100. */
export function normalizeAurora(data: { coordinates?: Array<[number, number, number]>; "Forecast Time"?: string }): GeoCollection {
  const forecast = data["Forecast Time"] ? new Date(data["Forecast Time"]).toISOString() : null;
  const features: GeoFeature[] = [];
  for (const [lonRaw, lat, strength] of data.coordinates ?? []) {
    if (!(strength >= 12)) continue;
    const lon = lonRaw > 180 ? lonRaw - 360 : lonRaw;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        id: `aurora:${lon}:${lat}`,
        layer: "aurora",
        title: `Aurora probability ${strength}%`,
        severity: Math.min(1, strength / 60),
        time: forecast,
        source: "NOAA SWPC OVATION",
        detail: "Modelled chance of visible aurora",
        probability: strength,
      },
    });
  }
  return collection(features);
}

export async function fetchAurora(signal?: AbortSignal): Promise<GeoCollection> {
  return normalizeAurora(await fetchJson(URL_AURORA, { signal, timeoutMs: 15_000 }));
}
