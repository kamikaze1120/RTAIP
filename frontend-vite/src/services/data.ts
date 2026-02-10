import { getSupabaseClient } from '../utils/supabase';

export type RtaEvent = {
  id: string;
  timestamp: string;
  source: string;
  latitude: number | null;
  longitude: number | null;
  confidence?: number;
  data?: Record<string, unknown>;
};

const inMemoryCache = new Map<string, { ts: number; data: unknown }>();
const TTL_MS = 2 * 60 * 1000;
function getCache<T>(key: string): T | null {
  const v = inMemoryCache.get(key);
  if (!v) return null;
  if (Date.now() - v.ts > TTL_MS) { inMemoryCache.delete(key); return null; }
  return v.data as T;
}
function setCache(key: string, data: unknown) { inMemoryCache.set(key, { ts: Date.now(), data }); }

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
  try {
    const ls = typeof window !== 'undefined' ? window.localStorage.getItem('backendUrl') : null;
    const env = import.meta.env.VITE_BACKEND_URL as string | undefined;
    const url = (ls && ls.trim()) || (env && env.trim()) || '';
    return url ? url : null;
  } catch {
    const env = import.meta.env.VITE_BACKEND_URL as string | undefined;
    return (env && env.trim()) || null;
  }
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
    const arr: Record<string, unknown>[] = Array.isArray(jd) ? jd : [];
    return arr.map((e: Record<string, unknown>, i) => ({
      id: String(e.id ?? i),
      timestamp: (e.timestamp as string) ?? new Date().toISOString(),
      source: String(e.source || 'unknown'),
      latitude: typeof e.latitude === 'number' ? e.latitude : null,
      longitude: typeof e.longitude === 'number' ? e.longitude : null,
      confidence: typeof e.confidence === 'number' ? e.confidence : 0.5,
      data: (e.data as Record<string, unknown>) || {},
    }));
  } catch {
    return [];
  }
}

export function eventSeverity(e: RtaEvent): number {
  const sev = 0.3;

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
    .map(([, v]) => ({ lat: v.latSum / v.n, lon: v.lonSum / v.n, score: v.score }))
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
    const type = 'other';
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
  const sources = ['hifld'];
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
  const cached = getCache<Record<string, string> | null>(key);
  if (cached) return cached;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const r = await fetchWithTimeout(url, { timeoutMs: 7000, headers: { 'Accept': 'application/json' } });
    const jd: { address?: Record<string, string>, name?: string } = await r.json();
    const addr = jd?.address || {};
    const res = { name: jd?.name, city: addr.city || addr.town || addr.village, county: addr.county, state: addr.state, country: addr.country };
    setCache(key, res);
    return res;
  } catch {
    return null;
  }
}


export function getAssetIcon(): string {
  return '/icons/asset.svg';
}

export function getThreatIcon(): string {
  return '/icons/threat.svg';
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
    } catch (e: unknown) {
      out.health.push({ path: p, ok: false, error: String((e as Error).message || e) });
    }
  }
  try {
    const r = await fetchWithTimeout(b, { timeoutMs: 6000 });
    out.root = { ok: r.ok, status: r.status };
  } catch (e: unknown) { out.root = { ok: false, error: String((e as Error).message || e) }; }
  try {
    let r = await fetchWithTimeout(`${b}/events/status`, { timeoutMs: 6000 });
    if (!r.ok) {
      r = await fetchWithTimeout(`${b}/events`, { timeoutMs: 6000 });
    }
    out.events = { ok: r.ok, status: r.status };
  } catch (e: unknown) { out.events = { ok: false, error: String((e as Error).message || e) }; }
  return out;
}

export function getSupabaseConfig(): { url?: string; anon?: string; table?: string } {
  try {
    const lsUrl = typeof window !== 'undefined' ? window.localStorage.getItem('supabaseUrl') : null;
    const lsAnon = typeof window !== 'undefined' ? window.localStorage.getItem('supabaseAnon') : null;
    const lsTable = typeof window !== 'undefined' ? window.localStorage.getItem('supabaseTable') : null;
    const url = (lsUrl && lsUrl.trim()) || (import.meta.env.VITE_SUPABASE_URL as string | undefined);
    const anon = (lsAnon && lsAnon.trim()) || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || (import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string | undefined);
    const table = (lsTable && lsTable.trim()) || (import.meta.env.VITE_SUPABASE_TABLE as string | undefined) || 'data_events';
    return { url, anon, table };
  } catch {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || (import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string | undefined);
    const table = (import.meta.env.VITE_SUPABASE_TABLE as string | undefined) || 'data_events';
    return { url, anon, table };
  }
}

