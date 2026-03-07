import React, { useEffect, useRef, useState } from 'react';
import { getBackendBase, fetchBackendEvents, type RtaEvent, getSupabaseConfig, fetchSupabaseEvents, eventSeverity, listEventTags, addEventTag, listEventAnnotations, addEventAnnotation } from '../services/data';
import { getSupabaseClient } from '../utils/supabase';
import Globe from '../components/Globe';
import EventFeed from '../components/EventFeed';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import Heatmap from 'ol/layer/Heatmap';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import MapLayers from '../components/MapLayers';

function CamViewer({ name, url, onClose }: { name: string; url: string; onClose: () => void }) {
  const [tick, setTick] = useState(0);
  const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)(\?|$)/i.test(url) || url.includes('/image');
  useEffect(() => {
    if (!isImage) return;
    const ms = Math.max(30000, Number(window.localStorage.getItem('camRefreshMs') || '120000'));
    const id = setInterval(() => setTick(t => t + 1), ms);
    return () => clearInterval(id);
  }, [isImage, url]);
  const src = isImage ? `${url}${url.includes('?') ? '&' : '?'}t=${tick}` : url;
  return (
    <div className="absolute top-4 right-4 bg-black/80 border border-white/10 rounded shadow-2xl w-[360px] h-[220px]">
      <div className="flex items-center justify-between p-2 text-xs text-gray-300"><div>{name}</div><button className="px-2 py-1 bg-white/10 rounded" onClick={onClose}>Close</button></div>
      {isImage ? (
        <img alt="public-cam" src={src} className="w-full h-[180px] object-cover" />
      ) : (
        <iframe title="public-cam" src={src} className="w-full h-[180px]" allow="autoplay; encrypted-media" allowFullScreen />
      )}
    </div>
  );
}

function GeofenceControls({ onAdd, focus }: { onAdd: (f: { id: string; name: string; lat: number; lon: number; radiusM: number }) => void; focus: RtaEvent | null }) {
  const [name, setName] = useState('Fence 1');
  const [lat, setLat] = useState<number | ''>('');
  const [lon, setLon] = useState<number | ''>('');
  const [radius, setRadius] = useState<number>(10000);
  const useFocus = () => { if (focus?.latitude != null && focus?.longitude != null) { setLat(focus.latitude); setLon(focus.longitude); } };
  const add = () => {
    if (typeof lat !== 'number' || typeof lon !== 'number') return;
    const id = `${name}-${lat.toFixed(2)}-${lon.toFixed(2)}`;
    onAdd({ id, name, lat, lon, radiusM: radius });
    setName(`Fence ${Math.floor(Math.random()*1000)}`);
  };
  return (
    <div className="text-xs">
      <div className="flex gap-2">
        <input className="px-2 py-1 bg-black/20 border border-white/10 rounded flex-1" placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
        <button className="px-2 py-1 bg-white/10 rounded" onClick={useFocus}>Use focus</button>
      </div>
      <div className="flex gap-2 mt-2">
        <input className="px-2 py-1 bg-black/20 border border-white/10 rounded w-24" placeholder="Lat" value={typeof lat === 'number' ? String(lat) : lat} onChange={e=>setLat(Number(e.target.value))} />
        <input className="px-2 py-1 bg-black/20 border border-white/10 rounded w-24" placeholder="Lon" value={typeof lon === 'number' ? String(lon) : lon} onChange={e=>setLon(Number(e.target.value))} />
        <input className="px-2 py-1 bg-black/20 border border-white/10 rounded w-24" placeholder="Radius m" value={radius} onChange={e=>setRadius(Number(e.target.value)||0)} />
      </div>
      <button className="mt-2 px-2 py-1 bg-gradient-to-r from-cyan-500 to-violet-500 text-black rounded" onClick={add}>Add geofence</button>
    </div>
  );
}


