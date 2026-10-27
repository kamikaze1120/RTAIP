import { cached } from "../cache";
import type { LayerId } from "../types";
import { bboxCircle, fetchAircraft, MAX_VIEW_RADIUS_NM, parseBbox } from "./aircraft";
import { fetchAlerts } from "./alerts";
import { fetchAurora } from "./aurora";
import { CAMERA_REGIONS, fetchCameras, isCameraRegion } from "./cameras";
import { fetchCyber } from "./cyber";
import { fetchDisasters } from "./disasters";
import { fetchFires } from "./fires";
import type { GeoCollection } from "./geo";
import { fetchMilitary } from "./military";
import { fetchQuakes } from "./quakes";
import { fetchShips } from "./ships";
import { portFeatures, zoneFeatures } from "./zones";

export const LAYERS: Record<LayerId, { label: string; ttlMs: number; source: string }> = {
  quakes: { label: "Earthquakes", ttlMs: 60_000, source: "USGS" },
  disasters: { label: "Natural events", ttlMs: 600_000, source: "NASA EONET" },
  alerts: { label: "Weather alerts", ttlMs: 300_000, source: "US NWS" },
  aircraft: { label: "Aircraft", ttlMs: 15_000, source: "Community ADS-B" },
  military: { label: "Military aircraft", ttlMs: 20_000, source: "Community ADS-B" },
  ships: { label: "Ships", ttlMs: 60_000, source: "Digitraffic AIS" },
  cameras: { label: "Cameras", ttlMs: 2 * 3_600_000, source: "Public traffic camera feeds" },
  fires: { label: "Fires", ttlMs: 30 * 60_000, source: "NASA FIRMS" },
  aurora: { label: "Aurora", ttlMs: 10 * 60_000, source: "NOAA SWPC" },
  cyber: { label: "Cyber threats", ttlMs: 30 * 60_000, source: "abuse.ch" },
  zones: { label: "Conflict zones", ttlMs: 3_600_000, source: "RTAIP editorial list" },
  ports: { label: "Ports and chokepoints", ttlMs: 3_600_000, source: "RTAIP reference data" },
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
    case "military":
      load = () => fetchMilitary(signal);
      break;
    case "ships":
      load = () => fetchShips(signal);
      break;
    case "fires":
      load = () => fetchFires(signal);
      break;
    case "aurora":
      load = () => fetchAurora(signal);
      break;
    case "cyber":
      load = () => fetchCyber(signal);
      break;
    case "zones":
      load = async () => zoneFeatures();
      break;
    case "ports":
      load = async () => portFeatures();
      break;
    case "cameras": {
      const src = params.get("src") ?? "";
      if (!isCameraRegion(src)) throw new RangeError(`src must be one of ${CAMERA_REGIONS.join(", ")}`);
      key = `cameras:${src}`;
      load = () => fetchCameras(src, signal);
      break;
    }
  }
  const res = await cached(key, ttlMs, load);
  return { layer, fetchedAt: new Date(res.fetchedAt).toISOString(), stale: res.stale, count: res.value.features.length, data: res.value };
}
