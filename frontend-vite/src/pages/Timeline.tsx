import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchBackendEvents, type RtaEvent, eventSeverity, fetchSupabaseEvents, getSupabaseConfig, getBackendBase, getCachedEvents, setCachedEvents } from '../services/data';
import { NewHeader } from '../components/NewHeader';
import EventFeed from '../components/EventFeed';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import Style from 'ol/style/Style';
import Stroke from 'ol/style/Stroke';
import Fill from 'ol/style/Fill';
import CircleStyle from 'ol/style/Circle';

export default function Timeline() {
  const [events, setEvents] = useState<RtaEvent[]>([]);
  const [autoplay, setAutoplay] = useState(false);
  
  const [minSev, setMinSev] = useState(0);
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState<RtaEvent | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const olRef = useRef<Map | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const backend = getBackendBase();
      const supa = getSupabaseConfig();
      const fallback = (window.localStorage.getItem('useOpenFallback') || 'true') === 'true';
      let all: RtaEvent[] = getCachedEvents();
      if (supa.url && supa.anon) {
        const fresh = await fetchSupabaseEvents();
        all = fresh.length > 0 ? fresh : all;
        if (all.length === 0 && backend) {
          const be = await fetchBackendEvents();
          all = be.length > 0 ? be : all;
        }
      } else if (backend) {
        const be = await fetchBackendEvents();
        all = be.length > 0 ? be : all;
      }
      
      if (all.length === 0 && fallback) {
        const promises: Promise<RtaEvent[]>[] = [];

        const results = await Promise.all(promises);
        all = results.flat();
      }
      all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      if (!cancelled) {
        setEvents(all);
        if (all.length > 0) setCachedEvents(all);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const count = useMemo(() => events.length, [events]);
  const [replayHours, setReplayHours] = useState(24 * 365);
  const filtered = useMemo(() => {
    const cutoff = Date.now() - replayHours * 3600000;
    return events.filter(e => {
      const t = new Date(e.timestamp).getTime();
      if (isNaN(t) || t < cutoff) return false;
      

      
      const sev = eventSeverity(e);
      if (Math.round(sev * 100) < minSev) return false;
      if (query && !JSON.stringify(e.data || {}).toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [events, replayHours, minSev, query]);
  

  useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(() => {
      setReplayHours((h) => (h > 1 ? h - 1 : 12));
    }, 1500);
    return () => clearInterval(id);
  }, [autoplay]);

  function extractRoute(ev: RtaEvent | null): Array<[number, number]> {
    if (!ev) return [];
    const d = (ev.data || {}) as Record<string, unknown>;
    const maybeRoute = d.route as unknown;
    if (Array.isArray(maybeRoute)) {
      const pts: Array<[number, number]> = [];
      for (const p of maybeRoute) {
        if (Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number') {
          pts.push([p[1], p[0]]); // assume [lat, lon]
        } else if (p && typeof p === 'object') {
          const lat = (p as Record<string, unknown>).lat;
          const lon = (p as Record<string, unknown>).lon ?? (p as Record<string, unknown>).lng;
          if (typeof lat === 'number' && typeof lon === 'number') pts.push([lon, lat]);
        }
      }
      if (pts.length > 0) return pts;
    }
    const origin = d.origin as unknown;
    const dest = d.destination as unknown;
    const pts: Array<[number, number]> = [];
    if (origin && typeof origin === 'object') {
      const o = origin as Record<string, unknown>;
      const lat = o.lat; const lon = o.lon ?? o.lng;
      if (typeof lat === 'number' && typeof lon === 'number') pts.push([lon, lat]);
    }
    if (dest && typeof dest === 'object') {
      const o = dest as Record<string, unknown>;
      const lat = o.lat; const lon = o.lon ?? o.lng;
      if (typeof lat === 'number' && typeof lon === 'number') pts.push([lon, lat]);
    }
    if (pts.length === 0 && ev.latitude != null && ev.longitude != null) pts.push([ev.longitude, ev.latitude]);
    return pts;
  }

  useEffect(() => {
    const pts = extractRoute(focus);
    if (!mapRef.current || pts.length === 0) return;
    if (!olRef.current) {
      olRef.current = new Map({
        target: mapRef.current,
        layers: [new TileLayer({ source: new OSM() })],
        view: new View({ center: fromLonLat(pts[0]), zoom: 5 })
      });
    } else {
      olRef.current.setTarget(mapRef.current);
    }
    const src = new VectorSource();
    const layer = new VectorLayer({ source: src, style: new Style({ stroke: new Stroke({ color: '#60a5fa', width: 3 }) }) });
    olRef.current.getLayers().forEach((l, i) => { if (i > 0) olRef.current?.removeLayer(l); });
    olRef.current.addLayer(layer);
    const line = new LineString(pts.map(p => fromLonLat(p)));
    src.addFeature(new Feature({ geometry: line }));
    const start = new Feature({ geometry: new Point(fromLonLat(pts[0])) });
    const end = new Feature({ geometry: new Point(fromLonLat(pts[pts.length - 1])) });
    start.setStyle(new Style({ image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#34d399' }), stroke: new Stroke({ color: '#10b981', width: 1 }) }) }));
    end.setStyle(new Style({ image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#f87171' }), stroke: new Stroke({ color: '#ef4444', width: 1 }) }) }));
    src.addFeature(start); src.addFeature(end);
    const extent = line.getExtent();
    olRef.current.getView().fit(extent, { padding: [40, 40, 40, 40], duration: 400 });
  }, [focus]);

  return (
    <div className="flow-gradient text-white min-h-screen">
      <NewHeader />
      <div className="container mx-auto px-6 py-24 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4 sticky top-24">
              <div className="text-lg font-bold text-white mb-4">Timeline Controls</div>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center justify-between text-xs text-gray-300 tracking-widest uppercase">
                    <span>Playback Window</span>
                    <span className="text-gray-400">{replayHours}h</span>
                  </label>
                  <input type="range" min="1" max="168" value={replayHours} onChange={(e) => setReplayHours(Number(e.target.value))} className="w-full mt-1" />
                </div>
                <div>
                  <div className="text-xs text-gray-300 tracking-widest uppercase mb-2">Sources</div>
                  <div className="flex flex-wrap gap-3 text-xs">

                  </div>
                </div>
                <div>
                  <label className="flex items-center justify-between text-xs text-gray-300 tracking-widest uppercase">
                    <span>Min Severity</span>
                    <span className="text-gray-400">{minSev}%</span>
                  </label>
                  <input type="range" min="0" max="100" value={minSev} onChange={(e) => setMinSev(Number(e.target.value))} className="w-full mt-1" />
                </div>
                <div>
                  <label className="text-xs text-gray-300 tracking-widest uppercase">Search</label>
                  <input className="w-full px-2 py-1 bg-black/20 border border-gray-700 rounded-md text-white mt-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Headline or data" />
                </div>
                <div className="pt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} />
                    Autoplay
                    <span className="text-xs text-gray-400">({filtered.length} / {count})</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4">
              {events.length === 0 ? (
                <div className="px-4 pb-4 text-xs text-gray-400">No events available yet. Try again shortly or check backend ingestion.</div>
              ) : (
                <EventFeed events={filtered} onSelect={(e) => setFocus(f => f?.id === e.id ? null : e)} focus={focus} />
              )}
            </div>
          </div>
          <div className="lg:col-span-1">
            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4 h-[420px]">
              <div className="text-sm text-gray-300 mb-2">Route Map</div>
              <div ref={mapRef} style={{ width: '100%', height: '360px' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}