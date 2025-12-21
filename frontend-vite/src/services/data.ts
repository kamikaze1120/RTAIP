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