import { fetchJson } from "../http";
import { collection, validLonLat, type GeoCollection, type GeoFeature } from "./geo";

const URL_FEODO = "https://feodotracker.abuse.ch/downloads/ipblocklist.json";

interface FeodoEntry {
  ip_address: string;
  port?: number;
  status?: string;
  hostname?: string | null;
  as_name?: string;
  country?: string;
  first_seen?: string;
  last_online?: string;
  malware?: string;
}
interface IpWho {
  success?: boolean;
  latitude?: number;
  longitude?: number;
  city?: string;
  country?: string;
}

const geoCache = new Map<string, { lat: number; lon: number; city?: string } | null>();

async function locate(ip: string, signal?: AbortSignal): Promise<{ lat: number; lon: number; city?: string } | null> {
  if (geoCache.has(ip)) return geoCache.get(ip) ?? null;
  try {
    const g = await fetchJson<IpWho>(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal, timeoutMs: 6000 });
    const out = g.success !== false && typeof g.latitude === "number" && typeof g.longitude === "number" && validLonLat(g.longitude, g.latitude) ? { lat: g.latitude, lon: g.longitude, city: g.city } : null;
    geoCache.set(ip, out);
    return out;
  } catch {
    return null;
  }
}

export function normalizeFeodo(list: FeodoEntry[], places: Map<string, { lat: number; lon: number; city?: string } | null>): GeoCollection {
  const features: GeoFeature[] = [];
  for (const e of list) {
    const at = places.get(e.ip_address);
    if (!at) continue;
    const online = e.status === "online";
    features.push({
      type: "Feature",
      id: e.ip_address,
      geometry: { type: "Point", coordinates: [at.lon, at.lat] },
      properties: {
        id: `feodo:${e.ip_address}:${e.port ?? 0}`,
        layer: "cyber",
        title: `${e.malware ?? "Botnet"} command server ${e.ip_address}`,
        severity: online ? 0.85 : 0.4,
        time: e.last_online ? new Date(e.last_online).toISOString() : e.first_seen ? new Date(`${e.first_seen.replace(" ", "T")}Z`).toISOString() : null,
        source: "abuse.ch Feodo Tracker",
        url: `https://feodotracker.abuse.ch/browse/host/${e.ip_address}/`,
        detail: [online ? "Online" : "Offline", e.as_name, e.country, at.city].filter(Boolean).join(", "),
        malware: e.malware ?? null,
        ip: e.ip_address,
        online,
      },
    });
  }
  return collection(features);
}

/** Known botnet command and control servers, placed with IP geolocation (approximate). */
export async function fetchCyber(signal?: AbortSignal): Promise<GeoCollection> {
  const list = (await fetchJson<FeodoEntry[]>(URL_FEODO, { signal, timeoutMs: 15_000 })).slice(0, 250);
  const places = new Map<string, { lat: number; lon: number; city?: string } | null>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < list.length) {
      const e = list[cursor++] as FeodoEntry;
      places.set(e.ip_address, await locate(e.ip_address, signal));
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return normalizeFeodo(list, places);
}
