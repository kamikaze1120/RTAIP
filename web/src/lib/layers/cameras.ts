import { fetchJson, fetchText } from "../http";
import { collection, validLonLat, type GeoCollection, type GeoFeature } from "./geo";

export const CAMERA_REGIONS = ["london", "newyork", "california", "virginia", "usflorida", "usgeorgia", "us511", "singapore", "newzealand", "finland", "hongkong", "seattle", "windy"] as const;
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

interface VdotFeature {
  geometry?: { coordinates?: number[] };
  properties?: {
    id?: string;
    description?: string;
    image_url?: string;
    jurisdiction?: string;
    direction?: string;
    route?: string;
    https_url?: string;
    ios_url?: string;
    active?: boolean;
    problem_stream?: boolean;
  };
}

export function normalizeVdot(data: { features?: VdotFeature[] }): GeoCollection {
  const out: GeoFeature[] = [];
  for (const feat of data.features ?? []) {
    const p = feat.properties ?? {};
    if (p.active === false || p.problem_stream === true) continue;
    const coords = feat.geometry?.coordinates;
    const id = p.id;
    if (!id || !coords || coords.length < 2) continue;
    const [lon, lat] = coords as [number, number];
    const f = cam("virginia", "Virginia DOT (VDOT)", id, p.description || `Camera ${id}`, lat, lon, p.image_url ?? "", {
      area: p.jurisdiction ?? null,
      direction: p.direction || null,
      route: p.route || null,
      videoUrl: p.https_url ?? p.ios_url ?? null,
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

interface WindyWebcam {
  webcamId?: number | string;
  title?: string;
  location?: { latitude?: number; longitude?: number; city?: string; country?: string };
  images?: { current?: { preview?: string; thumbnail?: string } };
}

export function normalizeWindy(data: { webcams?: WindyWebcam[] }): GeoCollection {
  const out: GeoFeature[] = [];
  for (const w of data.webcams ?? []) {
    const id = w.webcamId != null ? String(w.webcamId) : "";
    if (!id) continue;
    const image = w.images?.current?.preview ?? w.images?.current?.thumbnail ?? "";
    const place = [w.location?.city, w.location?.country].filter(Boolean).join(", ");
    const f = cam("windy", "Windy Webcams", id, w.title || place || `Webcam ${id}`, w.location?.latitude ?? NaN, w.location?.longitude ?? NaN, image, {
      area: w.location?.country ?? null,
      detail: place || "Windy Webcams",
    });
    if (f) out.push(f);
  }
  return collection(out);
}

/** Query centers that fill the gaps the keyless government feeds miss: South/Central Asia, the
 *  Middle East, Africa and South America, plus a few global anchors. */
const WINDY_CENTERS: Array<[number, number]> = [
  [28.61, 77.21], // Delhi
  [19.08, 72.88], // Mumbai
  [24.86, 67.0], // Karachi
  [23.81, 90.41], // Dhaka
  [6.93, 79.84], // Colombo
  [27.72, 85.32], // Kathmandu
  [41.31, 69.24], // Tashkent
  [43.24, 76.89], // Almaty
  [25.2, 55.27], // Dubai
  [24.71, 46.68], // Riyadh
  [25.29, 51.53], // Doha
  [41.01, 28.98], // Istanbul
  [35.69, 51.39], // Tehran
  [30.04, 31.24], // Cairo
  [-1.29, 36.82], // Nairobi
  [-23.55, -46.63], // Sao Paulo
];

/** Optional global coverage via Windy Webcams. Inert unless WINDY_WEBCAMS_API_KEY is set. */
async function fetchWindy(signal?: AbortSignal): Promise<GeoCollection> {
  const key = process.env.WINDY_WEBCAMS_API_KEY;
  if (!key) return collection([]);
  const seen = new Set<string>();
  const out: GeoFeature[] = [];
  for (const [lat, lon] of WINDY_CENTERS) {
    try {
      const data = await fetchJson<{ webcams?: WindyWebcam[] }>(`https://api.windy.com/webcams/api/v3/webcams?nearby=${lat},${lon},250&limit=50&include=images,location`, {
        signal,
        timeoutMs: 15_000,
        headers: { "x-windy-api-key": key },
      });
      for (const f of normalizeWindy(data).features) {
        const fid = String(f.id);
        if (seen.has(fid)) continue;
        seen.add(fid);
        out.push(f);
      }
    } catch {
      // A failing region should not hide the others.
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

/** Marker payload served by every Castle Rock / "CARS" state 511 site at
 *  /map/mapIcons/Cameras — all cameras in one keyless GET. `location` is [lat, lon]. */
interface CarsIcons {
  item2?: Array<{ itemId?: string | number; location?: number[]; title?: string }>;
}

interface CarsHost {
  host: string;
  state: string;
  abbr: string;
}

/** Keyless US state 511 camera feeds on the Castle Rock / "CARS" platform. Each site exposes
 *  /map/mapIcons/Cameras (every marker in one GET) and /map/Cctv/{id} (a public JPEG snapshot).
 *  Grouped into three region polls so each response stays near the proven-safe Caltrans size
 *  (~1.7 MB). Verified keyless and image-serving on 2026-11-02. */
const CARS_GROUPS: Record<"usflorida" | "usgeorgia" | "us511", CarsHost[]> = {
  usflorida: [{ host: "fl511.com", state: "Florida", abbr: "fl" }],
  usgeorgia: [{ host: "511ga.org", state: "Georgia", abbr: "ga" }],
  us511: [
    { host: "www.511pa.com", state: "Pennsylvania", abbr: "pa" },
    { host: "az511.gov", state: "Arizona", abbr: "az" },
    { host: "www.nvroads.com", state: "Nevada", abbr: "nv" },
    { host: "511wi.gov", state: "Wisconsin", abbr: "wi" },
    { host: "511.idaho.gov", state: "Idaho", abbr: "id" },
    { host: "www.511la.org", state: "Louisiana", abbr: "la" },
    { host: "ctroads.org", state: "Connecticut", abbr: "ct" },
    { host: "511.alaska.gov", state: "Alaska", abbr: "ak" },
    { host: "www.newengland511.org", state: "New England", abbr: "ne" },
  ],
};

export function normalizeCars(host: string, state: string, abbr: string, data: CarsIcons): GeoCollection {
  const out: GeoFeature[] = [];
  for (const it of data.item2 ?? []) {
    const itemId = it.itemId != null ? String(it.itemId) : "";
    const loc = it.location;
    if (!itemId || !loc || loc.length < 2) continue;
    const [lat, lon] = loc as [number, number];
    const title = it.title && it.title.trim().length > 0 ? it.title.trim() : `${state} traffic camera ${itemId}`;
    const f = cam("us511", `${state} 511`, `${abbr}-${itemId}`, title, lat, lon, `https://${host}/map/Cctv/${itemId}`, { area: state });
    if (f) out.push(f);
  }
  return collection(out);
}

async function fetchCars(hosts: CarsHost[], signal?: AbortSignal): Promise<GeoCollection> {
  const features: GeoFeature[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < hosts.length) {
      const h = hosts[cursor++];
      if (!h) break;
      try {
        const data = await fetchJson<CarsIcons>(`https://${h.host}/map/mapIcons/Cameras`, { signal, timeoutMs: 20_000 });
        features.push(...normalizeCars(h.host, h.state, h.abbr, data).features);
      } catch {
        // One state being down should not hide the others.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, hosts.length) }, worker));
  if (features.length === 0) throw new Error("no US 511 cameras available");
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
    case "virginia":
      return normalizeVdot(await fetchJson<{ features?: VdotFeature[] }>("https://511.vdot.virginia.gov/services/511/map/layers/map/cams", { signal, timeoutMs: 25_000 }));
    case "usflorida":
      return fetchCars(CARS_GROUPS.usflorida, signal);
    case "usgeorgia":
      return fetchCars(CARS_GROUPS.usgeorgia, signal);
    case "us511":
      return fetchCars(CARS_GROUPS.us511, signal);
    case "newzealand":
      return normalizeNz(await fetchText("https://trafficnz.info/service/traffic/rest/4/cameras/all", { signal, timeoutMs: 20_000 }));
    case "finland":
      return normalizeFinland(await fetchJson("https://tie.digitraffic.fi/api/weathercam/v1/stations", { signal, timeoutMs: 20_000 }));
    case "hongkong":
      return normalizeHongKong(await fetchText("https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.csv", { signal, timeoutMs: 20_000 }));
    case "seattle":
      return normalizeSeattle(await fetchJson("https://web.seattle.gov/Travelers/api/Map/Data?zoomId=13&type=2", { signal, timeoutMs: 20_000 }));
    case "windy":
      return fetchWindy(signal);
  }
}