export async function checkSupabaseHealth(): Promise<boolean> {
  const { url, anon, table } = getSupabaseConfig();
  if (url && anon && table) {
    const client = await getSupabaseClient();
    if (client) {
      try {
        const { error } = await client.from(table).select('id').limit(1);
        return !error;
      } catch { return false; }
    }
  }
  if (!url || !anon || !table) return false;
  try {
    const r = await fetchWithTimeout(`${url.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(table)}?select=id&limit=1`, { timeoutMs: 6000, headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
    return r.ok;
  } catch { return false; }
}

export async function fetchSupabaseEvents(): Promise<RtaEvent[]> {
  const { url, anon, table } = getSupabaseConfig();
  if (!url || !anon) return [];

  const toEvents = (rows: Record<string, unknown>[]): RtaEvent[] => {
    type SupaRow = Record<string, unknown> & { id?: string | number; source?: unknown; timestamp?: unknown; created_at?: unknown; lat?: unknown; latitude?: unknown; lon?: unknown; longitude?: unknown; confidence?: unknown };
    const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);
    return rows.map((row: Record<string, unknown>) => {
      const r = row as SupaRow;
      const lat: number | null = numOrNull(r.lat) ?? numOrNull(r.latitude);
      const lon: number | null = numOrNull(r.lon) ?? numOrNull(r.longitude);
      const conf: number = typeof r.confidence === 'number' ? (r.confidence as number) : 0.6;
      const ts: string = String(r.timestamp ?? r.created_at ?? new Date().toISOString());
      const src: string = String(r.source ?? 'supabase');
      return { id: String(r.id ?? `${src}-${ts}`), source: src, timestamp: ts, latitude: lat, longitude: lon, confidence: conf, data: row };
    });
  };

  const restFetch = async (tbl: string): Promise<RtaEvent[]> => {
    const r = await fetchWithTimeout(`${url.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(tbl)}?select=*`, { timeoutMs: 10000, headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
    if (!r.ok) return [];
    const rows: Record<string, unknown>[] = await r.json();
    return toEvents(rows);
  };

  const client = await getSupabaseClient();
  const tryClient = async (tbl: string): Promise<RtaEvent[]> => {
    if (!client) return [];
    try {
      const { data, error } = await client.from(tbl).select('*').limit(1000);
      if (error || !Array.isArray(data)) return [];
      return toEvents(data as unknown as Record<string, unknown>[]);
    } catch { return []; }
  };

  const primary = (table && table.trim()) || 'data_events';
  const alternate = primary === 'events' ? 'data_events' : 'events';

  let ev = await tryClient(primary);
  if (ev.length === 0) ev = await restFetch(primary);
  if (ev.length === 0) {
    ev = await tryClient(alternate);
    if (ev.length === 0) ev = await restFetch(alternate);
  }
  return ev;
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
    const jd = await r.json() as Record<string, unknown>;
    const candidates = jd['candidates'] as unknown;
    if (Array.isArray(candidates) && candidates[0] && typeof candidates[0] === 'object') {
      const content = (candidates[0] as Record<string, unknown>)['content'] as unknown;
      if (content && typeof content === 'object') {
        const parts = (content as Record<string, unknown>)['parts'] as unknown;
        if (Array.isArray(parts) && parts[0] && typeof parts[0] === 'object') {
          const text = (parts[0] as Record<string, unknown>)['text'];
          if (typeof text === 'string') return text;
        }
      }
    }
    return JSON.stringify(jd);
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
  } catch (e: unknown) {
    out.ok = false; out.error = String((e as Error).message || e);
  }
  return out;
}







export async function fetchFEMA(): Promise<RtaEvent[]> {
  try {
    const url = `https://gis.fema.gov/arcgis/rest/services/IncidentManagement/DisasterDeclarationsSummaries/FeatureServer/0/query?where=1%3D1&outFields=declarationDate,incidentType,declaredCountyArea,declaredState,disasterNumber&returnGeometry=true&outSR=4326&f=json`;
    const r = await fetchWithTimeout(url);
    const jd = await r.json() as { features?: Record<string, unknown>[] };
    const feats: Record<string, unknown>[] = Array.isArray(jd?.features) ? jd.features : [];
    return feats.map((f: Record<string, unknown>, idx: number) => {
      const attr = (f['attributes'] as Record<string, unknown>) || {};
      const geom = (f['geometry'] as Record<string, unknown>) || {};
      const tsNumRaw = attr['declarationDate'];
      const tsNum = typeof tsNumRaw === 'number' ? tsNumRaw : null;
      const ts = tsNum ? new Date(tsNum).toISOString() : new Date().toISOString();
      const lonRaw = geom['x'];
      const latRaw = geom['y'];
      const lon = typeof lonRaw === 'number' ? lonRaw : null;
      const lat = typeof latRaw === 'number' ? latRaw : null;
      return {
        id: String(attr.disasterNumber || `fema-${idx}`),
        timestamp: ts,
        source: 'fema_disasters',
        latitude: lat,
        longitude: lon,
        confidence: 1,
        data: { incidentType: attr['incidentType'], county: attr['declaredCountyArea'], state: attr['declaredState'] },
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
    const jd = await r.json() as { features?: Record<string, unknown>[] };
    const feats: Record<string, unknown>[] = Array.isArray(jd?.features) ? jd.features : [];
    return feats.map((f: Record<string, unknown>, idx: number) => {
      const attr = (f['attributes'] as Record<string, unknown>) || {};
      const geom = (f['geometry'] as Record<string, unknown>) || {};
      const lonRaw = geom['x'];
      const latRaw = geom['y'];
      const lon = typeof lonRaw === 'number' ? lonRaw : null;
      const lat = typeof latRaw === 'number' ? latRaw : null;
      return {
        id: String(attr.id || `hifld-${idx}`),
        timestamp: new Date().toISOString(),
        source: 'hifld_hospital',
        latitude: lat,
        longitude: lon,
        confidence: 1,
        data: { name: attr['name'], type: attr['type'], state: attr['state'] },
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
    const jd = await r.json() as { features?: Record<string, unknown>[] };
    const feats: Record<string, unknown>[] = Array.isArray(jd?.features) ? jd.features : [];
    return feats.map((f: Record<string, unknown>, idx: number) => {
      const attr = (f['attributes'] as Record<string, unknown>) || {};
  const latRaw = attr['INTPTLAT'];
  const lonRaw = attr['INTPTLON'];
  const lat = latRaw != null ? parseFloat(String(latRaw)) : null;
  const lon = lonRaw != null ? parseFloat(String(lonRaw)) : null;
  return {
    id: String(attr.GEOID || `census-${idx}`),
    timestamp: new Date().toISOString(),
    source: 'census_pop',
    latitude: typeof lat === 'number' && isFinite(lat) ? lat : null,
    longitude: typeof lon === 'number' && isFinite(lon) ? lon : null,
    confidence: 1,
    data: { name: attr['NAME'], state: attr['STATE'] },
  };
    });
  } catch {
    return [];
  }
}
export async function fetchGlobalPopulationByContinent(): Promise<{ total: number; continents: Record<string, number> }> {
  try {
    const r = await fetchWithTimeout('https://restcountries.com/v3.1/all?fields=population,region,subregion', { timeoutMs: 10000 });
    const rows = await r.json() as Array<Record<string, unknown>>;
    const continents: Record<string, number> = { 'Africa': 0, 'Asia': 0, 'Europe': 0, 'North America': 0, 'South America': 0, 'Oceania': 0, 'Antarctica': 0 };
    rows.forEach((c: Record<string, unknown>) => {
      const pop = Number(c['population'] || 0);
      const region = String(c['region'] || '');
      const sub = String(c['subregion'] || '');
      let key = '';
      if (region === 'Africa') key = 'Africa';
      else if (region === 'Asia') key = 'Asia';
      else if (region === 'Europe') key = 'Europe';
      else if (region === 'Americas') key = /North/i.test(sub) ? 'North America' : /South/i.test(sub) ? 'South America' : 'North America';
      else if (region === 'Oceania') key = 'Oceania';
      else if (region === 'Antarctic') key = 'Antarctica';
      if (key) continents[key] = (continents[key] || 0) + (isFinite(pop) ? pop : 0);
    });
    const total = Object.values(continents).reduce((a, b) => a + b, 0);
    return { total, continents };
  } catch {
    return { total: 0, continents: {} };
  }
}