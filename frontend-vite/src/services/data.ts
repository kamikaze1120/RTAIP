export type RtaEvent = {
  id: string;
  timestamp: string;
  source: string;
  latitude: number | null;
  longitude: number | null;
  confidence?: number;
  data?: Record<string, any>;
};

const inMemoryCache = new Map<string, { ts: number; data: any }>();
const TTL_MS = 2 * 60 * 1000;
function getCache<T>(key: string): T | null {
  const v = inMemoryCache.get(key);
  if (!v) return null;
  if (Date.now() - v.ts > TTL_MS) { inMemoryCache.delete(key); return null; }
  return v.data as T;
}
function setCache(key: string, data: any) { inMemoryCache.set(key, { ts: Date.now(), data }); }

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 8000, ...rest } = init;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // cache layer for GET
    const key = typeof input === 'string' ? `http:${input}` : `http:${String(input)}`;
    if ((rest.method || 'GET') === 'GET') {
      const cached = getCache<Response>(key);
      if (cached) return cached;
    }
    const r = await fetch(input, { ...rest, signal: ctrl.signal });
    clearTimeout(id);
    if ((rest.method || 'GET') === 'GET' && r.ok) setCache(typeof input === 'string' ? `http:${input}` : `http:${String(input)}`, r.clone());
    return r;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

export function getBackendBase(): string | null {
  const env = import.meta.env.VITE_BACKEND_URL as string | undefined;
  return (env && env.trim()) || null;
}

export function getHealthPaths(): string[] {
  const hp = import.meta.env.VITE_HEALTH_PATH as string | undefined;
  const primary = (hp && hp.trim()) || '/health';
  const candidates = [primary, '/api/health', '/status'];
  const uniq: string[] = [];
  candidates.forEach((p) => { if (!uniq.includes(p)) uniq.push(p); });
  return uniq;
}

export async function fetchBackendEvents(): Promise<RtaEvent[]> {
  const base = getBackendBase();
  if (!base) return [];
  try {
    const r = await fetchWithTimeout(`${base.replace(/\/$/, '')}/events`, { timeoutMs: 7000 });
    const jd = await r.json();
    const arr: any[] = Array.isArray(jd) ? jd : [];
    return arr.map((e, i) => ({
      id: String(e.id ?? i),
      timestamp: e.timestamp ?? new Date().toISOString(),
      source: String(e.source || 'unknown'),
      latitude: typeof e.latitude === 'number' ? e.latitude : null,
      longitude: typeof e.longitude === 'number' ? e.longitude : null,
      confidence: typeof e.confidence === 'number' ? e.confidence : 0.5,
      data: e.data || {},
    }));
  } catch {
    return [];
  }
}

export function eventSeverity(e: RtaEvent): number {
  const src = String(e.source || '').toLowerCase();
  let sev = 0.3;
  if (src.includes('usgs')) {
    const m = typeof (e.data as any)?.mag === 'number' ? (e.data as any).mag : 0;
    sev = Math.min(1, Math.max(0, (m - 2) / 6));
  } else if (src.includes('noaa')) {
    const ev = String((e.data as any)?.event || '').toLowerCase();
    sev = ev.includes('warning') ? 0.8 : ev.includes('watch') ? 0.6 : 0.4;
  } else if (src.includes('gdacs')) {
    const lvl = String((e.data as any)?.alertlevel || '').toLowerCase();
    sev = lvl === 'red' ? 0.9 : lvl === 'orange' ? 0.7 : 0.5;
  } else if (src.includes('fema')) {
    const t = String((e.data as any)?.incidentType || '').toLowerCase();
    sev = t.includes('hurricane') ? 0.7 : t.includes('flood') ? 0.6 : 0.4;
  }
  const conf = typeof e.confidence === 'number' ? e.confidence : 0.5;
  return Math.max(0, Math.min(1, sev * (0.6 + 0.4 * conf)));
}

export function globalThreatScore(events: RtaEvent[]): number {
  const weights = events.map(eventSeverity);
  const sum = weights.reduce((a, b) => a + b, 0);
  const scaled = Math.round(Math.min(1000, sum * 40));
  return scaled;
}

