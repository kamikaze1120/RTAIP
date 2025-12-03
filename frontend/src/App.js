import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import EventFeed from './components/EventFeed';
// Removed Filters import
import AlertBar from './components/AlertBar';
import ChatPanel from './components/ChatPanel';
import './App.css';
import ReplayTimeline from './components/ReplayTimeline';
import SplashScreen from './components/SplashScreen';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend } from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend);
const MapComponent = lazy(() => import('./components/MapComponent'));

function getCache(key, ttlMs) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.ts || (Date.now() - obj.ts) > ttlMs) return null;
    return obj.data;
  } catch { return null; }
}

function setCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}
// helper to parse anomaly description to extract model metadata early
const parseAnomalyMeta = (anom) => {
  const desc = (anom?.description || '');
  const algoMatch = desc.match(/algo=([A-Za-z0-9_]+)/);
  const scoreMatch = desc.match(/score=([\-0-9\.]+)/);
  const ruleMatch = desc.match(/rule=([A-Za-z0-9_><=\+\-]+)/);
  const magMatch = desc.match(/mag=([0-9\.]+)/);
  return {
    algorithm: algoMatch ? algoMatch[1] : null,
    score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
    rule: ruleMatch ? ruleMatch[1] : null,
    magnitude: magMatch ? parseFloat(magMatch[1]) : null,
  };
};

function useAnimatedNumber(target, duration = 400) {
  const [value, setValue] = useState(Number(target) || 0);
  const prevRef = useRef(value);
  useEffect(() => {
    const start = Number(prevRef.current) || 0;
    const end = Number(target) || 0;
    if (start === end) return;
    const startTs = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - startTs) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(start + (end - start) * eased));
      if (t < 1) requestAnimationFrame(tick); else prevRef.current = end;
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return value;
}

