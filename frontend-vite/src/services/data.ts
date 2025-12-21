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
  const local = typeof window !== 'undefined' ? window.localStorage.getItem('backendUrl') : null;
  return (local && local.trim()) || (env && env.trim()) || null;
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