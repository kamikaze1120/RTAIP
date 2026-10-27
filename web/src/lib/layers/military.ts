import { fetchJson } from "../http";
import { normalizeAdsb } from "./aircraft";
import type { GeoCollection } from "./geo";

const WORLD = { south: -90, west: -180, north: 90, east: 180 };
const SOURCES = [
  { name: "adsb.lol military feed", url: "https://api.adsb.lol/v2/mil" },
  { name: "adsb.fi military feed", url: "https://opendata.adsb.fi/api/v2/mil" },
];

/** Aircraft flagged as military by the community ADS-B networks, worldwide. */
export async function fetchMilitary(signal?: AbortSignal): Promise<GeoCollection> {
  let lastError: unknown;
  for (const src of SOURCES) {
    try {
      const data = await fetchJson<{ ac?: Parameters<typeof normalizeAdsb>[0]["ac"]; now?: number }>(src.url, { signal, timeoutMs: 12_000 });
      return normalizeAdsb(data, WORLD, src.name, Date.now(), "military");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("no military aircraft source available");
}
