import { cached } from "../cache";
import type { LayerId } from "../types";
import { bboxCircle, fetchAircraft, MAX_VIEW_RADIUS_NM, parseBbox } from "./aircraft";
import { fetchAlerts } from "./alerts";
import { fetchDisasters } from "./disasters";
import type { GeoCollection } from "./geo";
import { fetchQuakes } from "./quakes";

export const LAYERS: Record<LayerId, { label: string; ttlMs: number; source: string }> = {
  quakes: { label: "Earthquakes", ttlMs: 60_000, source: "USGS" },
  disasters: { label: "Natural events", ttlMs: 600_000, source: "NASA EONET" },
  alerts: { label: "Weather alerts", ttlMs: 300_000, source: "US NWS" },
  aircraft: { label: "Aircraft", ttlMs: 15_000, source: "Community ADS-B" },
};

export function isLayerId(value: string): value is LayerId {
  return value in LAYERS;
}

export interface LayerResult {
  layer: LayerId;
  fetchedAt: string;
  stale: boolean;
  count: number;
  data: GeoCollection;
}

const round = (n: number, step: number): number => Math.round(n / step) * step;

export async function getLayer(layer: LayerId, params: URLSearchParams, signal?: AbortSignal): Promise<LayerResult> {
  const { ttlMs } = LAYERS[layer];
  let key: string = layer;
  let load: () => Promise<GeoCollection>;
  switch (layer) {
    case "quakes":
      load = () => fetchQuakes(signal);
      break;
    case "disasters":
      load = () => fetchDisasters(signal);
      break;
    case "alerts":
      load = () => fetchAlerts(signal);
      break;
    case "aircraft": {
      const bbox = parseBbox(params);
      if (!bbox) throw new RangeError("aircraft needs south, west, north and east");
      if (bboxCircle(bbox).radiusNm > MAX_VIEW_RADIUS_NM) throw new RangeError("area too large, zoom in");
      const snapped = { south: round(bbox.south, 0.5), west: round(bbox.west, 0.5), north: round(bbox.north, 0.5), east: round(bbox.east, 0.5) };
      key = `aircraft:${snapped.south}:${snapped.west}:${snapped.north}:${snapped.east}`;
      load = () => fetchAircraft(snapped, signal);
      break;
    }
  }
  const res = await cached(key, ttlMs, load);
  return { layer, fetchedAt: new Date(res.fetchedAt).toISOString(), stale: res.stale, count: res.value.features.length, data: res.value };
}
