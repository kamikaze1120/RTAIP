import { cached } from "./cache";
import { USER_AGENT } from "./http";

export interface HealthCheck {
  id: string;
  label: string;
  group: "map" | "investigation" | "platform";
  ok: boolean;
  ms: number;
  error?: string;
}

interface Probe {
  id: string;
  label: string;
  group: HealthCheck["group"];
  url: string;
  headers?: Record<string, string>;
}

function probes(): Probe[] {
  const list: Probe[] = [
    { id: "usgs", label: "USGS earthquakes", group: "map", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson" },
    { id: "eonet", label: "NASA EONET", group: "map", url: "https://eonet.gsfc.nasa.gov/api/v3/events?limit=1" },
    { id: "nws", label: "US weather alerts", group: "map", url: "https://api.weather.gov/", headers: { accept: "application/geo+json" } },
    { id: "adsb", label: "Community ADS-B aircraft", group: "map", url: "https://api.adsb.lol/v2/point/40.7/-74/5" },
    { id: "gdacs", label: "GDACS disaster alerts", group: "map", url: "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ&alertlevel=Red" },
    { id: "firms", label: "NASA FIRMS fires", group: "map", url: "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/" },
    { id: "ais", label: "Digitraffic AIS ships", group: "map", url: "https://meri.digitraffic.fi/api/ais/v1/locations?from=0&radius=1", headers: { "accept-encoding": "gzip" } },
    { id: "celestrak", label: "CelesTrak satellites", group: "map", url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json" },
    { id: "swpc", label: "NOAA space weather", group: "map", url: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json" },
    { id: "tfl", label: "TfL traffic cameras", group: "map", url: "https://api.tfl.gov.uk/Place/Type/JamCam?limit=1" },
    { id: "doh", label: "Cloudflare DNS", group: "investigation", url: "https://cloudflare-dns.com/dns-query?name=example.com&type=A", headers: { accept: "application/dns-json" } },
    { id: "rdap", label: "RDAP registration", group: "investigation", url: "https://rdap.org/domain/example.com", headers: { accept: "application/rdap+json" } },
    { id: "ipwho", label: "IP geolocation", group: "investigation", url: "https://ipwho.is/8.8.8.8" },
    { id: "crtsh", label: "Certificate logs", group: "investigation", url: "https://crt.sh/?q=example.com&output=json&exclude=expired&limit=1" },
  ];
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabase && anon) list.push({ id: "supabase", label: "Supabase", group: "platform", url: `${supabase.replace(/\/$/, "")}/auth/v1/health`, headers: { apikey: anon } });
  return list;
}

async function run(p: Probe): Promise<HealthCheck> {
  const started = Date.now();
  try {
    const res = await fetch(p.url, { headers: { "user-agent": USER_AGENT, ...p.headers }, signal: AbortSignal.timeout(5000), redirect: "follow", cache: "no-store" });
    await res.body?.cancel();
    return { id: p.id, label: p.label, group: p.group, ok: res.ok, ms: Date.now() - started, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { id: p.id, label: p.label, group: p.group, ok: false, ms: Date.now() - started, error: err instanceof Error ? err.message : "failed" };
  }
}

export async function getHealth(): Promise<{ status: "ok" | "degraded" | "down"; checkedAt: string; checks: HealthCheck[] }> {
  const res = await cached("health", 60_000, async () => Promise.all(probes().map(run)));
  const checks = res.value;
  const failing = checks.filter((c) => !c.ok).length;
  const status = failing === 0 ? "ok" : failing === checks.length ? "down" : "degraded";
  return { status, checkedAt: new Date(res.fetchedAt).toISOString(), checks };
}