export default function MapPage() {
  const [events, setEvents] = useState<RtaEvent[]>([]);
  
  const [hoursWindow, setHoursWindow] = useState(24);
  const [loading, setLoading] = useState(true);
  const [cams, setCams] = useState<Array<{ name: string; lat: number; lon: number; url: string }>>(() => {
    try {
      const raw = window.localStorage.getItem('publicCams');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [camName, setCamName] = useState('');
  const [camLat, setCamLat] = useState<number | ''>('');
  const [camLon, setCamLon] = useState<number | ''>('');
  const [camUrl, setCamUrl] = useState('');
  const [showCam, setShowCam] = useState<{ name: string; url: string } | null>(null);
  
  const [mapFocus, setMapFocus] = useState<RtaEvent | null>(null);
  const [showStreetMap, setShowStreetMap] = useState(false);
  const [basemap, setBasemap] = useState<'street' | 'satellite' | 'terrain'>('street');
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [mouseLatLon, setMouseLatLon] = useState<{ lat: number; lon: number } | null>(null);
  const [layersEnabled, setLayersEnabled] = useState<Record<string, boolean>>({ aviation: true, maritime: true, weather: true, government: true, news: true });
  const [measureA, setMeasureA] = useState<{ lat: number; lon: number } | null>(null);
  const [measureB, setMeasureB] = useState<{ lat: number; lon: number } | null>(null);
  const [losHeights, setLosHeights] = useState<{ a: number; b: number }>({ a: 10, b: 10 });
  const [geofences, setGeofences] = useState<Array<{ id: string; name: string; lat: number; lon: number; radiusM: number }>>([]);
  const [alerts, setAlerts] = useState<Array<{ fenceId: string; eventId: string; when: string }>>([]);
  const [tagText, setTagText] = useState('');
  const [annotationText, setAnnotationText] = useState('');
  const [eventTags, setEventTags] = useState<Array<{ id: number; tag: string; created_at: string }>>([]);
  const [eventAnnotations, setEventAnnotations] = useState<Array<{ id: number; text: string; ts: string }>>([]);
  const streetMapRef = useRef<HTMLDivElement | null>(null);
  const olRef = useRef<Map | null>(null);
  const heatSourceRef = useRef<VectorSource | null>(null);
  const heatLayerRef = useRef<Heatmap | null>(null);

  useEffect(() => {
    try {
      if (cams.length === 0) {
        const url = (typeof window !== 'undefined' ? window.localStorage.getItem('camManifestUrl') : null) || (import.meta.env.VITE_PUBLIC_CAM_MANIFEST as unknown as string | undefined) || '/cams.json';
        const loadDefaults = async () => {
          const defaults: Array<{ name: string; lat: number; lon: number; url: string }> = [
            { name: 'Times Square, NYC', lat: 40.7580, lon: -73.9855, url: 'https://www.youtube.com/embed/1EiC9bvVGnk' },
            { name: 'Shibuya Crossing, Tokyo', lat: 35.6595, lon: 139.7005, url: 'https://www.youtube.com/embed/7j4ZcQ9t_hk' },
            { name: 'Trafalgar Sq, London', lat: 51.5080, lon: -0.1281, url: 'https://www.youtube.com/embed/m8J7y3ZxH3I' },
            { name: 'Eiffel Tower, Paris', lat: 48.8584, lon: 2.2945, url: 'https://www.youtube.com/embed/9d9mWQ2G_jk' },
            { name: 'Marina Bay, Singapore', lat: 1.2834, lon: 103.8607, url: 'https://www.youtube.com/embed/8Ry0WZ8QKQQ' },
            { name: 'Sydney Harbour', lat: -33.8523, lon: 151.2108, url: 'https://www.youtube.com/embed/lCjv1nGqkd4' },
            { name: 'Copacabana, Rio', lat: -22.9711, lon: -43.1822, url: 'https://www.youtube.com/embed/DHXL2rYQ6nA' },
            { name: 'Downtown Dubai', lat: 25.1972, lon: 55.2744, url: 'https://www.youtube.com/embed/2Q2Zp8nX8X8' },
            { name: 'CN Tower, Toronto', lat: 43.6426, lon: -79.3871, url: 'https://www.youtube.com/embed/J4uYqCAd9Io' },
            { name: 'Golden Gate, SF', lat: 37.8199, lon: -122.4783, url: 'https://www.youtube.com/embed/YB3YF8Tn-UM' },
            { name: 'Alexanderplatz, Berlin', lat: 52.5219, lon: 13.4132, url: 'https://www.youtube.com/embed/8X4G1r8o5Wc' },
            { name: 'Piazza San Marco, Venice', lat: 45.4340, lon: 12.3380, url: 'https://www.youtube.com/embed/s8h7G7r6r8o' }
          ];
          setCams(defaults);
          try { window.localStorage.setItem('publicCams', JSON.stringify(defaults)); } catch {}
        };
        if (url) {
          (async () => {
            try {
              const r = await fetch(String(url), { cache: 'no-store' });
              if (r.ok) {
                const j = await r.json();
                type CamManifestItem = { name?: string; title?: string; lat?: number; latitude?: number; lon?: number; longitude?: number; url?: string; embed?: string };
                const arr: CamManifestItem[] = Array.isArray(j)
                  ? (j as CamManifestItem[])
                  : (typeof j === 'object' && j !== null && Array.isArray((j as { cameras?: unknown }).cameras))
                    ? ((j as { cameras: CamManifestItem[] }).cameras)
                    : [];
                if (arr.length > 0) {
                  const mapped = arr.map((c) => ({ name: String(c.name || c.title || 'Public Cam'), lat: Number(c.lat ?? c.latitude ?? NaN), lon: Number(c.lon ?? c.longitude ?? NaN), url: String(c.url ?? c.embed ?? '') })).filter(c => c.name && !isNaN(c.lat) && !isNaN(c.lon) && c.url);
                  if (mapped.length > 0) {
                    setCams(mapped);
                    try { window.localStorage.setItem('publicCams', JSON.stringify(mapped)); } catch {}
                    return;
                  }
                }
              }
            } catch {}
            await loadDefaults();
          })();
        } else {
          loadDefaults();
        }
      }
    } catch {}
  }, []);

  const cameraEvents: RtaEvent[] = React.useMemo(() => {
    return cams.map((c, idx) => ({
      id: `cam-${idx}`,
      source: `Public Camera: ${c.name}`,
      timestamp: new Date().toISOString(),
      latitude: c.lat,
      longitude: c.lon,
      confidence: 0.9,
      data: { url: c.url }
    }));
  }, [cams]);

  useEffect(() => {
    (async () => {
      const supa = getSupabaseConfig();
      const client = await getSupabaseClient();
      if (client && supa.table) {
        const ch = client.channel('rtaip-map')
          .on('postgres_changes', { event: '*', schema: 'public', table: supa.table }, (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
            try {
              const row = (payload.new || payload.old || {}) as Record<string, unknown>;
              const e: RtaEvent = {
                id: String(row.id || `${row.source}-${row.timestamp}`),
                source: String(row.source || 'supabase'),
                timestamp: typeof row.timestamp === 'string' ? row.timestamp : new Date().toISOString(),
                latitude: typeof row.latitude === 'number' ? (row.latitude as number) : (typeof row.lat === 'number' ? (row.lat as number) : null),
                longitude: typeof row.longitude === 'number' ? (row.longitude as number) : (typeof row.lon === 'number' ? (row.lon as number) : null),
                confidence: typeof row.confidence === 'number' ? (row.confidence as number) : 0.6,
                data: row as Record<string, unknown>
              };
              if (/usgs|noaa/i.test(String(e.source || ''))) return;
              setEvents(prev => {
                const idx = prev.findIndex(p => p.id === e.id);
                if (idx >= 0) { const next = prev.slice(); next[idx] = e; return next; }
                return [e, ...prev].slice(0, 5000);
              });
            } catch {}
          })
          .subscribe();
        return () => { try { client.removeChannel(ch); } catch {} };
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const backend = getBackendBase();
      const supa = getSupabaseConfig();
      const fallback = (window.localStorage.getItem('useOpenFallback') || 'true') === 'true';
      let all: RtaEvent[] = [];
      if (supa.url && supa.anon) {
        all = await fetchSupabaseEvents();
        if (all.length === 0 && backend) {
          all = await fetchBackendEvents();
        }
      } else if (backend) {
        all = await fetchBackendEvents();
      } else if (fallback) {
        all = [];
      }
      if (!cancelled) {
        setEvents(all);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const eid = Number(mapFocus?.id || '0');
    if (!eid || !isFinite(eid)) { setEventTags([]); setEventAnnotations([]); return; }
    listEventTags(eid).then(ts => setEventTags(ts.map(t => ({ id: t.id, tag: t.tag, created_at: t.created_at }))));
    listEventAnnotations(eid).then(as => setEventAnnotations(as.map(a => ({ id: a.id, text: a.text, ts: a.ts }))));
  }, [mapFocus?.id]);

  useEffect(() => {
    if (showStreetMap && mapFocus && mapFocus.latitude != null && mapFocus.longitude != null) {
      if (!streetMapRef.current) return;
      const baseLayer = new TileLayer({ source: basemap === 'street' ? new OSM() : basemap === 'terrain' ? new XYZ({ url: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png' }) : new XYZ({ url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' }) });
      if (!olRef.current) {
        olRef.current = new Map({ target: streetMapRef.current, layers: [baseLayer], view: new View({ center: fromLonLat([mapFocus.longitude, mapFocus.latitude]), zoom: 14 }) });
      } else {
        const layers = olRef.current.getLayers();
        layers.setAt(0, baseLayer);
        olRef.current.setTarget(streetMapRef.current);
        olRef.current.getView().setCenter(fromLonLat([mapFocus.longitude, mapFocus.latitude]));
        olRef.current.getView().setZoom(14);
      }
      if (showHeatmap) {
        if (!heatSourceRef.current) heatSourceRef.current = new VectorSource();
        if (!heatLayerRef.current) {
          heatLayerRef.current = new Heatmap({ source: heatSourceRef.current, blur: 12, radius: 8 });
          olRef.current.addLayer(heatLayerRef.current);
        }
      } else {
        if (heatLayerRef.current && olRef.current) { olRef.current.removeLayer(heatLayerRef.current); heatLayerRef.current = null; heatSourceRef.current = null; }
      }
    } else if (olRef.current) {
      olRef.current.setTarget(undefined as unknown as HTMLElement);
    }
  }, [showStreetMap, mapFocus, basemap, showHeatmap]);

  useEffect(() => {
    const r = Number(window.localStorage.getItem('refreshMs') || '60000');
    const id = setInterval(() => {
      const backend = getBackendBase();
      if (backend) {
        fetchBackendEvents().then(setEvents).catch(()=>{});
      }
    }, Math.max(15000, r));
    return () => clearInterval(id);
  }, []);

  const categoryForSource = (src: string): string => {
    const s = src.toLowerCase();
    if (s.includes('periscope') || s.includes('adsb') || s.includes('opensky') || s.includes('air') || s.includes('flight')) return 'aviation';
    if (s.includes('pub log') || s.includes('ais') || s.includes('maritime') || s.includes('vessel') || s.includes('ship')) return 'maritime';
    if (s.includes('tearline') || s.includes('eonet') || s.includes('gdacs') || s.includes('wildfire') || s.includes('storm') || s.includes('disaster') || s.includes('noaa') || s.includes('usgs')) return 'weather';
    if (s.includes('usace') || s.includes('dtic') || s.includes('odin') || s.includes('janes') || s.includes('government')) return 'government';
    if (s.includes('terror') || s.includes('gtd') || s.includes('start')) return 'news';
    return 'other';
  };

  const filteredEvents = React.useMemo(() => {
    const cutoff = Date.now() - hoursWindow * 3600000;
    return events.filter(e => {
      const t = new Date(e.timestamp).getTime();
      if (isNaN(t) || t < cutoff) return false;
      const cat = categoryForSource(String(e.source||''));
      if (cat in layersEnabled) return layersEnabled[cat];
      return true;
    });
  }, [events, hoursWindow, layersEnabled]);

  useEffect(() => {
    if (showStreetMap && heatSourceRef.current) {
      const feats: Feature[] = [];
      filteredEvents.forEach(e => {
        if (e.latitude != null && e.longitude != null) {
          const f = new Feature({ geometry: new Point(fromLonLat([e.longitude as number, e.latitude as number])) });
          f.set('weight', Math.max(0.1, eventSeverity(e)) as unknown as number);
          feats.push(f);
        }
      });
      heatSourceRef.current.clear();
      heatSourceRef.current.addFeatures(feats);
    }
    const gf: Array<{ fenceId: string; eventId: string; when: string }> = [];
    filteredEvents.forEach(e => {
      if (e.latitude == null || e.longitude == null) return;
      geofences.forEach(f => {
        const d = haversine(e.latitude as number, e.longitude as number, f.lat, f.lon);
        if (d <= f.radiusM) gf.push({ fenceId: f.id, eventId: e.id, when: new Date(e.timestamp).toISOString() });
      });
    });
    setAlerts(gf);
  }, [filteredEvents, showStreetMap, geofences]);

  const onLayerChange = (layer: string, enabled: boolean) => {
    setLayersEnabled(prev => ({ ...prev, [layer]: enabled }));
  };


  const distanceAB = React.useMemo(() => {
    if (!measureA || !measureB) return null;
    return haversine(measureA.lat, measureA.lon, measureB.lat, measureB.lon);
  }, [measureA, measureB]);

  const bearingAB = React.useMemo(() => {
    if (!measureA || !measureB) return null;
    return initialBearing(measureA.lat, measureA.lon, measureB.lat, measureB.lon);
  }, [measureA, measureB]);

  const losAB = React.useMemo(() => {
    if (!measureA || !measureB) return null;
    const d = haversine(measureA.lat, measureA.lon, measureB.lat, measureB.lon);
    const ha = horizonDistance(losHeights.a);
    const hb = horizonDistance(losHeights.b);
    return { distance: d, horizon: ha + hb, ok: d <= (ha + hb) };
  }, [measureA, measureB, losHeights]);

  function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const toRad = (v: number) => v * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (v: number) => v * Math.PI / 180;
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1))*Math.sin(toRad(lat2)) - Math.sin(toRad(lat1))*Math.cos(toRad(lat2))*Math.cos(dLon);
    const brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
  }
  function horizonDistance(hMeters: number): number { const R = 6371000; return Math.sqrt(2 * R * Math.max(0, hMeters)); }

  return (
    <div className="flow-gradient text-white min-h-screen animate-in fade-in duration-700">
      <div className="p-4 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4 animate-in slide-in-from-left-2 duration-500">
              <h2 className="text-lg font-bold mb-4">Controls</h2>
              
              {/* Time Window */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Time Window</span>
                  <span className="text-gray-400">{hoursWindow}h</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="168" 
                  value={hoursWindow} 
                  onChange={(e) => setHoursWindow(Number(e.target.value))} 
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer transition-all duration-300"
                />
              </div>

              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Street View Overlay</span>
                <button className="px-2 py-1 bg-white/10 border border-white/10 rounded-md hover:bg-white/20 transition-colors" onClick={() => setShowStreetMap(s => !s)}>{showStreetMap ? 'Hide' : 'Show'}</button>
              </div>

              {/* Source Toggles */}
              <div className="mb-4">
                <h3 className="text-md font-semibold mb-2">Sources</h3>
                <div className="flex flex-col space-y-2 text-sm"></div>
              </div>
              <div className="mb-4">
                <h3 className="text-md font-semibold mb-2">Public Cameras</h3>
                <div className="text-xs text-gray-400 mb-1">Add public camera feeds (image URLs preferred)</div>
                <input className="px-2 py-1 bg-black/20 border border-white/10 rounded w-full mt-1" placeholder="Name" value={camName} onChange={e=>setCamName(e.target.value)} />
                <div className="flex gap-2 mt-2">
                  <input className="px-2 py-1 bg-black/20 border border-white/10 rounded w-24" placeholder="Lat" value={typeof camLat==='number'?String(camLat):camLat} onChange={e=>setCamLat(Number(e.target.value))} />
                  <input className="px-2 py-1 bg-black/20 border border-white/10 rounded w-24" placeholder="Lon" value={typeof camLon==='number'?String(camLon):camLon} onChange={e=>setCamLon(Number(e.target.value))} />
                </div>
                <input className="px-2 py-1 bg-black/20 border border-white/10 rounded w-full mt-2" placeholder="Feed URL (https://... jpg/png/mp4)" value={camUrl} onChange={e=>setCamUrl(e.target.value)} />
                <div className="flex gap-2 mt-2">
                  <button className="px-2 py-1 bg-white/10 rounded" onClick={()=>{
                    if (!camName || typeof camLat!=='number' || typeof camLon!=='number' || !camUrl) return;
                    const next = [...cams, { name: camName, lat: camLat, lon: camLon, url: camUrl }];
                    setCams(next); try { window.localStorage.setItem('publicCams', JSON.stringify(next)); } catch {}
                    setCamName(''); setCamLat(''); setCamLon(''); setCamUrl('');
                  }}>Add</button>
                  <button className="px-2 py-1 bg-white/10 rounded" onClick={()=>{ setCams([]); try { window.localStorage.removeItem('publicCams'); } catch {} }}>Clear</button>
                  <button className="px-2 py-1 bg-white/10 rounded" onClick={async()=>{
                    try { window.localStorage.removeItem('publicCams'); } catch {}
                    const url = (typeof window !== 'undefined' ? window.localStorage.getItem('camManifestUrl') : null) || (import.meta.env.VITE_PUBLIC_CAM_MANIFEST as unknown as string | undefined);
                    if (url) {
                      try {
                        const r = await fetch(String(url), { cache: 'no-store' });
                        if (r.ok) {
                          const j = await r.json();
                          type CamManifestItem = { name?: string; title?: string; lat?: number; latitude?: number; lon?: number; longitude?: number; url?: string; embed?: string };
                          const arr: CamManifestItem[] = Array.isArray(j)
                            ? (j as CamManifestItem[])
                            : (typeof j === 'object' && j !== null && Array.isArray((j as { cameras?: unknown }).cameras))
                              ? ((j as { cameras: CamManifestItem[] }).cameras)
                              : [];
                          const mapped = arr.map((c) => ({ name: String(c.name || c.title || 'Public Cam'), lat: Number(c.lat ?? c.latitude ?? NaN), lon: Number(c.lon ?? c.longitude ?? NaN), url: String(c.url ?? c.embed ?? '') })).filter(c => c.name && !isNaN(c.lat) && !isNaN(c.lon) && c.url);
                          if (mapped.length > 0) { setCams(mapped); try { window.localStorage.setItem('publicCams', JSON.stringify(mapped)); } catch {} return; }
                        }
                      } catch {}
                    }
                    const defaults: Array<{ name: string; lat: number; lon: number; url: string }> = [
                      { name: 'Times Square, NYC', lat: 40.7580, lon: -73.9855, url: 'https://www.youtube.com/embed/1EiC9bvVGnk' },
                      { name: 'Shibuya Crossing, Tokyo', lat: 35.6595, lon: 139.7005, url: 'https://www.youtube.com/embed/7j4ZcQ9t_hk' },
                      { name: 'Trafalgar Sq, London', lat: 51.5080, lon: -0.1281, url: 'https://www.youtube.com/embed/m8J7y3ZxH3I' },
                      { name: 'Eiffel Tower, Paris', lat: 48.8584, lon: 2.2945, url: 'https://www.youtube.com/embed/9d9mWQ2G_jk' },
                      { name: 'Marina Bay, Singapore', lat: 1.2834, lon: 103.8607, url: 'https://www.youtube.com/embed/8Ry0WZ8QKQQ' },
                      { name: 'Sydney Harbour', lat: -33.8523, lon: 151.2108, url: 'https://www.youtube.com/embed/lCjv1nGqkd4' },
                      { name: 'Copacabana, Rio', lat: -22.9711, lon: -43.1822, url: 'https://www.youtube.com/embed/DHXL2rYQ6nA' },
                      { name: 'Downtown Dubai', lat: 25.1972, lon: 55.2744, url: 'https://www.youtube.com/embed/2Q2Zp8nX8X8' },
                      { name: 'CN Tower, Toronto', lat: 43.6426, lon: -79.3871, url: 'https://www.youtube.com/embed/J4uYqCAd9Io' },
                      { name: 'Golden Gate, SF', lat: 37.8199, lon: -122.4783, url: 'https://www.youtube.com/embed/YB3YF8Tn-UM' }
                    ];
                    setCams(defaults); try { window.localStorage.setItem('publicCams', JSON.stringify(defaults)); } catch {}
                  }}>Load World Cams</button>
                </div>
                <div className="mt-2 max-h-28 overflow-y-auto text-xs">
                  {cams.map((c,i)=>(<div key={i} className="mt-1 flex items-center justify-between"><span>{c.name}</span><div className="flex gap-2"><button className="px-2 py-1 bg-white/10 rounded" onClick={()=>{ setMapFocus({ id:`cam-${i}`, source:`Public Camera: ${c.name}`, timestamp:new Date().toISOString(), latitude:c.lat, longitude:c.lon, confidence:0.9, data:{ url: c.url } }); setShowCam({ name: c.name, url: c.url }); }}>Open</button><button className="px-2 py-1 bg-white/10 rounded" onClick={()=>{ const next = cams.filter((_,j)=>j!==i); setCams(next); try{ window.localStorage.setItem('publicCams', JSON.stringify(next)); } catch {} }}>Remove</button></div></div>))}
                  {cams.length===0 && (<div className="text-gray-500">No cameras configured</div>)}
                </div>
              </div>

              
              
            </div>

            {/* Event Feed */}
            <EventFeed 
              events={events.filter(e => {
                const t = new Date(e.timestamp).getTime();
                const cutoff = Date.now() - hoursWindow * 3600000;
                return !isNaN(t) && t >= cutoff;
              })} 
              onSelect={(e) => { setMapFocus(f => f?.id === e.id ? null : e); }} 
              focus={mapFocus} 
            />
            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4 mt-4">
              <div className="text-lg font-semibold mb-2">Measurement</div>
              <div className="text-xs">Point A: {measureA ? `${measureA.lat.toFixed(4)}, ${measureA.lon.toFixed(4)}` : 'unset'} <button className="ml-2 px-2 py-1 bg-white/10 rounded" onClick={() => { if (mapFocus?.latitude != null && mapFocus?.longitude != null) setMeasureA({ lat: mapFocus.latitude, lon: mapFocus.longitude }); }}>Use focus</button></div>
              <div className="text-xs mt-1">Point B: {measureB ? `${measureB.lat.toFixed(4)}, ${measureB.lon.toFixed(4)}` : 'unset'} <button className="ml-2 px-2 py-1 bg-white/10 rounded" onClick={() => { if (mapFocus?.latitude != null && mapFocus?.longitude != null) setMeasureB({ lat: mapFocus.latitude, lon: mapFocus.longitude }); }}>Use focus</button></div>
              <div className="text-xs mt-2">Distance: {distanceAB ? `${(distanceAB/1000).toFixed(2)} km` : '-'}</div>
              <div className="text-xs">Bearing: {bearingAB ? `${bearingAB.toFixed(1)}°` : '-'}</div>
              <div className="text-xs mt-2">Line-of-sight heights (m)</div>
              <div className="flex gap-2 mt-1">
                <input className="px-2 py-1 bg-black/20 border border-white/10 rounded w-20" type="number" value={losHeights.a} onChange={e=>setLosHeights(s=>({ ...s, a: Number(e.target.value)||0 }))} />
                <input className="px-2 py-1 bg-black/20 border border-white/10 rounded w-20" type="number" value={losHeights.b} onChange={e=>setLosHeights(s=>({ ...s, b: Number(e.target.value)||0 }))} />
              </div>
              <div className="text-xs mt-1">LoS: {losAB ? (losAB.ok ? 'Clear' : 'Obstructed') : '-'}</div>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4 mt-4">
              <div className="text-lg font-semibold mb-2">Geofences</div>
              <GeofenceControls onAdd={(f) => setGeofences(prev => [...prev, f])} focus={mapFocus} />
              <div className="text-xs mt-3">Alerts: {alerts.length}</div>
              <div className="max-h-40 overflow-y-auto mt-2 text-xs">
                {alerts.slice(0,20).map((a,i)=>(<div key={i} className="mt-1">Fence {a.fenceId} match • Event {a.eventId} • {new Date(a.when).toLocaleString()}</div>))}
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4 mt-4">
              <div className="text-lg font-semibold mb-2">Tags & Annotations</div>
              {!mapFocus && (<div className="text-xs text-gray-400">Select an event to manage tags and annotations.</div>)}
              {mapFocus && (
                <>
                  <div className="text-xs text-gray-300">Event ID: {mapFocus.id}</div>
                  <div className="mt-2 grid md:grid-cols-3 gap-2">
                    <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="Tag" value={tagText} onChange={e=>setTagText(e.target.value)} />
                    <button className="px-3 py-2 bg-white/20 rounded" onClick={async ()=>{ const eid = Number(mapFocus.id || '0'); if (!eid || !isFinite(eid) || !tagText.trim()) return; const id = await addEventTag(eid, tagText.trim()); if (id) { setTagText(''); const ts = await listEventTags(eid); setEventTags(ts.map(t => ({ id: t.id, tag: t.tag, created_at: t.created_at }))); } }}>Add tag</button>
                    <button className="px-3 py-2 bg-white/20 rounded" onClick={async ()=>{ const eid = Number(mapFocus.id || '0'); if (!eid || !isFinite(eid)) return; const ts = await listEventTags(eid); setEventTags(ts.map(t => ({ id: t.id, tag: t.tag, created_at: t.created_at }))); }}>Refresh tags</button>
                  </div>
                  <div className="mt-2 text-xs max-h-28 overflow-y-auto">
                    {eventTags.map(t => (<div key={t.id} className="mt-1">{t.created_at} — {t.tag}</div>))}
                    {eventTags.length===0 && (<div className="text-gray-400">No tags</div>)}
                  </div>
                  <div className="mt-3 grid md:grid-cols-3 gap-2">
                    <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="Annotation" value={annotationText} onChange={e=>setAnnotationText(e.target.value)} />
                    <button className="px-3 py-2 bg-white/20 rounded" onClick={async ()=>{ const eid = Number(mapFocus.id || '0'); if (!eid || !isFinite(eid) || !annotationText.trim()) return; const id = await addEventAnnotation(eid, annotationText.trim()); if (id) { setAnnotationText(''); const as = await listEventAnnotations(eid); setEventAnnotations(as.map(a => ({ id: a.id, text: a.text, ts: a.ts }))); } }}>Add annotation</button>
                    <button className="px-3 py-2 bg-white/20 rounded" onClick={async ()=>{ const eid = Number(mapFocus.id || '0'); if (!eid || !isFinite(eid)) return; const as = await listEventAnnotations(eid); setEventAnnotations(as.map(a => ({ id: a.id, text: a.text, ts: a.ts }))); }}>Refresh annotations</button>
                  </div>
                  <div className="mt-2 text-xs max-h-28 overflow-y-auto">
                    {eventAnnotations.map(a => (<div key={a.id} className="mt-1">{a.ts} — {a.text}</div>))}
                    {eventAnnotations.length===0 && (<div className="text-gray-400">No annotations</div>)}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 animate-in slide-in-from-right-2 duration-500">
            <div className="relative bg-white/10 backdrop-blur-md rounded-lg shadow-lg h-[calc(100vh-120px)] transition-all">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-10 w-10 rounded-full border-2 border-white/50 border-t-white animate-spin" />
                </div>
              )}
              <Globe events={[...filteredEvents, ...cameraEvents]} focus={mapFocus} onSelect={(e) => { setMapFocus(f => f?.id === e.id ? null : e); const data = e.data as { url?: string } | undefined; const u = data?.url; if (u) setShowCam({ name: String(e.source||'Camera'), url: u }); }} onHoverLatLon={(lat, lon) => setMouseLatLon({ lat, lon })} />

              {showStreetMap && mapFocus && mapFocus.latitude != null && mapFocus.longitude != null && (
                <div className="absolute inset-4 bg-black/80 border border-white/10 rounded-lg shadow-2xl">
                  <div className="flex items-center justify-between p-2 text-xs text-gray-300">
                    <div>
                      Street View • Lat: {mapFocus.latitude?.toFixed(4)} • Lon: {mapFocus.longitude?.toFixed(4)} • Basemap:
                      <select className="ml-2 bg-black/40 border border-white/20 rounded" value={basemap} onChange={e=>setBasemap(e.target.value as 'street'|'satellite'|'terrain')}>
                        <option value="street">Street</option>
                        <option value="satellite">Satellite</option>
                        <option value="terrain">Terrain</option>
                      </select>
                      <label className="ml-3"><input type="checkbox" className="mr-1" checked={showHeatmap} onChange={e=>setShowHeatmap(e.target.checked)} />Heatmap</label>
                    </div>
                    <button className="px-2 py-1 bg-white/10 rounded-md" onClick={() => setShowStreetMap(false)}>Close</button>
                  </div>
                  <div ref={streetMapRef} style={{ width: '100%', height: 'calc(100% - 32px)' }} />
                </div>
              )}
              <MapLayers onLayerChange={onLayerChange} />
              {showCam && (
                <CamViewer name={showCam.name} url={showCam.url} onClose={() => setShowCam(null)} />
              )}
              {mouseLatLon && (
                <div className="absolute bottom-4 right-4 text-xs bg-black/60 border border-white/10 px-2 py-1 rounded">Lat: {mouseLatLon.lat.toFixed(4)} • Lon: {mouseLatLon.lon.toFixed(4)}</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}