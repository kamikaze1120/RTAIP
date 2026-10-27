import { fetchJson } from "../http";
import { collection, validLonLat, type GeoCollection, type GeoFeature } from "./geo";

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

type StateVector = [string, string | null, string, number | null, number, number | null, number | null, number | null, boolean, number | null, number | null, number | null, unknown, number | null, string | null, boolean, number];

const EMERGENCY: Record<string, string> = { "7500": "hijack", "7600": "radio failure", "7700": "general emergency" };
const MAX_AIRCRAFT = 1500;

export function normalizeAircraft(data: { time?: number; states?: StateVector[] | null }): GeoCollection {
  const features: GeoFeature[] = [];
  for (const s of data.states ?? []) {
    const [icao24, callsign, country, , lastContact, lon, lat, baroAlt, onGround, velocity, track, , , geoAlt, squawk] = s;
    if (!validLonLat(lon, lat) || onGround) continue;
    const emergency = squawk ? EMERGENCY[squawk] : undefined;
    const name = (callsign ?? "").trim() || icao24;
    features.push({
      type: "Feature",
      id: icao24,
      geometry: { type: "Point", coordinates: [lon, lat as number] },
      properties: {
        id: `opensky:${icao24}`,
        layer: "aircraft",
        title: name,
        severity: emergency ? 1 : 0.1,
        time: new Date(lastContact * 1000).toISOString(),
        source: "OpenSky Network",
        detail: emergency ? `Squawking ${squawk}: ${emergency}` : `${country}`,
        country,
        altitudeM: geoAlt ?? baroAlt,
        speedMs: velocity,
        heading: track,
        squawk,
        emergency: Boolean(emergency),
      },
    });
    if (features.length >= MAX_AIRCRAFT) break;
  }
  return collection(features);
}

export function parseBbox(params: URLSearchParams): Bbox | null {
  const nums = ["south", "west", "north", "east"].map((k) => Number(params.get(k)));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [south, west, north, east] = nums as [number, number, number, number];
  if (south < -90 || north > 90 || west < -180 || east > 180 || south >= north || west >= east) return null;
  return { south, west, north, east };
}

const toRad = (d: number): number => (d * Math.PI) / 180;

export function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return (2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)))) / 1.852;
}

export function bboxCircle(b: Bbox): { lat: number; lon: number; radiusNm: number } {
  const lat = (b.south + b.north) / 2;
  const lon = (b.west + b.east) / 2;
  return { lat, lon, radiusNm: distanceNm(lat, lon, b.north, b.east) };
}

/** Largest view, as a radius around its center, that the community feeds can serve in one request. */
export const MAX_VIEW_RADIUS_NM = 320;
const MAX_REQUEST_RADIUS_NM = 250;

interface AdsbAircraft {
  hex: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  alt_geom?: number;
  gs?: number;
  track?: number;
  squawk?: string;
  t?: string;
  emergency?: string;
  seen_pos?: number;
}

const FT_TO_M = 0.3048;
const KT_TO_MS = 0.514444;

export function normalizeAdsb(data: { ac?: AdsbAircraft[]; now?: number }, bbox: Bbox, source: string, nowMs = Date.now(), layer: "aircraft" | "military" = "aircraft"): GeoCollection {
  const features: GeoFeature[] = [];
  for (const a of data.ac ?? []) {
    const { lat, lon } = a;
    if (typeof lat !== "number" || typeof lon !== "number" || !validLonLat(lon, lat)) continue;
    if (a.alt_baro === "ground") continue;
    if (lat < bbox.south || lat > bbox.north || lon < bbox.west || lon > bbox.east) continue;
    const squawkEmergency = a.squawk ? EMERGENCY[a.squawk] : undefined;
    const declared = a.emergency && a.emergency !== "none" ? a.emergency : undefined;
    const emergency = squawkEmergency ?? declared;
    const name = (a.flight ?? "").trim() || a.hex;
    const altFt = typeof a.alt_baro === "number" ? a.alt_baro : a.alt_geom;
    features.push({
      type: "Feature",
      id: a.hex,
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        id: `adsb:${a.hex}`,
        layer,
        title: name,
        severity: emergency ? 1 : 0.1,
        time: new Date(nowMs - (a.seen_pos ?? 0) * 1000).toISOString(),
        source,
        detail: emergency ? `Emergency: ${emergency}${a.squawk ? ` (squawk ${a.squawk})` : ""}` : [a.t, altFt !== undefined ? `${Math.round(altFt * FT_TO_M).toLocaleString("en-US")} m` : null].filter(Boolean).join(", "),
        aircraftType: a.t,
        altitudeM: altFt !== undefined ? Math.round(altFt * FT_TO_M) : null,
        speedMs: a.gs !== undefined ? Math.round(a.gs * KT_TO_MS) : null,
        heading: a.track ?? null,
        squawk: a.squawk ?? null,
        emergency: Boolean(emergency),
        military: layer === "military",
      },
    });
    if (features.length >= (layer === "military" ? 4000 : MAX_AIRCRAFT)) break;
  }
  return collection(features);
}

const ADSB_SOURCES = [
  { name: "adsb.lol community ADS-B", url: (c: { lat: number; lon: number; r: number }) => `https://api.adsb.lol/v2/point/${c.lat.toFixed(3)}/${c.lon.toFixed(3)}/${c.r}` },
  { name: "adsb.fi community ADS-B", url: (c: { lat: number; lon: number; r: number }) => `https://opendata.adsb.fi/api/v2/lat/${c.lat.toFixed(3)}/lon/${c.lon.toFixed(3)}/dist/${c.r}` },
];

async function fetchOpenSky(bbox: Bbox, signal?: AbortSignal): Promise<GeoCollection> {
  const q = new URLSearchParams({ lamin: String(bbox.south), lomin: String(bbox.west), lamax: String(bbox.north), lomax: String(bbox.east) });
  const user = process.env.OPENSKY_USERNAME;
  const pass = process.env.OPENSKY_PASSWORD;
  const headers: Record<string, string> = { authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` };
  const data = await fetchJson<{ time?: number; states?: StateVector[] | null }>(`https://opensky-network.org/api/states/all?${q}`, { signal, timeoutMs: 12_000, headers });
  return normalizeAircraft(data);
}

/** Tries each free community feed in turn, then OpenSky when credentials are configured. */
export async function fetchAircraft(bbox: Bbox, signal?: AbortSignal): Promise<GeoCollection> {
  const c = bboxCircle(bbox);
  const r = Math.max(5, Math.min(MAX_REQUEST_RADIUS_NM, Math.ceil(c.radiusNm)));
  let lastError: unknown;
  for (const src of ADSB_SOURCES) {
    try {
      const data = await fetchJson<{ ac?: AdsbAircraft[]; now?: number }>(src.url({ lat: c.lat, lon: c.lon, r }), { signal, timeoutMs: 8000 });
      return normalizeAdsb(data, bbox, src.name);
    } catch (err) {
      lastError = err;
    }
  }
  if (process.env.OPENSKY_USERNAME && process.env.OPENSKY_PASSWORD) return fetchOpenSky(bbox, signal);
  throw lastError instanceof Error ? lastError : new Error("no aircraft source available");
}
