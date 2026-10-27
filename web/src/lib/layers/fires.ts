import { USER_AGENT } from "../http";
import { clamp01, collection, validLonLat, type GeoCollection, type GeoFeature } from "./geo";

const URL_VIIRS = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv";
const MAX_FIRES = 12_000;

/** Parses the public NASA FIRMS VIIRS 24 hour CSV, keeping the strongest detections. */
export function normalizeFires(csv: string): GeoCollection {
  const lines = csv.split(/\r?\n/);
  const header = (lines.shift() ?? "").split(",");
  const col = (name: string): number => header.indexOf(name);
  const iLat = col("latitude");
  const iLon = col("longitude");
  const iDate = col("acq_date");
  const iTime = col("acq_time");
  const iConf = col("confidence");
  const iFrp = col("frp");
  const iBright = col("bright_ti4");
  const iDay = col("daynight");
  if (iLat < 0 || iLon < 0) return collection([]);
  const rows: Array<{ lat: number; lon: number; frp: number; time: string | null; conf: string; bright: number; day: string }> = [];
  for (const line of lines) {
    if (!line) continue;
    const c = line.split(",");
    const lat = Number(c[iLat]);
    const lon = Number(c[iLon]);
    const conf = (c[iConf] ?? "").trim().toLowerCase();
    if (!validLonLat(lon, lat) || conf === "l" || conf === "low") continue;
    const hhmm = (c[iTime] ?? "").padStart(4, "0");
    const time = c[iDate] ? new Date(`${c[iDate]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`) : null;
    rows.push({ lat, lon, frp: Number(c[iFrp]) || 0, time: time && Number.isFinite(time.getTime()) ? time.toISOString() : null, conf, bright: Number(c[iBright]) || 0, day: c[iDay] ?? "" });
  }
  rows.sort((a, b) => b.frp - a.frp);
  const features: GeoFeature[] = rows.slice(0, MAX_FIRES).map((r, i) => ({
    type: "Feature",
    id: `${i}`,
    geometry: { type: "Point", coordinates: [r.lon, r.lat] },
    properties: {
      id: `firms:${r.lat.toFixed(3)}:${r.lon.toFixed(3)}:${r.time ?? i}`,
      layer: "fires",
      title: `Fire detection, ${r.frp.toFixed(1)} MW`,
      severity: clamp01(r.frp / 150),
      time: r.time,
      source: "NASA FIRMS (VIIRS Suomi NPP)",
      url: "https://firms.modaps.eosdis.nasa.gov/map/",
      detail: `${r.conf === "h" || r.conf === "high" ? "High" : "Nominal"} confidence, ${r.bright.toFixed(0)} K, ${r.day === "D" ? "day" : "night"} pass`,
      frp: r.frp,
    },
  }));
  return collection(features);
}

export async function fetchFires(signal?: AbortSignal): Promise<GeoCollection> {
  const res = await fetch(URL_VIIRS, { headers: { "user-agent": USER_AGENT }, signal: signal ?? AbortSignal.timeout(25_000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return normalizeFires(await res.text());
}