export function topClusters(events: RtaEvent[], binDeg = 1): Array<{ lat: number; lon: number; score: number }>{
  const grid = new Map<string, { latSum: number; lonSum: number; n: number; score: number }>();
  events.forEach(e => {
    if (e.latitude == null || e.longitude == null) return;
    const latBin = Math.floor(e.latitude / binDeg) * binDeg;
    const lonBin = Math.floor(e.longitude / binDeg) * binDeg;
    const key = `${latBin}:${lonBin}`;
    const sev = eventSeverity(e);
    const cur = grid.get(key) || { latSum: 0, lonSum: 0, n: 0, score: 0 };
    cur.latSum += e.latitude; cur.lonSum += e.longitude; cur.n += 1; cur.score += sev;
    grid.set(key, cur);
  });
  return Array.from(grid.entries())
    .map(([k, v]) => ({ lat: v.latSum / v.n, lon: v.lonSum / v.n, score: v.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function typeProbabilities(events: RtaEvent[]): Record<string, number> {
  const now = Date.now();
  const cutoff = now - 72 * 3600000;
  const recent = events.filter(e => {
    const t = new Date(e.timestamp).getTime();
    return !isNaN(t) && t >= cutoff;
  });
  const byType: Record<string, number> = {};
  recent.forEach(e => {
    const s = String(e.source || '').toLowerCase();
    const type = s.includes('usgs') ? 'seismic' : s.includes('noaa') ? 'weather' : s.includes('gdacs') ? 'disaster' : s.includes('fema') ? 'disaster' : 'other';
    byType[type] = (byType[type] || 0) + eventSeverity(e);
  });
  const total = Object.values(byType).reduce((a, b) => a + b, 0) || 1;
  const probs: Record<string, number> = {};
  Object.keys(byType).forEach(k => { probs[k] = Math.round((byType[k] / total) * 100); });
  return probs;
}

export function predictedPoints(events: RtaEvent[]): Array<{ lat: number; lon: number; weight: number }>{
  const clusters = topClusters(events, 1);
  return clusters.flatMap(c => {
    return [
      { lat: c.lat, lon: c.lon, weight: c.score },
      { lat: c.lat + 0.5, lon: c.lon, weight: c.score * 0.6 },
      { lat: c.lat - 0.4, lon: c.lon + 0.3, weight: c.score * 0.5 },
    ];
  });
}

export function correlationMatrix(events: RtaEvent[]): Record<string, Record<string, number>> {
  const sources = ['usgs', 'noaa', 'gdacs', 'fema', 'hifld', 'census'];
  const mat: Record<string, Record<string, number>> = {};
  sources.forEach(a => { mat[a] = {}; sources.forEach(b => { mat[a][b] = 0; }); });
  const pts = events.filter(e => e.latitude != null && e.longitude != null);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j];
      const sa = sources.find(s => String(a.source).toLowerCase().includes(s)) || 'other';
      const sb = sources.find(s => String(b.source).toLowerCase().includes(s)) || 'other';
      const dt = Math.abs(new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const geo = Math.abs((a.latitude as number) - (b.latitude as number)) + Math.abs((a.longitude as number) - (b.longitude as number));
      if (dt <= 6 * 3600000 && geo <= 2) mat[sa][sb] += (eventSeverity(a) + eventSeverity(b)) / 2;
    }
  }
  return mat;
}

export async function reverseGeocode(lat: number, lon: number): Promise<{ name?: string; city?: string; county?: string; state?: string; country?: string } | null> {
  if (!isFinite(lat) || !isFinite(lon)) return null;
  const key = `rev:${lat.toFixed(4)}:${lon.toFixed(4)}`;
  const cached = getCache<any>(key);
  if (cached) return cached;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const r = await fetchWithTimeout(url, { timeoutMs: 7000, headers: { 'Accept': 'application/json' } });
    const jd: any = await r.json();
    const addr = jd?.address || {};
    const res = { name: jd?.name, city: addr.city || addr.town || addr.village, county: addr.county, state: addr.state, country: addr.country };
    setCache(key, res);
    return res;
  } catch {
    return null;
  }
}

const STATE_FIPS: Record<string, string> = {
  'alabama': '01','alaska': '02','arizona': '04','arkansas': '05','california': '06','colorado': '08','connecticut': '09','delaware':'10','district of columbia':'11','florida':'12','georgia':'13','hawaii':'15','idaho':'16','illinois':'17','indiana':'18','iowa':'19','kansas':'20','kentucky':'21','louisiana':'22','maine':'23','maryland':'24','massachusetts':'25','michigan':'26','minnesota':'27','mississippi':'28','missouri':'29','montana':'30','nebraska':'31','nevada':'32','new hampshire':'33','new jersey':'34','new mexico':'35','new york':'36','north carolina':'37','north dakota':'38','ohio':'39','oklahoma':'40','oregon':'41','pennsylvania':'42','rhode island':'44','south carolina':'45','south dakota':'46','tennessee':'47','texas':'48','utah':'49','vermont':'50','virginia':'51','washington':'53','west virginia':'54','wisconsin':'55','wyoming':'56'
};

export async function countyPopulation(stateName: string | undefined, countyName: string | undefined): Promise<number | null> {
  if (!stateName || !countyName) return null;
  const code = STATE_FIPS[String(stateName).toLowerCase()];
  try {
    const url = code ? `https://api.census.gov/data/2023/pep/population?get=NAME,POP&for=county:*&in=state:${code}` : `https://api.census.gov/data/2023/pep/population?get=NAME,POP&for=county:*&in=state:*`;
    const r = await fetchWithTimeout(url, { timeoutMs: 8000 });
    const jd: any = await r.json();
    const rows: any[] = Array.isArray(jd) ? jd.slice(1) : [];
    const norm = (s: string) => s.toLowerCase().replace(/ county$/,'').replace(/ parish$/,'').trim();
    const target = norm(countyName);
    const match = rows.find((row: any[]) => norm(String(row[0] || '')).includes(target));
    const pop = match ? Number(match[1]) : null;
    return isFinite(pop || NaN) ? pop : null;
  } catch {
    return null;
  }
}

export async function estimatePopulationNear(lat: number, lon: number): Promise<{ population?: number; place?: string } | null> {
  const geo = await reverseGeocode(lat, lon);
  const county = geo?.county; const state = geo?.state; const country = geo?.country;
  const pop = await countyPopulation(state, county);
  const place = [county, state, country].filter(Boolean).join(', ');
  return { population: pop ?? undefined, place };
}

export type ConnectivityDiagnostics = {
  configured: boolean;
  base?: string;
  health: Array<{ path: string; ok: boolean; status?: number; error?: string }>;
  root?: { ok: boolean; status?: number; error?: string };
  events?: { ok: boolean; status?: number; error?: string };
  mode: 'backend'|'open';
  timestamp: string;
};

export async function runConnectivityDiagnostics(): Promise<ConnectivityDiagnostics> {
  const base = getBackendBase();
  const ts = new Date().toISOString();
  const mode = base ? 'backend' : 'open';
  const out: ConnectivityDiagnostics = { configured: !!base, base: base || undefined, health: [], timestamp: ts, mode };
  if (!base) return out;
  const b = base.replace(/\/$/, '');
  const paths = getHealthPaths();
  for (const p of paths) {
    try {
      const r = await fetchWithTimeout(`${b}${p}`, { timeoutMs: 6000 });
      out.health.push({ path: p, ok: r.ok, status: r.status });
      if (r.ok) return out;
    } catch (e: any) {
      out.health.push({ path: p, ok: false, error: String(e?.message || e) });
    }
  }
  try {
    const r = await fetchWithTimeout(b, { timeoutMs: 6000 });
    out.root = { ok: r.ok, status: r.status };
  } catch (e: any) { out.root = { ok: false, error: String(e?.message || e) }; }
  try {
    const r = await fetchWithTimeout(`${b}/events`, { timeoutMs: 6000 });
    out.events = { ok: r.ok, status: r.status };
  } catch (e: any) { out.events = { ok: false, error: String(e?.message || e) }; }
  return out;
}

export function getSupabaseConfig(): { url?: string; anon?: string; table?: string } {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const table = (import.meta.env.VITE_SUPABASE_TABLE as string | undefined) || 'events';
  return { url, anon, table };
}

export async function checkSupabaseHealth(): Promise<boolean> {
  const { url, anon, table } = getSupabaseConfig();
  if (!url || !anon || !table) return false;
  try {
    const r = await fetchWithTimeout(`${url.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(table)}?select=id&limit=1`, { timeoutMs: 6000, headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
    return r.ok;
  } catch { return false; }
}

export async function fetchSupabaseEvents(): Promise<RtaEvent[]> {
  const { url, anon, table } = getSupabaseConfig();
  if (!url || !anon || !table) return [];
  try {
    const r = await fetchWithTimeout(`${url.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(table)}?select=*`, { timeoutMs: 10000, headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
    if (!r.ok) return [];
    const rows: any[] = await r.json();
    const events: RtaEvent[] = rows.map((row: any) => ({
      id: String(row.id ?? `${row.source}-${row.timestamp}`),
      source: row.source ?? 'supabase',
      timestamp: row.timestamp ?? row.created_at ?? new Date().toISOString(),
      latitude: typeof row.lat === 'number' ? row.lat : (typeof row.latitude === 'number' ? row.latitude : null),
      longitude: typeof row.lon === 'number' ? row.lon : (typeof row.longitude === 'number' ? row.longitude : null),
      confidence: typeof row.confidence === 'number' ? row.confidence : 0.6,
      data: row
    }));
    return events;
  } catch { return []; }
}

export async function callGemini(query: string, context?: string): Promise<string | null> {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) return null;
  const model = (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || 'models/gemini-1.5-flash';
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const body = {
      contents: [
        { role: 'user', parts: [{ text: (context ? context + '\n\n' : '') + query }] }
      ]
    };
    const r = await fetchWithTimeout(url, { timeoutMs: 12000, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return null;
    const jd: any = await r.json();
    const text = jd?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === 'string' ? text : JSON.stringify(jd);
  } catch { return null; }
}

export type SupabaseDiagnostics = {
  configured: boolean;
  url?: string;
  table?: string;
  ok?: boolean;
  status?: number;
  error?: string;
};

export async function runSupabaseDiagnostics(): Promise<SupabaseDiagnostics> {
  const { url, anon, table } = getSupabaseConfig();
  const out: SupabaseDiagnostics = { configured: !!(url && anon && table), url, table };
  if (!url || !anon || !table) return out;
  try {
    const r = await fetchWithTimeout(`${url.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(table)}?select=id&limit=1`, { timeoutMs: 6000, headers: { apikey: anon, Authorization: `Bearer ${anon}`, Accept: 'application/json' } });
    out.ok = r.ok; out.status = r.status;
    if (!r.ok) {
      try { out.error = await r.text(); } catch {}
    }
  } catch (e: any) {
    out.ok = false; out.error = String(e?.message || e);
  }
  return out;
}

export async function fetchUSGSAllDay(): Promise<RtaEvent[]> {
  try {
    const r = await fetchWithTimeout('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
    const jd = await r.json();
    const feats: any[] = Array.isArray(jd?.features) ? jd.features : [];
    return feats.map((f: any, idx: number) => {
      const c = Array.isArray(f.geometry?.coordinates) ? f.geometry.coordinates : [];
      const lon = typeof c[0] === 'number' ? c[0] : null;
      const lat = typeof c[1] === 'number' ? c[1] : null;
      const ts = typeof f.properties?.time === 'number' ? new Date(f.properties.time).toISOString() : new Date().toISOString();
      return {
        id: String(f.id || `usgs-${idx}`),
        timestamp: ts,
        source: 'usgs_seismic',
        latitude: lat,
        longitude: lon,
        confidence: 1,
        data: { mag: f.properties?.mag, place: f.properties?.place },
      };
    });
  } catch {
    return [];
  }
}

export async function fetchNOAAAlerts(): Promise<RtaEvent[]> {
  try {
    const r = await fetchWithTimeout('https://api.weather.gov/alerts/active');
    const jd = await r.json();
    const feats: any[] = Array.isArray(jd?.features) ? jd.features : [];
    return feats.map((f: any, idx: number) => {
      const geom = f.geometry;
      let lon: number | null = null, lat: number | null = null;
      try {
        if (geom && geom.type === 'Polygon') {
          const coords = geom.coordinates?.[0] || [];
          if (coords.length > 0) {
            const sum = coords.reduce((acc: any, p: any) => ({ lon: acc.lon + (p?.[0]||0), lat: acc.lat + (p?.[1]||0) }), { lon: 0, lat: 0 });
            lon = sum.lon / coords.length; lat = sum.lat / coords.length;
          }
        }
      } catch {}
      const ts = f.properties?.effective || f.properties?.sent || f.properties?.onset || new Date().toISOString();
      return {
        id: String(f.id || `noaa-${idx}`),
        timestamp: ts,
        source: 'noaa_weather',
        latitude: lat,
        longitude: lon,
        confidence: 1,
        data: { headline: f.properties?.headline, event: f.properties?.event },
      };
    });
  } catch {
    return [];
  }
}

export async function fetchGDACS(fromISO: string, toISO: string): Promise<RtaEvent[]> {
  try {
    const r = await fetchWithTimeout(`https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;WF;VO;DR&fromdate=${fromISO}&todate=${toISO}`);
    const jd = await r.json();
    const feats: any[] = Array.isArray(jd?.features) ? jd.features : [];
    return feats.map((f: any, idx: number) => {
      let lon: number | null = null, lat: number | null = null;
      const geom = f.geometry;
      try {
        if (geom && geom.type === 'Point' && Array.isArray(geom.coordinates)) {
          lon = typeof geom.coordinates[0] === 'number' ? geom.coordinates[0] : null;
          lat = typeof geom.coordinates[1] === 'number' ? geom.coordinates[1] : null;
        } else if (geom && geom.type === 'Polygon') {
          const coords = geom.coordinates?.[0] || [];
          if (coords.length > 0) {
            const sum = coords.reduce((acc: any, p: any) => ({ lon: acc.lon + (p?.[0]||0), lat: acc.lat + (p?.[1]||0) }), { lon: 0, lat: 0 });
            lon = sum.lon / coords.length; lat = sum.lat / coords.length;
          }
        }
      } catch {}
      const p = f.properties || {};
      const ts = p.fromdate || p.todate || new Date().toISOString();
      const id = p.eventid && p.episodeid ? `${p.eventid}-${p.episodeid}` : String(p.eventid || `gdacs-${idx}`);
      return {
        id,
        timestamp: ts,
        source: 'gdacs_disasters',
        latitude: lat,
        longitude: lon,
        confidence: 1,
        data: { title: p.name || p.description || 'GDACS Event', type: p.eventtype, alertlevel: p.alertlevel },
      };
    });
  } catch {
    return [];
  }
}

export async function fetchFEMA(): Promise<RtaEvent[]> {
  try {
    const url = `https://gis.fema.gov/arcgis/rest/services/IncidentManagement/DisasterDeclarationsSummaries/FeatureServer/0/query?where=1%3D1&outFields=declarationDate,incidentType,declaredCountyArea,declaredState,disasterNumber&returnGeometry=true&outSR=4326&f=json`;
    const r = await fetchWithTimeout(url);
    const jd = await r.json();
    const feats: any[] = Array.isArray(jd?.features) ? jd.features : [];
    return feats.map((f: any, idx: number) => {
      const attr = f.attributes || {};
      const geom = f.geometry || {};
      const tsNum = typeof attr.declarationDate === 'number' ? attr.declarationDate : null;
      const ts = tsNum ? new Date(tsNum).toISOString() : new Date().toISOString();
      const lon = typeof geom.x === 'number' ? geom.x : null;
      const lat = typeof geom.y === 'number' ? geom.y : null;
      return {
        id: String(attr.disasterNumber || `fema-${idx}`),
        timestamp: ts,
        source: 'fema_disasters',
        latitude: lat,
        longitude: lon,
        confidence: 1,
        data: { incidentType: attr.incidentType, county: attr.declaredCountyArea, state: attr.declaredState },
      };
    });
  } catch {
    return [];
  }
}

export async function fetchHIFLDHospitals(): Promise<RtaEvent[]> {
  try {
    const url = `https://maps.nccs.nasa.gov/mapping/rest/services/hifld_open/public_health/FeatureServer/0/query?where=1%3D1&outFields=name,type,state&returnGeometry=true&f=json`;
    const r = await fetchWithTimeout(url);
    const jd = await r.json();
    const feats: any[] = Array.isArray(jd?.features) ? jd.features : [];
    return feats.map((f: any, idx: number) => {
      const attr = f.attributes || {};
      const geom = f.geometry || {};
      const lon = typeof geom.x === 'number' ? geom.x : null;
      const lat = typeof geom.y === 'number' ? geom.y : null;
      return {
        id: String(attr.id || `hifld-${idx}`),
        timestamp: new Date().toISOString(),
        source: 'hifld_infra',
        latitude: lat,
        longitude: lon,
        confidence: 1,
        data: { name: attr.name, type: attr.type, state: attr.state },
      };
    });
  } catch {
    return [];
  }
}

export async function fetchCensusCounties(): Promise<RtaEvent[]> {
  try {
    const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/11/query?where=1%3D1&outFields=NAME,STATE,INTPTLAT,INTPTLON,GEOID&returnGeometry=false&f=json`;
    const r = await fetchWithTimeout(url);
    const jd = await r.json();
    const feats: any[] = Array.isArray(jd?.features) ? jd.features : [];
    return feats.map((f: any, idx: number) => {
      const attr = f.attributes || {};
  const lat = attr.INTPTLAT != null ? parseFloat(attr.INTPTLAT) : null;
  const lon = attr.INTPTLON != null ? parseFloat(attr.INTPTLON) : null;
  return {
    id: String(attr.GEOID || `census-${idx}`),
    timestamp: new Date().toISOString(),
    source: 'census_pop',
    latitude: typeof lat === 'number' && isFinite(lat) ? lat : null,
    longitude: typeof lon === 'number' && isFinite(lon) ? lon : null,
    confidence: 1,
    data: { name: attr.NAME, state: attr.STATE },
  };
    });
  } catch {
    return [];
  }
}