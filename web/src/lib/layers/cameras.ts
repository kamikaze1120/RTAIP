import { fetchJson } from "../http";
import { collection, validLonLat, type GeoCollection, type GeoFeature } from "./geo";

export const CAMERA_REGIONS = ["london", "newyork", "california", "singapore"] as const;
export type CameraRegion = (typeof CAMERA_REGIONS)[number];

export function isCameraRegion(v: string): v is CameraRegion {
  return (CAMERA_REGIONS as readonly string[]).includes(v);
}

function cam(region: CameraRegion, operator: string, id: string, title: string, lat: number, lon: number, imageUrl: string, extra: Record<string, unknown> = {}): GeoFeature | null {
  if (!validLonLat(lon, lat) || !/^https:\/\//.test(imageUrl)) return null;
  return {
    type: "Feature",
    id: `${region}:${id}`,
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      id: `cam:${region}:${id}`,
      layer: "cameras",
      title,
      severity: 0.1,
      time: null,
      source: operator,
      detail: operator,
      imageUrl,
      region,
      ...extra,
    },
  };
}

interface TflPlace {
  id: string;
  commonName: string;
  lat: number;
  lon: number;
  additionalProperties?: Array<{ key: string; value: string }>;
}

export function normalizeTfl(list: TflPlace[]): GeoCollection {
  const out: GeoFeature[] = [];
  for (const p of list) {
    const props = new Map((p.additionalProperties ?? []).map((a) => [a.key, a.value]));
    if (props.get("available") === "false") continue;
    const f = cam("london", "Transport for London", p.id, p.commonName, p.lat, p.lon, props.get("imageUrl") ?? "", { videoUrl: props.get("videoUrl") ?? null, view: props.get("view") ?? null });
    if (f) out.push(f);
  }
  return collection(out);
}

interface NycCamera {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  area?: string;
  isOnline?: string | boolean;
  imageUrl: string;
}

export function normalizeNyc(list: NycCamera[]): GeoCollection {
  const out: GeoFeature[] = [];
  for (const c of list) {
    if (String(c.isOnline) === "false") continue;
    const f = cam("newyork", "NYC DOT", c.id, c.name, c.latitude, c.longitude, c.imageUrl, { area: c.area ?? null });
    if (f) out.push(f);
  }
  return collection(out);
}

interface CaltransRow {
  cctv: {
    index: string;
    inService?: string;
    location: { district: string; locationName: string; nearbyPlace?: string; longitude: string; latitude: string; route?: string; direction?: string };
    imageData: { streamingVideoURL?: string; static?: { currentImageURL?: string } };
  };
}

export function normalizeCaltrans(rows: CaltransRow[]): GeoCollection {
  const out: GeoFeature[] = [];
  for (const r of rows) {
    const c = r.cctv;
    if (!c || c.inService === "false") continue;
    const image = c.imageData?.static?.currentImageURL ?? "";
    const f = cam("california", "Caltrans", `${c.location.district}-${c.index}`, c.location.locationName, Number(c.location.latitude), Number(c.location.longitude), image, {
      route: c.location.route ?? null,
      direction: c.location.direction ?? null,
      videoUrl: c.imageData?.streamingVideoURL ?? null,
    });
    if (f) out.push(f);
  }
  return collection(out);
}

interface SgItem {
  cameras: Array<{ camera_id: string; image: string; location: { latitude: number; longitude: number }; timestamp?: string }>;
}

export function normalizeSingapore(data: { items?: SgItem[] }): GeoCollection {
  const out: GeoFeature[] = [];
  for (const c of data.items?.[0]?.cameras ?? []) {
    const f = cam("singapore", "Land Transport Authority Singapore", c.camera_id, `Camera ${c.camera_id}`, c.location.latitude, c.location.longitude, c.image, { time: c.timestamp });
    if (f) {
      f.properties.time = c.timestamp ?? null;
      out.push(f);
    }
  }
  return collection(out);
}

async function fetchCaltrans(signal?: AbortSignal): Promise<GeoCollection> {
  const districts = Array.from({ length: 12 }, (_, i) => i + 1);
  const features: GeoFeature[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < districts.length) {
      const d = districts[cursor++] as number;
      const nn = String(d).padStart(2, "0");
      try {
        const data = await fetchJson<{ data?: CaltransRow[] }>(`https://cwwp2.dot.ca.gov/data/d${d}/cctv/cctvStatusD${nn}.json`, { signal, timeoutMs: 20_000 });
        features.push(...normalizeCaltrans(data.data ?? []).features);
      } catch {
        // A district that is down should not hide the others.
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (features.length === 0) throw new Error("no California cameras available");
  return collection(features);
}

export async function fetchCameras(region: CameraRegion, signal?: AbortSignal): Promise<GeoCollection> {
  switch (region) {
    case "london":
      return normalizeTfl(await fetchJson<TflPlace[]>("https://api.tfl.gov.uk/Place/Type/JamCam", { signal, timeoutMs: 20_000 }));
    case "newyork":
      return normalizeNyc(await fetchJson<NycCamera[]>("https://webcams.nyctmc.org/api/cameras", { signal, timeoutMs: 20_000 }));
    case "singapore":
      return normalizeSingapore(await fetchJson("https://api.data.gov.sg/v1/transport/traffic-images", { signal, timeoutMs: 15_000 }));
    case "california":
      return fetchCaltrans(signal);
  }
}
