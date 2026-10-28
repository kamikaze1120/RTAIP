import { fetchJson, fetchText } from "../http";
import { collection, validLonLat, type GeoCollection, type GeoFeature } from "./geo";

export const CAMERA_REGIONS = ["london", "newyork", "california", "singapore", "newzealand", "finland", "hongkong", "seattle"] as const;
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

interface FinlandStation {
  geometry?: { coordinates?: number[] };
  properties?: { id?: string; name?: string; presets?: Array<{ id?: string; inCollection?: boolean }> };
}

export function normalizeFinland(data: { features?: FinlandStation[] }): GeoCollection {
  const out: GeoFeature[] = [];
  for (const s of data.features ?? []) {
    const presets = s.properties?.presets ?? [];
    const preset = presets.find((p) => p.inCollection && p.id) ?? presets.find((p) => p.id);
    const coords = s.geometry?.coordinates;
    const id = s.properties?.id;
    if (!preset?.id || !id || !coords || coords.length < 2) continue;
    const [lon, lat] = coords as [number, number];
    const title = (s.properties?.name ?? id).replace(/_/g, " ");
    const f = cam("finland", "Fintraffic / Digitraffic", id, title, lat, lon, `https://weathercam.digitraffic.fi/${preset.id}.jpg`);
    if (f) out.push(f);
  }
  return collection(out);
}

/** Pull the first occurrence of a simple, non-nested XML element's text. */
function xmlField(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m?.[1]?.trim() ?? null;
}

export function normalizeNz(xml: string): GeoCollection {
  const out: GeoFeature[] = [];
  for (const raw of xml.split("<camera>").slice(1)) {
    const block = raw.split("</camera>")[0] ?? "";
    if (xmlField(block, "offline") === "true" || xmlField(block, "underMaintenance") === "true") continue;
    const id = xmlField(block, "id");
    const image = xmlField(block, "imageUrl");
    if (!id || !image) continue;
    const lat = Number(xmlField(block, "latitude"));
    const lon = Number(xmlField(block, "longitude"));
    const title = xmlField(block, "description") ?? `Camera ${id}`;
    const f = cam("newzealand", "NZ Transport Agency (Waka Kotahi)", id, title, lat, lon, `https://trafficnz.info${image}`, {
      direction: xmlField(block, "direction"),
      highway: xmlField(block, "highway"),
    });
    if (f) out.push(f);
  }
  return collection(out);
}

/** Split one CSV/TSV line, honoring simple double-quoted fields. */
function splitRow(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === sep && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function normalizeHongKong(csv: string): GeoCollection {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return collection([]);
  const sep = lines[0]!.includes("\t") ? "\t" : ",";
  const header = splitRow(lines[0]!, sep).map((h) => h.toLowerCase());
  const col = (row: string[], name: string): string => row[header.indexOf(name)] ?? "";
  const out: GeoFeature[] = [];
  for (const line of lines.slice(1)) {
    const row = splitRow(line, sep);
    const f = cam(
      "hongkong",
      "HK Transport Department",
      col(row, "key"),
      col(row, "description") || `Camera ${col(row, "key")}`,
      Number(col(row, "latitude")),
      Number(col(row, "longitude")),
      col(row, "url"),
      { district: col(row, "district") || null, area: col(row, "region") || null },
    );
    if (f) out.push(f);
  }
  return collection(out);
}

interface SeattleData {
  Features?: Array<{ PointCoordinate?: [number, number]; Cameras?: Array<{ Id?: string; Description?: string; ImageUrl?: string; Type?: string }> }>;
}

export function normalizeSeattle(data: SeattleData): GeoCollection {
  const out: GeoFeature[] = [];
  for (const feature of data.Features ?? []) {
    const [lat, lon] = feature.PointCoordinate ?? [NaN, NaN];
    for (const c of feature.Cameras ?? []) {
      if (!c.Id || !c.ImageUrl) continue;
      const image = /^https?:\/\//.test(c.ImageUrl) ? c.ImageUrl : c.Type === "sdot" ? `https://www.seattle.gov/trafficcams/images/${c.ImageUrl}` : "";
      const f = cam("seattle", c.Type === "wsdot" ? "WSDOT" : "Seattle DOT", c.Id, c.Description ?? `Camera ${c.Id}`, lat, lon, image);
      if (f) out.push(f);
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
    case "newzealand":
      return normalizeNz(await fetchText("https://trafficnz.info/service/traffic/rest/4/cameras/all", { signal, timeoutMs: 20_000 }));
    case "finland":
      return normalizeFinland(await fetchJson("https://tie.digitraffic.fi/api/weathercam/v1/stations", { signal, timeoutMs: 20_000 }));
    case "hongkong":
      return normalizeHongKong(await fetchText("https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.csv", { signal, timeoutMs: 20_000 }));
    case "seattle":
      return normalizeSeattle(await fetchJson("https://web.seattle.gov/Travelers/api/Map/Data?zoomId=13&type=2", { signal, timeoutMs: 20_000 }));
  }
}
