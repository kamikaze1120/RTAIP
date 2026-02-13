import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NewHeader } from '../components/NewHeader';
import EventFeed from '../components/EventFeed';
import MapLayers from '../components/MapLayers';
import CommandPalette from '../components/CommandPalette';
import { fetchBackendEvents, type RtaEvent, getBackendBase } from '../services/data';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Circle from 'ol/geom/Circle';
import { fromLonLat, toLonLat } from 'ol/proj';
import Heatmap from 'ol/layer/Heatmap';
import { DragBox } from 'ol/interaction';
import { Fill, Stroke, Style, Circle as CircleStyle } from 'ol/style';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(lon2-lon1))*Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1))*Math.sin(toRad(lat2)) - Math.sin(toRad(lat1))*Math.cos(toRad(lat2))*Math.cos(toRad(lon2-lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export default function CommandCenter() {
  const [events, setEvents] = useState<RtaEvent[]>([]);
  const [focus, setFocus] = useState<RtaEvent | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const olRef = useRef<Map | null>(null);
  const srcRef = useRef<VectorSource | null>(null);
  const heatRef = useRef<Heatmap | null>(null);
  const measureRef = useRef<{ start?: [number, number]; end?: [number, number] }>({});
  const [tools, setTools] = useState<{ select: boolean; measure: boolean; geofence: boolean }>({ select: false, measure: false, geofence: false });
  const [leftW, setLeftW] = useState<number>(() => Number(localStorage.getItem('cc.leftW')||'320'));
  const [rightW, setRightW] = useState<number>(() => Number(localStorage.getItem('cc.rightW')||'360'));
  const [bottomH, setBottomH] = useState<number>(() => Number(localStorage.getItem('cc.bottomH')||'240'));
  const [showLeft, setShowLeft] = useState<boolean>(() => (localStorage.getItem('cc.showLeft')||'1')==='1');
  const [showRight, setShowRight] = useState<boolean>(() => (localStorage.getItem('cc.showRight')||'1')==='1');
  const [showBottom, setShowBottom] = useState<boolean>(() => (localStorage.getItem('cc.showBottom')||'1')==='1');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [heatOn, setHeatOn] = useState(false);
  const [bookmarks, setBookmarks] = useState<Array<{ name: string; lat: number; lon: number }>>(() => {
    try { const raw = localStorage.getItem('cc.bookmarks'); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });


  useEffect(() => {
    let cancelled = false;
    const load = async () => { try { const ev = await fetchBackendEvents(); if (!cancelled) setEvents(ev); } catch {} };
    load(); const id = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!olRef.current) {
      srcRef.current = new VectorSource();
      const layer = new VectorLayer({ source: srcRef.current, style: new Style({ image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#60a5fa' }), stroke: new Stroke({ color: '#93c5fd', width: 1 }) }) }) });
      heatRef.current = new Heatmap({ source: srcRef.current, blur: 12, radius: 8, weight: () => 0.6 });
      olRef.current = new Map({ target: mapRef.current, layers: [new TileLayer({ source: new OSM() }), layer], view: new View({ center: fromLonLat([0,0]), zoom: 2 }) });
    } else {
      olRef.current.setTarget(mapRef.current);
    }
  }, []);

  useEffect(() => {
    if (!srcRef.current) return;
    srcRef.current.clear();
    events.forEach(e => {
      if (e.latitude != null && e.longitude != null) {
        const f = new Feature({ geometry: new Point(fromLonLat([e.longitude as number, e.latitude as number])) });
        f.set('event', e);
        srcRef.current!.addFeature(f);
      }
    });
  }, [events]);

  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true); }
      if (e.key === 'h') { setHeatOn(v => !v); }
      if (e.key === 'l') { setShowLeft(v => !v); }
      if (e.key === 'r') { setShowRight(v => !v); }
      if (e.key === 't') { setShowBottom(v => !v); }
      if (e.key === '+') { olRef.current?.getView().setZoom((olRef.current?.getView().getZoom()||2) + 1); }
      if (e.key === '-') { olRef.current?.getView().setZoom((olRef.current?.getView().getZoom()||2) - 1); }
      if (e.key === 'g') { setTools(s => ({ ...s, geofence: !s.geofence })); }
      if (e.key === 'm') { setTools(s => ({ ...s, measure: !s.measure })); }
      if (e.key === 's') { snapshot(); }
      if (e.key === 'b') { bookmark(); }
      if (e.key === 'e') { explainCluster(); }
      if (e.key === 'Escape') { setTools({ select: false, measure: false, geofence: false }); }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, []);

  useEffect(() => {
    if (!olRef.current || !srcRef.current) return;
    const map = olRef.current;
    if (heatOn) {
      if (heatRef.current && !map.getLayers().getArray().includes(heatRef.current)) map.addLayer(heatRef.current);
    } else {
      if (heatRef.current && map.getLayers().getArray().includes(heatRef.current)) map.removeLayer(heatRef.current);
    }
  }, [heatOn]);

  useEffect(() => {
    localStorage.setItem('cc.leftW', String(leftW));
    localStorage.setItem('cc.rightW', String(rightW));
    localStorage.setItem('cc.bottomH', String(bottomH));
    localStorage.setItem('cc.showLeft', showLeft ? '1' : '0');
    localStorage.setItem('cc.showRight', showRight ? '1' : '0');
    localStorage.setItem('cc.showBottom', showBottom ? '1' : '0');
  }, [leftW, rightW, bottomH, showLeft, showRight, showBottom]);

  const startResize = (which: 'left'|'right'|'bottom', e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX; const startY = e.clientY;
    const init = { left: leftW, right: rightW, bottom: bottomH };
    const move = (ev: MouseEvent) => {
      if (which==='left') setLeftW(Math.max(220, init.left + (ev.clientX - startX)));
      if (which==='right') setRightW(Math.max(260, init.right - (ev.clientX - startX)));
      if (which==='bottom') setBottomH(Math.max(160, init.bottom - (ev.clientY - startY)));
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const snapshot = () => {
    try {
      const vp = olRef.current?.getViewport();
      const canvas = vp?.querySelector('canvas') as HTMLCanvasElement | null;
      const url = canvas?.toDataURL('image/png');
      if (url) {
        const a = document.createElement('a'); a.href = url; a.download = 'map-snapshot.png'; a.click();
      }
    } catch {}
  };

  const bookmark = () => {
    const v = olRef.current?.getView(); if (!v) return;
    const center = v.getCenter(); if (!center) return;
    const LL = toLonLat(center);
    const name = prompt('Bookmark name') || `BM ${new Date().toLocaleTimeString()}`;
    const list = [...bookmarks, { name, lat: LL[1], lon: LL[0] }];
    setBookmarks(list);
    try { localStorage.setItem('cc.bookmarks', JSON.stringify(list)); } catch {}
  };

  const commands = [
    { id: 'toggle-heat', label: 'Toggle Heatmap (H)', run: () => setHeatOn(v => !v) },
    { id: 'toggle-left', label: 'Toggle Left Panel (L)', run: () => setShowLeft(v => !v) },
    { id: 'toggle-right', label: 'Toggle Right Panel (R)', run: () => setShowRight(v => !v) },
    { id: 'toggle-bottom', label: 'Toggle Timeline (T)', run: () => setShowBottom(v => !v) },
    { id: 'tool-geofence', label: 'Geofence Tool (G)', run: () => setTools(s => ({ ...s, geofence: !s.geofence })) },
    { id: 'tool-measure', label: 'Measure Tool (M)', run: () => setTools(s => ({ ...s, measure: !s.measure })) },
    { id: 'snapshot', label: 'Snapshot (S)', run: snapshot },
    { id: 'ai-explain', label: 'Explain Visible Cluster', hint: 'AI overlay', run: explainCluster },
  ];

  useEffect(() => {
    if (!olRef.current) return;
    const map = olRef.current;
    const drag = new DragBox({});
    const onBoxEnd = () => {
      const extent = drag.getGeometry().getExtent();
      const feats = srcRef.current?.getFeaturesInExtent(extent) || [];
      const sel = feats.map(f => f.get('event')).filter(Boolean) as RtaEvent[];
      if (sel.length > 0) setFocus(sel[0]);
    };
    if (tools.select) {
      map.addInteraction(drag); drag.on('boxend', onBoxEnd);
    }
    return () => { map.removeInteraction(drag); };
  }, [tools.select]);

  useEffect(() => {
    if (!olRef.current) return;
    const map = olRef.current;
    const handleClick = (ev: unknown) => {
      if (!tools.measure && !tools.geofence) return;
      const pixel = (ev as { pixel: number[] }).pixel;
      const coord = map.getCoordinateFromPixel(pixel);
      const ll = toLonLat(coord);
      if (tools.measure) {
        if (!measureRef.current.start) measureRef.current.start = [ll[1], ll[0]];
        else { measureRef.current.end = [ll[1], ll[0]]; const d = haversine(measureRef.current.start[0], measureRef.current.start[1], measureRef.current.end[0], measureRef.current.end[1]); const b = bearing(measureRef.current.start[0], measureRef.current.start[1], measureRef.current.end[0], measureRef.current.end[1]); alert(`Distance ${Math.round(d)} m • Bearing ${Math.round(b)}°`); measureRef.current = {}; }
      }
      if (tools.geofence) {
        const rad = Number(prompt('Geofence radius (m)')||'0'); if (!rad || rad<=0) return;
        const vs = srcRef.current; if (!vs) return;
        const circle = new Feature({ geometry: new Circle(coord, rad) });
        circle.setStyle(new Style({ stroke: new Stroke({ color: '#f59e0b', width: 2 }), fill: new Fill({ color: 'rgba(245, 158, 11, 0.1)' }) }));
        vs.addFeature(circle);
      }
    };
    map.on('click', handleClick);
    return () => { map.un('click', handleClick); };
  }, [tools.measure, tools.geofence]);

  const [aiNote, setAiNote] = useState('');
  const explainCluster = async () => {
    const map = olRef.current; const src = srcRef.current; if (!map || !src) return;
    const size = map.getSize(); if (!size) return;
    const extent = map.getView().calculateExtent(size);
    const feats = src.getFeaturesInExtent(extent);
    const evs = feats.map(f => f.get('event')).filter(Boolean) as RtaEvent[];
    if (evs.length === 0) { setAiNote('No events in view'); return; }
    const q = 'Explain visible cluster';
    const ctx = evs.slice(0, 50).map(e => `${e.timestamp} ${String(e.source||'')}${e.latitude != null && e.longitude != null ? ` (${e.latitude}, ${e.longitude})` : ''}`).join('\n');
    const base = getBackendBase();
    if (!base) {
      const bySrc: Record<string, number> = {};
      for (const e of evs) { const s = String(e.source||'unknown'); bySrc[s] = (bySrc[s]||0) + 1; }
      const top = Object.entries(bySrc).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([s,n])=>`${s}: ${n}`).join(', ');
      setAiNote(`Visible: ${evs.length} events. Top sources: ${top}.`);
      return;
    }
    const b = base.replace(/\/$/, '');
    const aiPath = typeof window !== 'undefined' ? (window.localStorage.getItem('aiEndpointPath') || '/api/ai-analyst') : '/api/ai-analyst';
    const endsApi = /\/api$/.test(b);
    const p = endsApi && /^\/api\//.test(aiPath) ? aiPath.replace(/^\/api/, '') : aiPath;
    const uid = typeof window !== 'undefined' ? Number(window.localStorage.getItem('backendUserId') || '0') : 0;
    try {
      const r = await fetch(`${b}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, user_id: uid, context: ctx }) });
      const jd = await r.json() as Record<string, unknown>;
      const ans = typeof jd['answer'] === 'string' ? jd['answer'] as string : JSON.stringify(jd);
      setAiNote(ans);
    } catch {
      setAiNote('AI request failed');
    }
  };

  const filtered = useMemo(() => events.filter(e => e.latitude != null && e.longitude != null), [events]);

  return (
    <div className="flow-gradient text-white min-h-screen">
      <NewHeader />
      <div className="fixed top-16 left-0 right-0 bottom-0">
        {showLeft && (
          <div style={{ width: leftW }} className="absolute top-0 left-0 bottom-0 bg-white/10 border-r border-white/10 p-3 overflow-y-auto">
            <div className="text-sm text-gray-300 mb-2">Data Layers & Filters</div>
            <MapLayers onLayerChange={(layer, enabled) => {
              try {
                const raw = localStorage.getItem('cc.layers');
                const prev = raw ? JSON.parse(raw) as Record<string, boolean> : {};
                const next = { ...prev, [layer]: enabled };
                localStorage.setItem('cc.layers', JSON.stringify(next));
              } catch {}
            }} />
            <div className="mt-3 text-sm text-gray-300">Activity Feed</div>
            <EventFeed events={filtered.slice(0, 500)} onSelect={(e)=>setFocus(f=>f?.id===e.id?null:e)} />
            <div className="absolute top-0 right-0 h-full w-1 cursor-ew-resize" onMouseDown={(e)=>startResize('left', e)} />
          </div>
        )}
        {showRight && (
          <div style={{ width: rightW }} className="absolute top-0 right-0 bottom-0 bg-white/10 border-l border-white/10 p-3 overflow-y-auto">
            <div className="text-sm text-gray-300 mb-2">Event Details & Analytics</div>
            {!focus && (<div className="text-xs text-gray-400">Select an event</div>)}
            {focus && (
              <div className="text-xs text-gray-300 space-y-1">
                <div>ID: {focus.id}</div>
                <div>Source: {String(focus.source||'unknown')}</div>
                <div>Timestamp: {focus.timestamp}</div>
                <div>Lat {focus.latitude} • Lon {focus.longitude}</div>
              </div>
            )}
            <div className="mt-4 text-sm text-gray-300">Bookmarks</div>
            <div className="text-xs text-gray-300 space-y-1">
              {bookmarks.map((b,i)=>(<button key={i} className="block w-full text-left px-2 py-1 bg-white/5 rounded" onClick={()=>{ const c = fromLonLat([b.lon, b.lat]); olRef.current?.getView().animate({ center: c, duration: 500 }); }}>{b.name}</button>))}
            </div>
            <div className="absolute top-0 left-0 h-full w-1 cursor-ew-resize" onMouseDown={(e)=>startResize('right', e)} />
          </div>
        )}
        {showBottom && (
          <div style={{ height: bottomH }} className="absolute left-0 right-0 bottom-0 bg-white/10 border-t border-white/10 p-2">
            <div className="text-sm text-gray-300 mb-1">Timeline Scrubber</div>
            <input type="range" min={1} max={365} defaultValue={7} className="w-full" />
            <div className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize" onMouseDown={(e)=>startResize('bottom', e)} />
          </div>
        )}
        <div className="absolute top-0 bottom-0 left-0 right-0" style={{ left: showLeft ? leftW : 0, right: showRight ? rightW : 0, bottom: showBottom ? bottomH : 0 }}>
          <div ref={mapRef} className="absolute inset-0" />
          <div className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-2">
            <button className={`px-3 py-2 rounded ${tools.select?'bg-white/30':'bg-white/10'}`} onClick={()=>setTools(s=>({...s, select: !s.select}))}>Select</button>
            <button className={`px-3 py-2 rounded ${tools.measure?'bg-white/30':'bg-white/10'}`} onClick={()=>setTools(s=>({...s, measure: !s.measure}))}>Measure</button>
            <button className={`px-3 py-2 rounded ${tools.geofence?'bg-white/30':'bg-white/10'}`} onClick={()=>setTools(s=>({...s, geofence: !s.geofence}))}>Geofence</button>
            <button className="px-3 py-2 rounded bg-white/10" onClick={snapshot}>Snapshot</button>
            <button className="px-3 py-2 rounded bg-white/10" onClick={bookmark}>Bookmark</button>
            <button className={`px-3 py-2 rounded ${heatOn?'bg-white/30':'bg-white/10'}`} onClick={()=>setHeatOn(v=>!v)}>Heat</button>
            <button className="px-3 py-2 rounded bg-white/10" onClick={()=>setPaletteOpen(true)}>⌘K</button>
          </div>
          {aiNote && (<div className="absolute top-14 right-4 max-w-md bg-black/70 text-white text-xs border border-white/10 rounded p-3">{aiNote}</div>)}
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={()=>setPaletteOpen(false)} commands={commands} />
    </div>
  );
}