function SourceCard({ card, selectedSources, setSelectedSources, count, conf }) {
  const animCount = useAnimatedNumber(count, 500);
  const animConf = useAnimatedNumber(Math.round(conf || 0), 500);
  const selected = selectedSources.includes(card.key);
  return (
    <div
      className="tactical-panel"
      style={{ cursor: 'pointer', background: 'rgba(0,0,0,0.25)', transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease', border: selected ? '1px solid rgba(0,255,198,0.35)' : '1px solid rgba(255,255,255,0.08)', animation: selected ? 'pulse 600ms ease-out' : 'none' }}
      onClick={() => setSelectedSources(prev => prev.includes(card.key) ? prev.filter(s => s !== card.key) : [...prev, card.key])}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.35)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ color: 'var(--accent)' }}>{card.title}</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={selected} onChange={() => setSelectedSources(prev => prev.includes(card.key) ? prev.filter(s => s !== card.key) : [...prev, card.key])} />
          Include
        </label>
      </div>
      <div className="p-2" style={{ fontSize: 13, opacity: 0.9 }}>{card.desc}</div>
      <div className="p-2" style={{ fontSize: 12, opacity: 0.8 }}>
        <span style={{ color: 'var(--accent-muted)' }}>Current events:</span> {animCount}
      </div>
      <div className="p-2" style={{ fontSize: 12, opacity: 0.8 }}>
        <span style={{ color: 'var(--accent-muted)' }}>Confidence:</span> {animConf}%
      </div>
    </div>
  );
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [events, setEvents] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [filters, setFilters] = useState(() => {
    try {
      const saved = localStorage.getItem('rtaip_filters');
      return saved ? JSON.parse(saved) : { search: '', anomaliesOnly: false, minConf: 0, minSev: 0, window: 'last 24 hours', bbox: '' };
    } catch {
      return { search: '', anomaliesOnly: false, minConf: 0, minSev: 0, window: 'last 24 hours', bbox: '' };
    }
  });
  const [selectedSources, setSelectedSources] = useState(() => {
    try { const saved = localStorage.getItem('rtaip_selected_sources'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [showSourceSelect, setShowSourceSelect] = useState(() => {
    try { const saved = localStorage.getItem('rtaip_selected_sources'); return !saved || JSON.parse(saved).length === 0; } catch { return true; }
  });
  const initialRouteRedirectedRef = useRef(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [replayIndex, setReplayIndex] = useState(null);
  const [showSplash, setShowSplash] = useState(true);
  const [focusEventId, setFocusEventId] = useState(null);
  // New UI/Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(10 * 60 * 1000);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [accentDim, setAccentDim] = useState(false);
  const [clusterResDeg, setClusterResDeg] = useState(0.5);
  const [showHelp, setShowHelp] = useState(false);
  const [mapOnboard, setMapOnboard] = useState(() => {
    try { return !localStorage.getItem('rtaip_onboard_map_done'); } catch { return true; }
  });
  const [basemapStyle, setBasemapStyle] = useState('light');
  const [useWebGL, setUseWebGL] = useState(false);
  const [perfInfo, setPerfInfo] = useState({ fps: 0, events: 0, anomalies: 0 });
  const perfUpdateTsRef = useRef(0);
  const handlePerfUpdate = useCallback((m) => {
    const now = Date.now();
    if (now - perfUpdateTsRef.current >= 1500) {
      perfUpdateTsRef.current = now;
      setPerfInfo(m);
    }
  }, []);
  const [benchData, setBenchData] = useState([]);
  const [briefingTime, setBriefingTime] = useState('last 24 hours');
  const [briefingSource, setBriefingSource] = useState('');
  const [briefingBbox, setBriefingBbox] = useState('');
  const [briefingOutput, setBriefingOutput] = useState('');
  const [alertRules, setAlertRules] = useState([]);
  const [alertForm, setAlertForm] = useState({ name: '', source: '', severity_threshold: 5, min_confidence: 0.5, min_lat: '', min_lon: '', max_lat: '', max_lon: '', email_to: '' });
  const [metrics, setMetrics] = useState([]);
  const [macroData, setMacroData] = useState({ gdpGrowth: [], inflation: [], unemployment: [] });
  const [macroStress, setMacroStress] = useState([]);
  const [macroCountries, setMacroCountries] = useState(['WLD','USA']);
  const [reportSpec, setReportSpec] = useState({ type: 'events', window: 'last 24 hours', countries: ['WLD','USA'], indicators: { gdp: true, inflation: true, unemployment: true } });
  const [apiInput, setApiInput] = useState(() => { try { return localStorage.getItem('rtaip_api') || ''; } catch { return ''; } });
  const [showAbout, setShowAbout] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  

  const runAnalyst = async (q) => {
    try {
      const res = await fetch(`${API}/api/ai-analyst`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
      const data = await res.json();
      setBriefingOutput(String(data?.output || 'No analysis available.'));
      try {
        const preds = data?.predictions_points || [];
        if (Array.isArray(preds) && preds.length > 0) {
          window.dispatchEvent(new CustomEvent('rtaip_predictions', { detail: preds }));
        }
      } catch {}
    } catch (e) {
      setBriefingOutput('Error contacting analyst API.');
    }
  };

  

  
  
  const baseStyles = ['light','dark','terrain','satellite','osm'];
   // API base configurable via environment; defaults to 8000
   const API = (() => { try { const o = localStorage.getItem('rtaip_api'); if (o) return o; } catch {} return process.env.REACT_APP_API_URL || 'https://rtaip-production.up.railway.app'; })();
  const sourceCardDefs = useMemo(() => ([
    { key: 'worldbank', title: 'World Bank', desc: 'Global macroeconomic indicators (GDP, Inflation, Unemployment).' },
    { key: 'nasa_eonet', title: 'NASA EONET', desc: 'Natural event intelligence (fires, storms, volcanoes).' },
    { key: 'usgs_seismic', title: 'USGS Seismic', desc: 'Earthquake events (magnitude, location, time).'},
    { key: 'noaa_weather', title: 'NOAA Weather', desc: 'Active weather alerts and polygons.'}
  ]), []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('rtaip_selected_sources');
      if ((!saved || JSON.parse(saved).length === 0) && selectedSources.length === 0) {
        setSelectedSources(sourceCardDefs.map(s => s.key));
      }
    } catch {}
  }, [sourceCardDefs, selectedSources]);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!initialRouteRedirectedRef.current && location.pathname === '/') {
      initialRouteRedirectedRef.current = true;
      navigate('/database', { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const healthRes = await fetch(`${API}/health`).catch(()=>({ ok: false }));
        if (!cancelled) setBackendOnline(!!(healthRes && healthRes.ok));
        const now = new Date();
        const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
        const startStr = `${twoYearsAgo.getFullYear()}-${String(twoYearsAgo.getMonth()+1).padStart(2,'0')}-${String(twoYearsAgo.getDate()).padStart(2,'0')}`;
        const endStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

        const eonetKey = `cache_eonet_${startStr}_${endStr}`;
        let eonetEvents = getCache(eonetKey, 30 * 60 * 1000);
        if (!Array.isArray(eonetEvents)) {
          const eonetOpenRes = await fetch(`https://eonet.gsfc.nasa.gov/api/v3/events?status=open&start=${startStr}&end=${endStr}`);
          const eonetClosedRes = await fetch(`https://eonet.gsfc.nasa.gov/api/v3/events?status=closed&start=${startStr}&end=${endStr}`);
          const eonetOpen = await eonetOpenRes.json();
          const eonetClosed = await eonetClosedRes.json();
          eonetEvents = [ ...(Array.isArray(eonetOpen?.events)?eonetOpen.events:[]), ...(Array.isArray(eonetClosed?.events)?eonetClosed.events:[]) ];
          setCache(eonetKey, eonetEvents);
        }
        const nasaEvents = eonetEvents.map((ev, idx) => {
          const g = Array.isArray(ev.geometry) && ev.geometry.length > 0 ? ev.geometry[0] : null;
          const coords = g && Array.isArray(g.coordinates) ? g.coordinates : null;
          const lon = coords && typeof coords[0] === 'number' ? coords[0] : null;
          const lat = coords && typeof coords[1] === 'number' ? coords[1] : null;
          return {
            id: ev.id || `${ev.title}-${idx}`,
            timestamp: g?.date || ev?.closed || new Date().toISOString(),
            source: 'nasa_eonet',
            latitude: lat,
            longitude: lon,
            confidence: 1,
            data: { title: ev.title, categories: ev.categories }
          };
        });

        const usgsKey = 'cache_usgs_all_day';
        let usgsFeed = getCache(usgsKey, 15 * 60 * 1000);
        if (!usgsFeed) {
          const r = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
          usgsFeed = await r.json();
          setCache(usgsKey, usgsFeed);
        }
        const usgsEvents = Array.isArray(usgsFeed?.features) ? usgsFeed.features.map((f, idx) => {
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
            data: { mag: f.properties?.mag, place: f.properties?.place }
          };
        }) : [];

        const noaaKey = 'cache_noaa_alerts';
        let noaaFeed = getCache(noaaKey, 10 * 60 * 1000);
        if (!noaaFeed) {
          const r = await fetch('https://api.weather.gov/alerts/active');
          noaaFeed = await r.json();
          setCache(noaaKey, noaaFeed);
        }
        const noaaEvents = Array.isArray(noaaFeed?.features) ? noaaFeed.features.map((f, idx) => {
          const geom = f.geometry;
          let lon = null, lat = null;
          try {
            if (geom && geom.type === 'Polygon') {
              const coords = geom.coordinates?.[0] || [];
              if (coords.length > 0) {
                const sum = coords.reduce((acc, p) => { return { lon: acc.lon + (p?.[0]||0), lat: acc.lat + (p?.[1]||0) }; }, { lon: 0, lat: 0 });
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
            data: { headline: f.properties?.headline, event: f.properties?.event }
          };
        }) : [];

        const allEvents = [ ...nasaEvents, ...usgsEvents, ...noaaEvents ];

        const filteredEvents = allEvents.filter(event => {
          const src = (event.source || '').toLowerCase();
          if (Array.isArray(selectedSources) && selectedSources.length > 0 && !selectedSources.includes(src)) return false;
          if (filters.source && src !== filters.source) return false;
          if ((filters.category || '').trim()) {
            const cats = Array.isArray(event.data?.categories) ? event.data.categories.map(c => (c?.title || '').toLowerCase()) : [];
            if (!cats.includes((filters.category || '').toLowerCase())) return false;
          }
          if (filters.window) {
            const now = Date.now();
            const ts = new Date(event.timestamp).getTime();
            const w = (filters.window || '').toLowerCase();
            let maxMs = 24 * 3600 * 1000;
            if (w.includes('hour') && !w.includes('24')) maxMs = 3600 * 1000;
            if (w.includes('7')) maxMs = 7 * 24 * 3600 * 1000;
            if (isFinite(ts) && now - ts > maxMs) return false;
          }
          if ((filters.search || '').trim()) {
            const q = (filters.search || '').toLowerCase();
            const idStr = String(event.id || '').toLowerCase();
            const srcStr = String(event.source || '').toLowerCase();
            const dataStr = JSON.stringify(event.data || {}).toLowerCase();
            if (!(idStr.includes(q) || srcStr.includes(q) || dataStr.includes(q))) return false;
          }
          return true;
        });

        if (!cancelled) {
          setEvents(filteredEvents);
          setAnomalies([]);
        }

        const wbFetch = async (country, indicator) => {
          const startYear = twoYearsAgo.getFullYear();
          const endYear = now.getFullYear();
          const key = `cache_wb_${country}_${indicator}_${startYear}_${endYear}`;
          let pts = getCache(key, 24 * 3600 * 1000);
          if (!Array.isArray(pts)) {
            const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?date=${startYear}:${endYear}&format=json&per_page=1000`;
            const r = await fetch(url);
            const j = await r.json();
            const arr = Array.isArray(j) && Array.isArray(j[1]) ? j[1] : [];
            pts = arr.map(d => ({ date: d.date, value: d.value, country })).filter(p => p.value != null);
          }
          if (pts.filter(p => Number(p.date) >= startYear).length < 2) {
            const fallback = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?date=${startYear-5}:${endYear}&format=json&per_page=1000`;
            const r2 = await fetch(fallback);
            const j2 = await r2.json();
            const arr2 = Array.isArray(j2) && Array.isArray(j2[1]) ? j2[1] : [];
            pts = arr2.map(d => ({ date: d.date, value: d.value, country })).filter(p => p.value != null);
          }
          pts = pts.sort((a,b)=>Number(a.date)-Number(b.date));
          setCache(key, pts);
          return pts;
        };
        const countries = macroCountries;
        const gdpSeries = [];
        const infSeries = [];
        const uemSeries = [];
        for (let i = 0; i < countries.length; i++) {
          const c = countries[i];
          gdpSeries.push({ label: c, points: await wbFetch(c,'NY.GDP.MKTP.KD.ZG') });
          infSeries.push({ label: c, points: await wbFetch(c,'FP.CPI.TOTL.ZG') });
          uemSeries.push({ label: c, points: await wbFetch(c,'SL.UEM.TOTL.ZS') });
        }
        if (!cancelled) {
          setMacroData({ gdpGrowth: gdpSeries, inflation: infSeries, unemployment: uemSeries });
          const latestYear = Math.max(...[...new Set([ ...gdpSeries.flatMap(s=>s.points.map(p=>Number(p.date))), ...infSeries.flatMap(s=>s.points.map(p=>Number(p.date))), ...uemSeries.flatMap(s=>s.points.map(p=>Number(p.date))) ])].filter(n=>isFinite(n)));
          const vals = countries.map(c => {
            const g = gdpSeries.find(s=>s.label===c)?.points.find(p=>Number(p.date)===latestYear)?.value;
            const i = infSeries.find(s=>s.label===c)?.points.find(p=>Number(p.date)===latestYear)?.value;
            const u = uemSeries.find(s=>s.label===c)?.points.find(p=>Number(p.date)===latestYear)?.value;
            return { c, g, i, u };
          }).filter(v=>v.g!=null && v.i!=null && v.u!=null);
          if (vals.length > 0) {
            const mean = (arr) => arr.reduce((a,b)=>a+b,0)/arr.length;
            const std = (arr) => { const m = mean(arr); return Math.sqrt(arr.reduce((a,b)=>a+(b-m)*(b-m),0)/(arr.length||1)); };
            const gz = std(vals.map(v=>v.g)) ? vals.map(v=>({ c:v.c, z:(v.g-mean(vals.map(x=>x.g)))/std(vals.map(x=>x.g)) })) : vals.map(v=>({ c:v.c, z:0 }));
            const iz = std(vals.map(v=>v.i)) ? vals.map(v=>({ c:v.c, z:(v.i-mean(vals.map(x=>x.i)))/std(vals.map(x=>x.i)) })) : vals.map(v=>({ c:v.c, z:0 }));
            const uz = std(vals.map(v=>v.u)) ? vals.map(v=>({ c:v.c, z:(v.u-mean(vals.map(x=>x.u)))/std(vals.map(x=>x.u)) })) : vals.map(v=>({ c:v.c, z:0 }));
            const stress = countries.map(c => {
              const g = gz.find(x=>x.c===c)?.z || 0;
              const i = iz.find(x=>x.c===c)?.z || 0;
              const u = uz.find(x=>x.c===c)?.z || 0;
              const score = Number((g - i - u).toFixed(2));
              return { label: c, score, year: latestYear };
            });
            setMacroStress(stress);
          } else setMacroStress([]);
        }
      } catch (err) {
        if (!cancelled) {
          setBackendOnline(false);
          setEvents([]);
          setAnomalies([]);
        }
      }
    };

    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => { cancelled = true; clearInterval(interval); };
  }, [filters, refreshInterval, API, selectedSources]);

  useEffect(() => {
    try { localStorage.setItem('rtaip_selected_sources', JSON.stringify(selectedSources)); } catch {}
    setShowSourceSelect(!(Array.isArray(selectedSources) && selectedSources.length > 0));
    // if active single-source filter is not included anymore, clear it
    if (filters.source && Array.isArray(selectedSources) && selectedSources.length > 0 && !selectedSources.includes(filters.source)) {
      setFilters(f => ({ ...f, source: undefined }));
    }
  }, [selectedSources]);

  useEffect(() => {
    try { localStorage.setItem('rtaip_filters', JSON.stringify(filters)); } catch {}
    const params = new URLSearchParams();
    if (filters.source) params.set('source', filters.source);
    if (filters.anomaliesOnly) params.set('anom', '1');
    if (filters.search) params.set('q', filters.search);
    if (filters.minConf) params.set('minc', String(filters.minConf));
    if (filters.minSev) params.set('mins', String(filters.minSev));
    if (filters.window) params.set('win', filters.window);
    if (filters.bbox) params.set('bbox', filters.bbox);
    const qs = params.toString();
    navigate({ pathname: location.pathname, search: qs ? `?${qs}` : '' }, { replace: true });
  }, [filters, navigate, location.pathname]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const f = { ...filters };
    const src = params.get('source'); if (src) f.source = src;
    const anom = params.get('anom'); if (anom) f.anomaliesOnly = anom === '1';
    const q = params.get('q'); if (q) f.search = q;
    const minc = params.get('minc'); if (minc) f.minConf = Number(minc) || 0;
    const mins = params.get('mins'); if (mins) f.minSev = Number(mins) || 0;
    const win = params.get('win'); if (win) f.window = win;
    const bb = params.get('bbox'); if (bb) f.bbox = bb;
    setFilters(f);
  }, []);

  // Filter visible data based on replay index
  const visibleEvents = (() => {
    if (replayIndex === null || events.length === 0) return events;
    return events.slice(0, Math.min(events.length, Number(replayIndex) + 1));
  })();

  const visibleAnomalies = anomalies.filter(a => visibleEvents.some(e => e.id === a.event_id));

  const handleTimeChange = (idx) => {
    setReplayIndex(idx);
    const ev = events[idx];
    if (ev) {
      setFocusEventId(ev.id);
    }
  };

  const handleSelectEvent = useCallback((id) => {
    setFocusEventId(id);
    setSelectedEventId(id);
  }, []);

  // Derived UI metrics and source counts
  const sourceCounts = events.reduce((acc, e) => {
    const key = (e.source || 'unknown').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const totalEvents = events.length;
  const totalAnomalies = anomalies.length;
  const lastUpdate = events.length > 0 ? new Date(events[events.length - 1].timestamp).toLocaleString('en-US', { timeZone: 'America/Chicago' }) : '—';

  // Build chart datasets for Dashboard visuals
  const hoursMap = {};
  visibleEvents.forEach(e => {
    const d = new Date(e.timestamp);
    if (!isNaN(d)) {
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:00`;
      hoursMap[key] = (hoursMap[key] || 0) + 1;
    }
  });
  const anomalyHoursMap = {};
  visibleAnomalies.forEach(a => {
    const baseTs = a.timestamp || (events.find(e => e.id === a.event_id)?.timestamp);
    const d = new Date(baseTs);
    if (d && !isNaN(d)) {
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:00`;
      anomalyHoursMap[key] = (anomalyHoursMap[key] || 0) + 1;
    }
  });
  const hourlyLabels = Array.from(new Set([...Object.keys(hoursMap), ...Object.keys(anomalyHoursMap)])).sort();
  const hourlyCounts = hourlyLabels.map(l => hoursMap[l] || 0);
  const anomalyHourlyCounts = hourlyLabels.map(l => anomalyHoursMap[l] || 0);

  const sourceLabels = Object.keys(sourceCounts).map(s => (s || 'UNKNOWN').toUpperCase());
  const sourceValues = sourceLabels.map(lbl => sourceCounts[lbl.toLowerCase()] || 0);

  const severityCounts = visibleAnomalies.reduce((acc,a) => {
    const sev = a.severity;
    let key;
    if (typeof sev === 'number') {
      if (sev < 3) key = 'low';
      else if (sev < 6) key = 'medium';
      else if (sev < 8) key = 'high';
      else key = 'critical';
    } else {
      key = String(sev || 'unknown').toLowerCase();
    }
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const severityOrder = ['low','medium','high','critical','unknown'];
  const severityLabels = severityOrder.filter(k => severityCounts[k] !== undefined).map(s => s.toUpperCase());
  const severityValues = severityLabels.map(lbl => severityCounts[lbl.toLowerCase()] || 0);

  // Threat Score components
  const nowTs = Date.now();
  const minutes = (ms) => ms / 60000;
  const tsOf = (t) => (new Date(t)).getTime();
  const recent15 = visibleEvents.filter(e => nowTs - tsOf(e.timestamp) <= 15 * 60000);
  const prev15 = visibleEvents.filter(e => {
    const dt = nowTs - tsOf(e.timestamp);
    return dt > 15 * 60000 && dt <= 30 * 60000;
  });
  const velocityIndex = (() => {
    const r = recent15.length;
    const p = prev15.length || 1;
    const change = (r - p) / p;
    // clamp contribution between -1 and 1, then map to 0..1
    return Math.max(0, Math.min(1, (change + 1) / 2));
  })();
  const anomalyDensity = totalEvents > 0 ? Math.min(1, totalAnomalies / totalEvents) : 0;
  // Volatility: std/mean of per-source counts over last hour
  const lastHourEvents = visibleEvents.filter(e => nowTs - tsOf(e.timestamp) <= 60 * 60000);
  const perSourceCounts = Object.values(lastHourEvents.reduce((acc, e) => { const k=(e.source||'unknown').toLowerCase(); acc[k]=(acc[k]||0)+1; return acc; }, {}));
  const mean = perSourceCounts.length ? (perSourceCounts.reduce((a,b)=>a+b,0) / perSourceCounts.length) : 0;
  const std = perSourceCounts.length ? Math.sqrt(perSourceCounts.reduce((s,c)=>s + Math.pow(c - mean, 2), 0) / perSourceCounts.length) : 0;
  const volatility = mean > 0 ? Math.min(1, (std / mean)) : 0;
  const threatScore = (() => {
    const score = 10 * (0.5 * anomalyDensity + 0.3 * velocityIndex + 0.2 * volatility);
    const clamped = Math.max(0, Math.min(10, score));
    const level = clamped < 3 ? 'Low' : clamped < 6 ? 'Moderate' : clamped < 8 ? 'Elevated' : 'High';
    return { score: Number(clamped.toFixed(1)), level, components: { anomalyDensity, velocityIndex, volatility } };
  })();

  // 60-Minute Intelligence Summary
  const last60Events = visibleEvents.filter(e => nowTs - tsOf(e.timestamp) <= 60 * 60000);
  const prev60Events = visibleEvents.filter(e => { const dt = nowTs - tsOf(e.timestamp); return dt > 60 * 60000 && dt <= 120 * 60000; });
  const countBySource = (arr) => arr.reduce((acc, e) => { const k=(e.source||'unknown').toLowerCase(); acc[k]=(acc[k]||0)+1; return acc; }, {});
  const lastCounts = countBySource(last60Events);
  const prevCounts = countBySource(prev60Events);
  const pctChange = (a,b) => { const A=a||0, B=b||0; if(B===0) return A>0 ? 100 : 0; return ((A-B)/B)*100; };
  const intelSummary = (() => {
    const lines = [];
    // Seismic
    if (lastCounts['usgs_seismic'] || prevCounts['usgs_seismic']) {
      const p = pctChange(lastCounts['usgs_seismic'], prevCounts['usgs_seismic']);
      lines.push(`Seismic activity ${p>=0? 'spiked' : 'declined'} by ${Math.abs(p).toFixed(1)}%.`);
    }
    // Weather anomalies (use anomalies filtered to weather)
    const lastWeatherAnoms = anomalies.filter(a => {
      const ev = events.find(e => e.id === a.event_id);
      return ev && nowTs - tsOf(ev.timestamp) <= 60 * 60000 && (ev.source||'').toLowerCase() === 'noaa_weather';
    });
    if (lastWeatherAnoms.length > 0) {
      // crude quadrant classification
      const sectors = lastWeatherAnoms.reduce((acc, a) => {
        const ev = events.find(e => e.id === a.event_id);
        if (!ev || ev.latitude == null || ev.longitude == null) return acc;
        const lat = ev.latitude, lon = ev.longitude;
        const key = `${lat>=0?'N':'S'}${lon>=0?'E':'W'}`;
        acc[key] = (acc[key]||0)+1; return acc;
      }, {});
      const topSector = Object.entries(sectors).sort((a,b)=>b[1]-a[1])[0];
      if (topSector) lines.push(`Weather anomalies increased in sector ${topSector[0]}.`);
    }
    // AIS signals anomalies count
    const lastAISAnoms = anomalies.filter(a => {
      const ev = events.find(e => e.id === a.event_id);
      return ev && nowTs - tsOf(ev.timestamp) <= 60 * 60000 && (ev.source||'').toLowerCase() === 'ais';
    });
    if (lastAISAnoms.length > 0) {
      lines.push(`${lastAISAnoms.length} AIS signals flagged as anomalous in the last 60 minutes.`);
    }
    if (lines.length === 0) lines.push('Last 60 minutes show stable operational patterns across sources.');
    return lines;
  })();

  const bucketCount = 12;
  const bucketLabels = Array.from({ length: bucketCount }, (_, i) => {
    const minutesAgo = (bucketCount - 1 - i) * 5;
    return `${minutesAgo}m`;
  });
  const bucketsEvents = Array(bucketCount).fill(0);
  const bucketsAnoms = Array(bucketCount).fill(0);
  last60Events.forEach(e => {
    const ageMin = (nowTs - tsOf(e.timestamp)) / 60000;
    const idx = Math.max(0, Math.min(bucketCount - 1, bucketCount - 1 - Math.floor(ageMin / 5)));
    bucketsEvents[idx] += 1;
  });
  const last60Anoms = anomalies.filter(a => {
    const ev = events.find(e => e.id === a.event_id);
    return ev && (nowTs - tsOf(ev.timestamp)) <= 60 * 60000;
  });
  last60Anoms.forEach(a => {
    const ev = events.find(e => e.id === a.event_id);
    if (!ev) return;
    const ageMin = (nowTs - tsOf(ev.timestamp)) / 60000;
    const idx = Math.max(0, Math.min(bucketCount - 1, bucketCount - 1 - Math.floor(ageMin / 5)));
    bucketsAnoms[idx] += 1;
  });

  // Source metadata (last 10, anomaly probability, severity, clusters)
  const anomaliesByEvent = anomalies.reduce((acc, a) => { acc[a.event_id] = a; return acc; }, {});
  const eventsBySource = events.reduce((acc, e) => { const k=(e.source||'unknown').toLowerCase(); (acc[k]=acc[k]||[]).push(e); return acc; }, {});
  const sourcesMeta = Object.entries(eventsBySource).map(([src, list]) => {
    const last10 = list.slice(Math.max(0, list.length - 10));
    const srcAnoms = anomalies.filter(a => { const ev = events.find(e => e.id === a.event_id); return ev && (ev.source||'unknown').toLowerCase() === src; });
    const anomalyRate = list.length ? (srcAnoms.length / list.length) : 0;
    const quant = (n) => Math.round(n / clusterResDeg) * clusterResDeg;
    const clusters = last10.reduce((acc, e) => {
      if (e.latitude == null || e.longitude == null) return acc;
      const key = `${quant(e.latitude).toFixed(2)},${quant(e.longitude).toFixed(2)}`;
      acc[key] = (acc[key]||0)+1; return acc;
    }, {});
    const topClusters = Object.entries(clusters).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const lastHour = list.filter(e => nowTs - tsOf(e.timestamp) <= 60 * 60000);
    const withGeo = lastHour.filter(e => e.latitude != null && e.longitude != null).length;
    const missingGeoRate = lastHour.length ? 1 - (withGeo / lastHour.length) : 0;
    const perBucket = Array(12).fill(0);
    lastHour.forEach(e => { const m = (nowTs - tsOf(e.timestamp))/60000; const idx = Math.max(0, Math.min(11, 11 - Math.floor(m/5))); perBucket[idx] += 1; });
    const meanB = perBucket.reduce((a,b)=>a+b,0)/perBucket.length;
    const stdB = Math.sqrt(perBucket.reduce((s,c)=>s+Math.pow(c-meanB,2),0)/perBucket.length);
    const volatilitySrc = meanB>0 ? Math.min(1, stdB/meanB) : 0;
    const confidence = Math.max(0, Math.min(100, Math.round(100 * (1 - (0.5*anomalyRate + 0.3*missingGeoRate + 0.2*volatilitySrc)))));
    return { src, anomalyRate, last10, topClusters, confidence };
  });

  const confidenceBySrc = Object.fromEntries(sourcesMeta.map(m => [m.src, m.confidence]));

  const DatabasePage = () => (
    <div className="p-4">
      <div className="tactical-panel" style={{ margin: '12px 0', paddingBottom: 12 }}>
        <div className="panel-header" style={{ justifyContent: 'space-between' }}>
          <div style={{ color: 'var(--accent)' }}>Select Data Sources</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button-tactical" onClick={() => setSelectedSources(sourceCardDefs.map(s => s.key))}>Select All</button>
            <button className="button-tactical" onClick={() => setSelectedSources([])}>Clear</button>
            <button className="button-tactical" onClick={() => setSelectedSources(prev => {
              const all = sourceCardDefs.map(s => s.key);
              return all.filter(k => !prev.includes(k));
            })}>Invert</button>
          </div>
        </div>
        <div className="p-3" style={{ display: 'grid', gridTemplateColumns: (typeof window !== 'undefined' && window.innerWidth < 768) ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          {sourceCardDefs.map(card => (
            <div
              key={card.key}
              className="tactical-panel"
              style={{ cursor: 'pointer', background: 'rgba(0,0,0,0.25)', transition: 'transform 180ms ease, box-shadow 180ms ease', border: selectedSources.includes(card.key) ? '1px solid rgba(0,255,198,0.35)' : '1px solid rgba(255,255,255,0.08)' }}
              onClick={() => setSelectedSources(prev => prev.includes(card.key) ? prev.filter(s => s !== card.key) : [...prev, card.key])}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.35)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div className="panel-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ color: 'var(--accent)' }}>{card.title}</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input type="checkbox" checked={selectedSources.includes(card.key)} onChange={() => setSelectedSources(prev => prev.includes(card.key) ? prev.filter(s => s !== card.key) : [...prev, card.key])} />
                  Include
                </label>
              </div>
              <div className="p-2" style={{ fontSize: 13, opacity: 0.9 }}>{card.desc}</div>
              <div className="p-2" style={{ fontSize: 12, opacity: 0.8 }}>
                <span style={{ color: 'var(--accent-muted)' }}>Current events:</span> {sourceCounts[card.key] || 0}
              </div>
            </div>
          ))}
        </div>
        <div className="p-3" style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Selected: {selectedSources.map(s => (s||'UNKNOWN').toUpperCase()).join(', ') || 'None'} ({selectedSources.length}/{sourceCardDefs.length})</div>
            <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.round((selectedSources.length / sourceCardDefs.length) * 100)}%`, height: '100%', background: 'var(--accent)' }} />
            </div>
          </div>
          <button className="button-tactical" disabled={selectedSources.length === 0} onClick={() => {
            setShowSourceSelect(false);
            navigate('/');
          }}>Continue</button>
        </div>
      </div>
    </div>
  );

  const SettingsPage = () => (
    <div className="flex flex-1" style={{ minHeight: 'calc(100vh - 60px)' }}>
      <div className="w-1/2 p-4" style={{ margin: '0 auto' }}>
        <div className="tactical-panel">
          <div className="panel-header">
            <div style={{ color: 'var(--accent)' }}>Settings</div>
          </div>
          <div className="p-2" style={{ fontSize: 13 }}>
            <div>Refresh interval (ms): {refreshInterval}</div>
            <div style={{ marginTop: 8 }}>
              <button className="button-tactical" onClick={() => setRefreshInterval(60 * 1000)}>1m</button>
              <button className="button-tactical" onClick={() => setRefreshInterval(5 * 60 * 1000)} style={{ marginLeft: 8 }}>5m</button>
              <button className="button-tactical" onClick={() => setRefreshInterval(10 * 60 * 1000)} style={{ marginLeft: 8 }}>10m</button>
            </div>
            <div style={{ marginTop: 12, opacity: 0.8 }}>API: {API}</div>
            <div style={{ marginTop: 8 }}>
              <input className="button-tactical" placeholder="API Base URL (e.g., https://api.yourdomain.com)" value={apiInput} onChange={(e)=>setApiInput(e.target.value)} style={{ width: '100%' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="button-tactical" onClick={() => { try { localStorage.setItem('rtaip_api', apiInput.trim()); } catch {} window.location.reload(); }}>Apply & Reload</button>
                <button className="button-tactical" onClick={() => { try { localStorage.removeItem('rtaip_api'); } catch {} window.location.reload(); }}>Clear & Reload</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const DashboardPage = () => (
    <div className="p-4">
      <div className="tactical-panel" style={{ marginBottom: 12 }}>
        <div className="panel-header">
          <div style={{ color: 'var(--accent)' }}>Operational Overview</div>
        </div>
        <div className="p-3" style={{ display: 'grid', gridTemplateColumns: (typeof window !== 'undefined' && window.innerWidth < 768) ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <div className="tactical-panel"><div className="p-3" style={{ textAlign: 'center' }}><div style={{ fontSize: 12, opacity: 0.8 }}>Total Events</div><div style={{ fontSize: 28, letterSpacing: 1, color: 'var(--accent)' }}>{events.length}</div></div></div>
          <div className="tactical-panel"><div className="p-3" style={{ textAlign: 'center' }}><div style={{ fontSize: 12, opacity: 0.8 }}>Anomalies</div><div style={{ fontSize: 28, letterSpacing: 1, color: 'var(--danger)' }}>{anomalies.length}</div></div></div>
          <div className="tactical-panel"><div className="p-3" style={{ textAlign: 'center' }}><div style={{ fontSize: 12, opacity: 0.8 }}>Threat Level</div><div style={{ fontSize: 28, letterSpacing: 1, color: threatScore.level === 'High' ? 'var(--danger)' : 'var(--accent)' }}>{threatScore.level}</div></div></div>
        </div>
      </div>
      <div className="tactical-panel" style={{ marginBottom: 12 }}>
        <div className="panel-header" style={{ justifyContent: 'space-between' }}>
          <div style={{ color: 'var(--accent)' }}>Quick Filters</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="button-tactical" onClick={()=>setFilters(f=>({ ...f, window: 'last hour' }))}>Last hour</div>
            <div className="button-tactical" onClick={()=>setFilters(f=>({ ...f, window: 'last 24 hours' }))}>24 hours</div>
            <div className="button-tactical" onClick={()=>setFilters(f=>({ ...f, window: 'last 7 days' }))}>7 days</div>
            <div className="button-tactical" onClick={()=>setFilters(f=>({ ...f, anomaliesOnly: !f.anomaliesOnly }))}>{filters.anomaliesOnly ? 'Anomalies: ON' : 'Anomalies: OFF'}</div>
          </div>
        </div>
      </div>
      <div className="tactical-panel" style={{ marginBottom: 12 }}>
        <div className="panel-header" style={{ justifyContent: 'space-between' }}>
          <div style={{ color: 'var(--accent)' }}>Macro Dashboard</div>
        </div>
        <div className="p-2" style={{ display: 'grid', gridTemplateColumns: (typeof window !== 'undefined' && window.innerWidth < 768) ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {(() => {
            const mkData = (series) => {
              const labels = Array.from(new Set(series.flatMap(s => s.points.map(p => p.date)))).sort();
              const datasets = series.map(s => ({ label: s.label, data: labels.map(l => {
                const p = s.points.find(pp => pp.date === l);
                return p && typeof p.value === 'number' ? p.value : null;
              }), borderColor: s.label === 'WLD' ? '#00ffc6' : '#6f42c1', backgroundColor: 'rgba(0,255,198,0.15)' }));
              return { labels, datasets };
            };
            const gdp = mkData(macroData.gdpGrowth || []);
            const inf = mkData(macroData.inflation || []);
            const uem = mkData(macroData.unemployment || []);
            return (
              <>
                <div className="tactical-panel"><div className="p-2"><div style={{ marginBottom: 6, color: 'var(--accent)' }}>GDP Growth (% YoY)</div><Line data={gdp} options={{ plugins: { legend: { display: true } }, scales: { y: { ticks: { color: '#00ffc6' } }, x: { ticks: { color: '#00ffc6' } } } }} /></div></div>
                <div className="tactical-panel"><div className="p-2"><div style={{ marginBottom: 6, color: 'var(--accent)' }}>Inflation (% YoY)</div><Line data={inf} options={{ plugins: { legend: { display: true } }, scales: { y: { ticks: { color: '#00ffc6' } }, x: { ticks: { color: '#00ffc6' } } } }} /></div></div>
                <div className="tactical-panel"><div className="p-2"><div style={{ marginBottom: 6, color: 'var(--accent)' }}>Unemployment (% of labor)</div><Line data={uem} options={{ plugins: { legend: { display: true } }, scales: { y: { ticks: { color: '#00ffc6' } }, x: { ticks: { color: '#00ffc6' } } } }} /></div></div>
              </>
            );
          })()}
        </div>
        <div className="p-2" style={{ display: 'grid', gridTemplateColumns: (typeof window !== 'undefined' && window.innerWidth < 768) ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div className="tactical-panel"><div className="p-2" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ color: 'var(--accent)' }}>Countries</div>
            <select className="button-tactical" onChange={(e)=>{ const v = e.target.value; if (v && !macroCountries.includes(v)) setMacroCountries(arr=>[...arr, v]); }}>
              <option value="">Add country</option>
              <option value="WLD">WLD</option>
              <option value="USA">USA</option>
              <option value="CHN">CHN</option>
              <option value="IND">IND</option>
              <option value="EUU">EUU</option>
              <option value="GBR">GBR</option>
              <option value="DEU">DEU</option>
              <option value="JPN">JPN</option>
            </select>
            {macroCountries.map(c => (
              <div key={c} className="button-tactical" onClick={()=>setMacroCountries(arr=>arr.filter(x=>x!==c))}>{c} ✕</div>
            ))}
          </div></div>
          <div className="tactical-panel"><div className="p-2">
            <div style={{ marginBottom: 6, color: 'var(--accent)' }}>Macro Stress Index</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {macroStress.length === 0 ? <div style={{ opacity: 0.8 }}>No data</div> : macroStress.map(s => (
                <div key={s.label} className="tactical-panel" style={{ padding: 8 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{s.label} • {s.year}</div>
                  <div style={{ fontSize: 22, color: s.score >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{s.score}</div>
                </div>
              ))}
            </div>
          </div></div>
        </div>
      </div>
      <ChatPanel apiBase={API} events={events} anomalies={anomalies} filters={filters} sourceCounts={sourceCounts} />
      <div className="tactical-panel" style={{ marginTop: 12 }}>
        <div className="panel-header" style={{ justifyContent: 'space-between' }}>
          <div style={{ color: 'var(--accent)' }}>Report Builder</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="button-tactical" value={reportSpec.type} onChange={(e)=>setReportSpec(s=>({ ...s, type: e.target.value }))}>
              <option value="events">Events summary</option>
              <option value="macro_summary">Macro indicators summary</option>
              <option value="macro_compare">Macro compare (2 countries)</option>
            </select>
            <select className="button-tactical" value={reportSpec.window} onChange={(e)=>setReportSpec(s=>({ ...s, window: e.target.value }))}>
              <option value="last hour">Last hour</option>
              <option value="last 24 hours">Last 24 hours</option>
              <option value="last 7 days">Last 7 days</option>
            </select>
          </div>
        </div>
        <div className="p-2" style={{ display: 'grid', gridTemplateColumns: (typeof window !== 'undefined' && window.innerWidth < 768) ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div className="tactical-panel"><div className="p-2" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ color: 'var(--accent)' }}>Countries</div>
            <select className="button-tactical" onChange={(e)=>{ const v = e.target.value; if (v && !reportSpec.countries.includes(v)) setReportSpec(s=>({ ...s, countries: [...s.countries, v] })); }}>
              <option value="">Add country</option>
              <option value="WLD">WLD</option>
              <option value="USA">USA</option>
              <option value="CHN">CHN</option>
              <option value="IND">IND</option>
              <option value="EUU">EUU</option>
              <option value="GBR">GBR</option>
              <option value="DEU">DEU</option>
              <option value="JPN">JPN</option>
            </select>
            {reportSpec.countries.map(c => (
              <div key={c} className="button-tactical" onClick={()=>setReportSpec(s=>({ ...s, countries: s.countries.filter(x=>x!==c) }))}>{c} ✕</div>
            ))}
          </div></div>
          <div className="tactical-panel"><div className="p-2" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="button-tactical" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={reportSpec.indicators.gdp} onChange={(e)=>setReportSpec(s=>({ ...s, indicators: { ...s.indicators, gdp: e.target.checked } }))} /> GDP Growth
            </label>
            <label className="button-tactical" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={reportSpec.indicators.inflation} onChange={(e)=>setReportSpec(s=>({ ...s, indicators: { ...s.indicators, inflation: e.target.checked } }))} /> Inflation
            </label>
            <label className="button-tactical" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={reportSpec.indicators.unemployment} onChange={(e)=>setReportSpec(s=>({ ...s, indicators: { ...s.indicators, unemployment: e.target.checked } }))} /> Unemployment
            </label>
          </div></div>
        </div>
        <div className="p-2" style={{ fontSize: 13 }}>
          <button className="button-tactical" onClick={() => {
            const lines = [];
            if (reportSpec.type === 'events') {
              const now = Date.now();
              const ms = reportSpec.window === 'last hour' ? 3600000 : reportSpec.window === 'last 24 hours' ? 86400000 : 604800000;
              const cutoff = now - ms;
              const evs = events.filter(e => { const t = new Date(e.timestamp).getTime(); return !isNaN(t) && t >= cutoff; });
              const bySrc = {};
              evs.forEach(e => { const k = (e.source || 'UNKNOWN').toUpperCase(); bySrc[k] = (bySrc[k] || 0) + 1; });
              lines.push(`Events in ${reportSpec.window}: ${evs.length}`);
              Object.entries(bySrc).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>lines.push(`${k}: ${v}`));
            } else if (reportSpec.type === 'macro_summary') {
              const add = (lbl, series) => {
                series.forEach(s => {
                  if (!reportSpec.countries.includes(s.label)) return;
                  const last = [...s.points].reverse().find(p => typeof p.value === 'number');
                  lines.push(`${lbl} ${s.label}: ${last ? last.value : 'NA'}`);
                });
              };
              if (reportSpec.indicators.gdp) add('GDP', macroData.gdpGrowth || []);
              if (reportSpec.indicators.inflation) add('Inflation', macroData.inflation || []);
              if (reportSpec.indicators.unemployment) add('Unemployment', macroData.unemployment || []);
            } else if (reportSpec.type === 'macro_compare') {
              const cs = reportSpec.countries.slice(0,2);
              const mk = (series) => {
                return cs.map(c => {
                  const s = (series || []).find(x => x.label === c);
                  const last = s ? [...s.points].reverse().find(p => typeof p.value === 'number') : null;
                  return { c, v: last ? last.value : null };
                });
              };
              if (reportSpec.indicators.gdp) { const arr = mk(macroData.gdpGrowth); lines.push(`GDP ${arr.map(a=>a.c+': '+(a.v==null?'NA':a.v)).join(' | ')}`); }
              if (reportSpec.indicators.inflation) { const arr = mk(macroData.inflation); lines.push(`Inflation ${arr.map(a=>a.c+': '+(a.v==null?'NA':a.v)).join(' | ')}`); }
              if (reportSpec.indicators.unemployment) { const arr = mk(macroData.unemployment); lines.push(`Unemployment ${arr.map(a=>a.c+': '+(a.v==null?'NA':a.v)).join(' | ')}`); }
            }
            const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `rtaip_report_${Date.now()}.txt`; a.click(); URL.revokeObjectURL(url);
          }}>Generate TXT</button>
        </div>
      </div>
    </div>
  );


  return (
    <div className="app-root">
      {showSplash && <SplashScreen />}
      {/* Tactical top navbar */}
        <div className="tactical-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
          <div style={{ color: 'var(--accent)', fontWeight: 600 }}>RTAIP</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <NavLink to="/database" className={({ isActive }) => `button-tactical ${isActive ? 'active' : ''}`}>Sources</NavLink>
            <NavLink to="/" end className={({ isActive }) => `button-tactical ${isActive ? 'active' : ''}`}>Dashboard</NavLink>
            <NavLink to="/map" className={({ isActive }) => `button-tactical ${isActive ? 'active' : ''}`}>Map</NavLink>
            <NavLink to="/replay" className={({ isActive }) => `button-tactical ${isActive ? 'active' : ''}`}>Timeline</NavLink>
            <NavLink to="/settings" className={({ isActive }) => `button-tactical ${isActive ? 'active' : ''}`}>Settings</NavLink>
          </div>
        </div>

      <div className="p-2" style={{ opacity: 0.6, fontSize: 11 }}>
        <div className={`health-badge ${backendOnline ? '' : 'offline'}`}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: backendOnline ? 'var(--accent)' : 'var(--danger)' }} />
          Backend: {backendOnline ? 'Online' : 'Offline'}
        </div>
      </div>
      <AlertBar anomalies={visibleAnomalies} />

      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/map" element={(
          <div className="p-4">
            <div className="tactical-panel" style={{ height: '70vh' }}>
              <div className="panel-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ color: 'var(--accent)' }}>Operational Map</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {selectedSources.length > 0 && (
                    <select className="button-tactical" value={filters.source || ''} onChange={(e) => setFilters(f => ({ ...f, source: e.target.value || undefined }))}>
                      <option value="">All</option>
                      {selectedSources.map(s => (
                        <option key={s} value={s}>{(s || 'UNKNOWN').toUpperCase()}</option>
                      ))}
                    </select>
                  )}
                  <button className="button-tactical" onClick={() => setBasemapStyle(s => ['light','dark','terrain','satellite','osm'][(['light','dark','terrain','satellite','osm'].indexOf(s)+1)%5])}>{basemapStyle.toUpperCase()}</button>
                  <label className="button-tactical" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={useWebGL} onChange={(e)=>setUseWebGL(e.target.checked)} /> WebGL
                  </label>
                </div>
              </div>
              <div style={{ height: 'calc(100% - 42px)' }}>
                <Suspense fallback={<div className="p-3">Loading map…</div>}>
                  <MapComponent events={events} anomalies={anomalies} focusEventId={focusEventId} onSelect={handleSelectEvent} basemapStyle={basemapStyle} useWebGL={useWebGL} onPerfUpdate={handlePerfUpdate} />
                </Suspense>
              </div>
            </div>
            {selectedEventId && (() => {
              const ev = events.find(e => e.id === selectedEventId);
              const anom = anomalies.find(a => a.event_id === selectedEventId);
              return (
                <div className="tactical-panel" style={{ marginTop: 12 }}>
                  <div className="panel-header" style={{ justifyContent: 'space-between' }}>
                    <div style={{ color: 'var(--accent)' }}>Event Details</div>
                    <div className="button-tactical" onClick={() => setSelectedEventId(null)}>Close</div>
                  </div>
                  <div className="p-2" style={{ fontSize: 13 }}>
                    <div>Source: <span style={{ color: 'var(--accent-muted)' }}>{(ev?.source || 'UNKNOWN').toUpperCase()}</span></div>
                    <div>Timestamp: {ev?.timestamp ? new Date(ev.timestamp).toLocaleString() : '—'}</div>
                    <div>Latitude: {ev?.latitude ?? '—'} | Longitude: {ev?.longitude ?? '—'}</div>
                    <div>ID: {ev?.id ?? '—'}</div>
                    <div style={{ marginTop: 6, color: anom ? 'var(--danger)' : 'var(--accent-muted)' }}>
                      {anom ? 'Anomaly detected for this event' : 'Status: normal'}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )} />
        <Route path="/replay" element={(
          <div className="p-4">
            <div className="tactical-panel">
              <div className="panel-header"><div style={{ color: 'var(--accent)' }}>Event Replay</div></div>
              <div className="p-2"><ReplayTimeline events={events} onTimeChange={(i)=>{ setReplayIndex(i); const ev = events[i]; if (ev) setFocusEventId(ev.id); }} /></div>
            </div>
            <div className="tactical-panel" style={{ height: '60vh', marginTop: 12 }}>
              <div className="panel-header"><div style={{ color: 'var(--accent)' }}>Operational Map</div></div>
              <div style={{ height: 'calc(100% - 42px)' }}>
                <Suspense fallback={<div className="p-3">Loading map…</div>}>
                  <MapComponent events={events.slice(0, replayIndex == null ? events.length : Math.min(events.length, Number(replayIndex)+1))} anomalies={anomalies.filter(a => events.slice(0, replayIndex == null ? events.length : Math.min(events.length, Number(replayIndex)+1)).some(e => e.id === a.event_id))} focusEventId={focusEventId} onSelect={handleSelectEvent} />
                </Suspense>
              </div>
            </div>
          </div>
        )} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/database" element={<DatabasePage />} />
      </Routes>
      {showAbout && null}
    </div>
  );
}
export default App;
