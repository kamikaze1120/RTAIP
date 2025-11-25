import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import MapComponent from './components/MapComponent';
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
  const handlePerfUpdate = useCallback((m) => { setPerfInfo(m); }, []);
  const [benchData, setBenchData] = useState([]);
  const [briefingTime, setBriefingTime] = useState('last 24 hours');
  const [briefingSource, setBriefingSource] = useState('');
  const [briefingBbox, setBriefingBbox] = useState('');
  const [briefingOutput, setBriefingOutput] = useState('');
  const [alertRules, setAlertRules] = useState([]);
  const [alertForm, setAlertForm] = useState({ name: '', source: '', severity_threshold: 5, min_confidence: 0.5, min_lat: '', min_lon: '', max_lat: '', max_lon: '', email_to: '' });
  const [metrics, setMetrics] = useState([]);
  const [apiInput, setApiInput] = useState(() => { try { return localStorage.getItem('rtaip_api') || ''; } catch { return ''; } });
  const [showAbout, setShowAbout] = useState(false);

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
    { key: 'adsb', title: 'ADSB', desc: 'Aircraft transponder signals; flight positions and headings.' },
    { key: 'ais', title: 'AIS', desc: 'Maritime vessel positions and identifiers.' },
    { key: 'usgs_seismic', title: 'USGS', desc: 'Seismic event feeds reported by USGS.' },
    { key: 'noaa_weather', title: 'NOAA', desc: 'Weather alerts and anomalies from NOAA.' },
    { key: 'nasa_eonet', title: 'EONET', desc: 'NASA curated natural events (fires, storms, volcanoes).' },
    { key: 'gdacs_disasters', title: 'GDACS', desc: 'Global disaster alerts and coordination system events.' }
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
        const healthRes = await fetch(`${API}/health`);
        if (!cancelled) setBackendOnline(healthRes.ok);

        const evUrl = `${API}/events${filters.bbox ? `?bbox=${encodeURIComponent(filters.bbox)}` : ''}`;
        const eventsRes = await fetch(evUrl);
        const eventsData = await eventsRes.json();

        const anUrl = `${API}/anomalies${filters.bbox ? `?bbox=${encodeURIComponent(filters.bbox)}` : ''}`;
        const anomaliesRes = await fetch(anUrl);
        const anomaliesData = await anomaliesRes.json();
        const anomalies7 = Array.isArray(anomaliesData) ? anomaliesData.filter(a => {
          const ts = new Date(a.timestamp).getTime();
          const now = Date.now();
          return isFinite(ts) && (now - ts) <= (7 * 24 * 3600 * 1000);
        }) : [];

        const filteredEvents = eventsData.filter(event => {
          const src = (event.source || '').toLowerCase();
          if (Array.isArray(selectedSources) && selectedSources.length > 0 && !selectedSources.includes(src)) return false;
          if (filters.source && src !== filters.source) return false;
          const hasAnom = anomaliesData.some(a => a.event_id === event.id);
          if (filters.anomaliesOnly && !hasAnom) return false;
          const confOk = typeof event.confidence === 'number' ? event.confidence >= (filters.minConf || 0) : true;
          if (!confOk) return false;
          if ((filters.minSev || 0) > 0 && !anomaliesData.some(a => a.event_id === event.id && (a.severity || 0) >= (filters.minSev || 0))) return false;
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
          setAnomalies(anomalies7);
        }

        // Auto-seed if backend is online and DB appears empty
        if (healthRes.ok && eventsData.length === 0) {
          await fetch(`${API}/seed`);
          const eventsRes2 = await fetch(evUrl);
          const eventsData2 = await eventsRes2.json();
          const anomaliesRes2 = await fetch(anUrl);
          const anomaliesData2 = await anomaliesRes2.json();
          const anomalies72 = Array.isArray(anomaliesData2) ? anomaliesData2.filter(a => {
            const ts = new Date(a.timestamp).getTime();
            const now = Date.now();
            return isFinite(ts) && (now - ts) <= (7 * 24 * 3600 * 1000);
          }) : [];

          const filteredEvents2 = eventsData2.filter(event => {
            const src = (event.source || '').toLowerCase();
            if (Array.isArray(selectedSources) && selectedSources.length > 0 && !selectedSources.includes(src)) return false;
            if (filters.source && src !== filters.source) return false;
            const hasAnom2 = anomaliesData2.some(a => a.event_id === event.id);
            if (filters.anomaliesOnly && !hasAnom2) return false;
            const confOk2 = typeof event.confidence === 'number' ? event.confidence >= (filters.minConf || 0) : true;
            if (!confOk2) return false;
            if ((filters.minSev || 0) > 0 && !anomaliesData2.some(a => a.event_id === event.id && (a.severity || 0) >= (filters.minSev || 0))) return false;
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
            setEvents(filteredEvents2);
          setAnomalies(anomalies72);
          }
        }
      } catch (err) {
        console.error('Failed to fetch backend data', err);
        if (!cancelled) {
          setBackendOnline(false);
          setEvents([]);
          setAnomalies([]);
        }
      }
    };

    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
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

      {/* Source selection gate */}
      {showSourceSelect && location.pathname !== '/database' ? (
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
                <SourceCard key={card.key} card={card} selectedSources={selectedSources} setSelectedSources={setSelectedSources} count={sourceCounts[card.key] || 0} conf={confidenceBySrc[card.key] || 0} />
              ))}
            </div>
            <div className="p-3" style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Selected: {selectedSources.map(s => (s||'UNKNOWN').toUpperCase()).join(', ') || 'None'} ({selectedSources.length}/{sourceCardDefs.length})</div>
                <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round((selectedSources.length / sourceCardDefs.length) * 100)}%`, height: '100%', background: 'var(--accent)', transition: 'width 300ms ease' }} />
                </div>
              </div>
              <button className="button-tactical" disabled={selectedSources.length === 0} onClick={() => { setShowSourceSelect(false); navigate('/'); }}>Continue</button>
            </div>
          </div>
        </div>
      ) : (
        <Routes>
        <Route
          path="/"
          element={(
            <>
              <div className="tactical-panel" style={{ margin: '12px 16px 0 16px' }}>
                <div className="panel-header">
                  <div style={{ color: 'var(--accent)' }}>Operational Overview</div>
                </div>
                <div className="p-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                  <div className="tactical-panel">
                    <div className="p-3" style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>Total Events</div>
                      <div style={{ fontSize: 28, letterSpacing: 1, color: 'var(--accent)' }}>{totalEvents}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Last update: {lastUpdate}</div>
                    </div>
                  </div>
                  <div className="tactical-panel">
                    <div className="p-3" style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>Anomalies</div>
                      <div style={{ fontSize: 28, letterSpacing: 1, color: 'var(--danger)' }}>{totalAnomalies}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Severity varies by type</div>
                    </div>
                  </div>
                  <div className="tactical-panel">
                    <div className="p-3" style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>Threat Level</div>
                      <div style={{ fontSize: 28, letterSpacing: 1, color: threatScore.level === 'High' ? 'var(--danger)' : 'var(--accent)' }}>{threatScore.level}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Score {threatScore.score} • density {Math.round(threatScore.components.anomalyDensity*100)}%</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="tactical-panel" style={{ margin: '12px 16px' }}>
                <div className="p-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 16, color: 'var(--accent)' }}>RTAIP converts multi‑source signals into anomaly intelligence</div>
                    <div style={{ fontSize: 13, opacity: 0.85 }}>See current anomalies, predicted hotspots by city, and set alerts for your area.</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="button-tactical" onClick={() => runAnalyst('Summary for last 24 hours')}>Start Briefing</button>
                    <button className="button-tactical" onClick={() => setShowAbout(true)}>About Sources</button>
                  </div>
                </div>
              </div>
              <div className="flex flex-1" style={{ minHeight: 'calc(100vh - 60px)' }}>
              <div className="w-1/4 p-4">
                <div className="tactical-panel">
                  <div className="panel-header">
                    <div style={{ color: 'var(--accent)' }}>Data Sources</div>
                    <div className="button-tactical" onClick={() => setFilters({})}>Clear</div>
                  </div>
                  <div className="p-2" style={{ fontSize: 13 }}>
                    <div style={{ marginBottom: 6 }}>Total Events: <span style={{ color: 'var(--accent)' }}>{totalEvents}</span></div>
                    <div style={{ marginBottom: 6 }}>Anomalies: <span style={{ color: 'var(--danger)' }}>{totalAnomalies}</span></div>
                    <div style={{ marginBottom: 10, opacity: 0.8 }}>Last Update: {lastUpdate}</div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className={`button-tactical ${!filters.source ? 'active' : ''}`} onClick={() => setFilters(f => ({ ...f, source: undefined }))}>All</button>
                      {Object.entries(sourceCounts).map(([src, cnt]) => (
                        <button key={src} className={`button-tactical ${filters.source === src ? 'active' : ''}`} onClick={() => setFilters(f => ({ ...f, source: src }))}>
                          {(src || 'UNKNOWN').toUpperCase()} <span style={{ color: 'var(--accent-muted)', marginLeft: 6 }}>{cnt}</span>
                        </button>
                      ))}
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={!!filters.anomaliesOnly} onChange={(e) => setFilters(f => ({ ...f, anomaliesOnly: e.target.checked }))} />
                        Show anomalies only
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                      <input className="button-tactical" placeholder="Search" value={filters.search || ''} onChange={(e)=>setFilters(f=>({ ...f, search: e.target.value }))} />
                      <input className="button-tactical" placeholder="bbox minLat,minLon,maxLat,maxLon" value={filters.bbox || ''} onChange={(e)=>setFilters(f=>({ ...f, bbox: e.target.value }))} />
                      <input className="button-tactical" placeholder="Min Confidence" type="number" step="0.1" value={filters.minConf || 0} onChange={(e)=>setFilters(f=>({ ...f, minConf: Number(e.target.value)||0 }))} />
                      <input className="button-tactical" placeholder="Min Severity" type="number" value={filters.minSev || 0} onChange={(e)=>setFilters(f=>({ ...f, minSev: Number(e.target.value)||0 }))} />
                      <select className="button-tactical" value={filters.window || 'last 24 hours'} onChange={(e)=>setFilters(f=>({ ...f, window: e.target.value }))}>
                        <option>last hour</option>
                        <option>last 24 hours</option>
                        <option>last 7 days</option>
                      </select>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="button-tactical" onClick={() => {
                          const rows = events.map(ev => ({
                            id: ev.id,
                            source: ev.source,
                            timestamp: ev.timestamp,
                            latitude: ev.latitude,
                            longitude: ev.longitude,
                            confidence: ev.confidence
                          }));
                          const header = Object.keys(rows[0] || {}).join(',');
                          const body = rows.map(r => Object.values(r).map(v => String(v ?? '')).join(',')).join('\n');
                          const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a'); a.href = url; a.download = `events_${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
                        }}>Export CSV</button>
                        <button className="button-tactical" onClick={() => {
                          const geo = {
                            type: 'FeatureCollection',
                            features: events.filter(ev => ev.latitude != null && ev.longitude != null).map(ev => ({
                              type: 'Feature',
                              geometry: { type: 'Point', coordinates: [ev.longitude, ev.latitude] },
                              properties: { id: ev.id, source: ev.source, timestamp: ev.timestamp, confidence: ev.confidence }
                            }))
                          };
                          const blob = new Blob([JSON.stringify(geo)], { type: 'application/geo+json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a'); a.href = url; a.download = `events_${Date.now()}.geojson`; a.click(); URL.revokeObjectURL(url);
                        }}>Export GeoJSON</button>
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <NavLink to="/map" className="button-tactical">Open Full Map</NavLink>
                    </div>
                    <div className="tactical-panel" style={{ marginTop: 12 }}>
                      <div className="panel-header"><div style={{ color: 'var(--accent)' }}>Playbooks</div></div>
                      <div className="p-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                        <button className="button-tactical" onClick={() => runAnalyst('Summary for last 24 hours')}>Daily Brief</button>
                        <button className="button-tactical" onClick={() => runAnalyst('Predict future anomalies')}>Predict Hotspots</button>
                        <button className="button-tactical" onClick={() => runAnalyst('List anomalies severity >= 7 last 7 days')}>High‑Severity Watch</button>
                        <button className="button-tactical" onClick={() => runAnalyst('AIS GDACS disasters last 72 hours')}>Maritime Risk</button>
                      </div>
                    </div>
                  </div>
                </div>

        <div className="tactical-panel" style={{ marginTop: 12 }}>
          <div className="panel-header">
            <div style={{ color: 'var(--accent)' }}>Timeline & Feed</div>
            <div className="button-tactical" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Top</div>
          </div>
          <div className="p-2">
                    <div className="mt-3">
                      <ReplayTimeline events={events} onTimeChange={handleTimeChange} />
        </div>
        <div className="tactical-panel" style={{ marginTop: 12 }}>
          <div className="panel-header" style={{ justifyContent: 'space-between' }}>
            <div style={{ color: 'var(--accent)' }}>Ingestion Health</div>
            <div className="button-tactical" onClick={async ()=>{ try { const r = await fetch(`${API}/perf/metrics`); const d = await r.json(); setMetrics(Array.isArray(d)?d:[]); } catch {} }}>Refresh Health</div>
          </div>
          <div className="p-2" style={{ fontSize: 13 }}>
            {metrics.length === 0 ? <div style={{ opacity: 0.8 }}>No metrics.</div> : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {metrics.slice(0,10).map((m, idx) => (
                  <li key={idx}>FPS {m.fps} • events {m.events} • anomalies {m.anomalies} • zoom {m.zoom} • {m.device || 'unknown'}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="tactical-panel" style={{ marginTop: 12 }}>
          <div className="panel-header" style={{ justifyContent: 'space-between' }}>
            <div style={{ color: 'var(--accent)' }}>Briefing Mode</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="button-tactical" value={briefingTime} onChange={(e)=>setBriefingTime(e.target.value)}>
                  <option>last hour</option>
                  <option>last 24 hours</option>
                </select>
                <select className="button-tactical" value={briefingSource} onChange={(e)=>setBriefingSource(e.target.value)}>
                  <option value="">ALL</option>
                  {Object.keys(sourceCounts).map(s => (<option key={s} value={s}>{(s||'UNKNOWN').toUpperCase()}</option>))}
                </select>
          </div>
        </div>
        <div className="tactical-panel" style={{ marginTop: 12 }}>
          <div className="panel-header" style={{ justifyContent: 'space-between' }}>
            <div style={{ color: 'var(--accent)' }}>Alert Rules</div>
            <div className="button-tactical" onClick={async ()=>{
              try {
                const res = await fetch(`${API}/alert-rules`);
                const data = await res.json();
                setAlertRules(Array.isArray(data) ? data : []);
              } catch {}
            }}>Refresh</div>
          </div>
          <div className="p-2" style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 8 }}>
              {alertRules.length === 0 ? <div style={{ opacity: 0.8 }}>No rules.</div> : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {alertRules.map(r => (
                    <li key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{r.name} • {(r.source||'ALL').toUpperCase()} • sev≥{r.severity_threshold} • conf≥{Math.round((r.min_confidence||0)*100)}%</span>
                      <button className="button-tactical" onClick={async ()=>{ try { await fetch(`${API}/alert-rules/${r.id}`, { method: 'DELETE' }); const res = await fetch(`${API}/alert-rules`); const data = await res.json(); setAlertRules(Array.isArray(data)?data:[]); } catch {} }}>Delete</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input className="button-tactical" placeholder="Name" value={alertForm.name} onChange={(e)=>setAlertForm(f=>({ ...f, name: e.target.value }))} />
              <select className="button-tactical" value={alertForm.source} onChange={(e)=>setAlertForm(f=>({ ...f, source: e.target.value }))}>
                <option value="">ALL</option>
                {Object.keys(sourceCounts).map(s => (<option key={s} value={s}>{(s||'UNKNOWN').toUpperCase()}</option>))}
              </select>
              <input className="button-tactical" placeholder="Severity ≥" type="number" value={alertForm.severity_threshold} onChange={(e)=>setAlertForm(f=>({ ...f, severity_threshold: Number(e.target.value)||0 }))} />
              <input className="button-tactical" placeholder="Confidence ≥" type="number" step="0.1" value={alertForm.min_confidence} onChange={(e)=>setAlertForm(f=>({ ...f, min_confidence: Number(e.target.value)||0 }))} />
              <input className="button-tactical" placeholder="min_lat" value={alertForm.min_lat} onChange={(e)=>setAlertForm(f=>({ ...f, min_lat: e.target.value }))} />
              <input className="button-tactical" placeholder="min_lon" value={alertForm.min_lon} onChange={(e)=>setAlertForm(f=>({ ...f, min_lon: e.target.value }))} />
              <input className="button-tactical" placeholder="max_lat" value={alertForm.max_lat} onChange={(e)=>setAlertForm(f=>({ ...f, max_lat: e.target.value }))} />
              <input className="button-tactical" placeholder="max_lon" value={alertForm.max_lon} onChange={(e)=>setAlertForm(f=>({ ...f, max_lon: e.target.value }))} />
              <input className="button-tactical" placeholder="email_to" value={alertForm.email_to} onChange={(e)=>setAlertForm(f=>({ ...f, email_to: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="button-tactical" onClick={async ()=>{
                try {
                  const payload = { ...alertForm };
                  ['min_lat','min_lon','max_lat','max_lon'].forEach(k=>{ if(payload[k]==='') payload[k]=null; else payload[k]=Number(payload[k]); });
                  if (payload.source==='') payload.source = null;
                  const res = await fetch(`${API}/alert-rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                  await res.json();
                  const r = await fetch(`${API}/alert-rules`);
                  const data = await r.json();
                  setAlertRules(Array.isArray(data)?data:[]);
                } catch {}
              }}>Create Rule</button>
              <button className="button-tactical" onClick={()=>setAlertForm({ name: '', source: '', severity_threshold: 5, min_confidence: 0.5, min_lat: '', min_lon: '', max_lat: '', max_lon: '', email_to: '' })}>Clear</button>
            </div>
          </div>
        </div>
            <div className="p-2" style={{ fontSize: 13 }}>
              <div style={{ marginBottom: 8 }}>
                <input value={briefingBbox} onChange={(e)=>setBriefingBbox(e.target.value)} className="button-tactical" placeholder="bbox minLat,minLon,maxLat,maxLon (optional)" style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button-tactical" onClick={async ()=>{
                  const parts = [];
                  parts.push('brief summary');
                  parts.push(briefingTime);
                  if (briefingSource) parts.push(briefingSource);
                  if (briefingBbox) parts.push(`bbox:${briefingBbox}`);
                  try {
                    const res = await fetch(`${API}/api/ai-analyst`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: parts.join(' ') }) });
                    const data = await res.json();
                    setBriefingOutput(String(data?.output || 'No analysis available.'));
                  } catch {
                    setBriefingOutput('Error contacting analyst API.');
                  }
                }}>Generate</button>
                <button className="button-tactical" onClick={()=>setBriefingOutput('')}>Clear</button>
              </div>
              <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8, minHeight: 80 }}>{briefingOutput || 'Briefing output will appear here.'}</div>
            </div>
          </div>
                    <div className="mt-3">
                      <EventFeed events={visibleEvents} anomalies={visibleAnomalies} onSelect={handleSelectEvent} selectedEventId={selectedEventId} />
                    </div>
                  </div>

                        {selectedEventId && (() => {
                          const ev = events.find(e => e.id === selectedEventId);
                          const anom = anomalies.find(a => a.event_id === selectedEventId);
                          return (
                            <div className="tactical-panel" style={{ marginTop: 12 }}>
                        <div className="panel-header">
                          <div style={{ color: 'var(--accent)' }}>Event Details</div>
                          <div className="button-tactical" onClick={() => setSelectedEventId(null)}>Close</div>
                        </div>
                        <div className="p-2" style={{ fontSize: 13 }}>
                          <div>Source: <span style={{ color: 'var(--accent-muted)' }}>{(ev?.source || 'UNKNOWN').toUpperCase()}</span></div>
                          <div>Timestamp: {ev?.timestamp ? new Date(ev.timestamp).toLocaleString() : '—'}</div>
                              <div>Latitude: {ev?.latitude ?? '—'} | Longitude: {ev?.longitude ?? '—'}</div>
                              <div>ID: {ev?.id ?? '—'}</div>
                              <div>Confidence: {typeof ev?.confidence === 'number' ? Math.round(ev.confidence * 100) : (typeof ev?.confidence === 'string' ? Math.round(Number(ev.confidence) * 100) : '—')}%</div>
                              <div style={{ marginTop: 6, color: anom ? 'var(--danger)' : 'var(--accent-muted)' }}>
                                {anom ? 'Anomaly detected for this event' : 'Status: normal'}
                              </div>
                          {anom && (
                            <div style={{ marginTop: 8 }}>
                              <div>Type: <span style={{ color: 'var(--accent-muted)' }}>{anom.type}</span></div>
                              <div>Severity: <span style={{ color: 'var(--accent)' }}>{anom.severity}</span></div>
                              <div>Description: <span style={{ opacity: 0.9 }}>{anom.description}</span></div>
                                  {(() => { const meta = parseAnomalyMeta(anom); return (
                                    <>
                                      {meta.algorithm && <div>Algorithm: <span style={{ color: 'var(--accent-muted)' }}>{meta.algorithm}</span></div>}
                                      {typeof meta.score === 'number' && <div>Model score: <span style={{ color: 'var(--accent)' }}>{meta.score.toFixed(4)}</span></div>}
                                      {meta.rule && <div>Rule: <span style={{ color: 'var(--accent-muted)' }}>{meta.rule}</span></div>}
                                      {typeof meta.magnitude === 'number' && <div>Magnitude: <span style={{ color: 'var(--accent)' }}>{meta.magnitude}</span></div>}
                                      {typeof ev?.confidence === 'number' && <div>Confidence: <span style={{ color: 'var(--accent)' }}>{Math.round(ev.confidence * 100)}%</span></div>}
                                    </>
                                  ); })()}
                              <div>Detected: {anom.timestamp ? new Date(anom.timestamp).toLocaleString() : '—'}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="w-3/4 p-4">
                <div className="tactical-panel" style={{ height: '100%' }}>
                  <div className="panel-header">
                    <div style={{ color: 'var(--accent)' }}>Operational Insights</div>
                    <div className="button-tactical" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Top</div>
                  </div>
                  <div className="p-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="tactical-panel">
                      <div className="panel-header">
                        <div style={{ color: 'var(--accent)' }}>Event Volume (Hourly)</div>
                      </div>
                      <div className="p-2">
                        <Line data={{ labels: hourlyLabels, datasets: [{ label: 'Events', data: hourlyCounts, borderColor: '#00ffc6', backgroundColor: 'rgba(0,255,198,0.15)', tension: 0.3 }] }} options={{ plugins: { legend: { display: true, labels: { color: '#e6f8f4' } } }, scales: { x: { ticks: { color: '#e6f8f4' } }, y: { ticks: { color: '#e6f8f4' } } } }} />
                        <div className="mt-2" style={{ fontSize: 12, opacity: 0.8 }}>Observed hourly event counts across all sources.</div>
                      </div>
                    </div>
                    <div className="tactical-panel">
                      <div className="panel-header">
                        <div style={{ color: 'var(--accent)' }}>Source Distribution</div>
                      </div>
                      <div className="p-2">
                        <Doughnut data={{ labels: sourceLabels, datasets: [{ label: 'Sources', data: sourceValues, backgroundColor: ['#1e90ff','#32cd32','#ff8c00','#8a2be2','#ff4500','#999'] }] }} options={{ plugins: { legend: { position: 'bottom', labels: { color: '#e6f8f4' } } } }} />
                        <div className="mt-2" style={{ fontSize: 12, opacity: 0.8 }}>Share of events by source.</div>
                      </div>
                    </div>
                    <div className="tactical-panel">
                      <div className="panel-header">
                        <div style={{ color: 'var(--accent)' }}>Anomaly Volume (Hourly)</div>
                      </div>
                      <div className="p-2">
                        <Bar data={{ labels: hourlyLabels, datasets: [{ label: 'Anomalies', data: anomalyHourlyCounts, backgroundColor: 'rgba(220,53,69,0.6)', borderColor: '#dc3545' }] }} options={{ plugins: { legend: { display: true, labels: { color: '#e6f8f4' } } }, scales: { x: { ticks: { color: '#e6f8f4' } }, y: { ticks: { color: '#e6f8f4' } } } }} />
                        <div className="mt-2" style={{ fontSize: 12, opacity: 0.8 }}>Observed hourly anomaly counts (detections from IsolationForest + rule-based checks).</div>
                      </div>
                    </div>
                    <div className="tactical-panel">
                      <div className="panel-header">
                        <div style={{ color: 'var(--accent)' }}>Anomaly Severity</div>
                      </div>
                      <div className="p-2">
                        <Bar data={{ labels: severityLabels, datasets: [{ label: 'Count', data: severityValues, backgroundColor: '#ff3b3b' }] }} options={{ plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#e6f8f4' } }, y: { ticks: { color: '#e6f8f4' } } } }} />
                        <div className="mt-2" style={{ fontSize: 12, opacity: 0.8 }}>Anomaly severity distribution (numeric severity bucketed into Low/Medium/High/Critical).</div>
                      </div>
                    </div>
                    <div className="tactical-panel">
                      <div className="panel-header">
                        <div style={{ color: 'var(--accent)' }}>Last 60-Minute Events (5-min buckets)</div>
                      </div>
                      <div className="p-2">
                        <Line data={{ labels: bucketLabels, datasets: [
                          { label: 'Events', data: bucketsEvents, borderColor: '#00ffc6', backgroundColor: 'rgba(0,255,198,0.15)', tension: 0.3 },
                          { label: 'Anomalies', data: bucketsAnoms, borderColor: '#dc3545', backgroundColor: 'rgba(220,53,69,0.2)', borderDash: [6,4], tension: 0.3 }
                        ] }} options={{ plugins: { legend: { display: true, labels: { color: '#e6f8f4' } } }, scales: { x: { ticks: { color: '#e6f8f4' } }, y: { ticks: { color: '#e6f8f4' } } } }} />
                        <div className="mt-2" style={{ fontSize: 12, opacity: 0.8 }}>Quick view of recent activity, grouped by 5-minute intervals.</div>
                      </div>
                    </div>
                    <div className="tactical-panel">
                      <div className="panel-header">
                        <div style={{ color: 'var(--accent)' }}>Predictive Outlook (Next 6h)</div>
                      </div>
                      <div className="p-2">
                        <Line data={{ labels: [...hourlyLabels, ...(() => { const last = hourlyLabels.length>0 ? new Date(hourlyLabels[hourlyLabels.length-1].replace(' ', 'T')) : new Date(); return Array.from({length:6},(_,i)=>{ const d = new Date(last.getTime()+(i+1)*3600*1000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:00`; }); })()], datasets: [
                          { label: 'Observed', data: hourlyCounts, borderColor: '#00ffc6', backgroundColor: 'rgba(0,255,198,0.15)', tension: 0.3 },
                          { label: 'Forecast', data: [...Array(hourlyCounts.length).fill(null), ...(() => { const values = hourlyCounts; const n=values.length; if(n===0) return Array(6).fill(0); if(n===1) return Array(6).fill(values[0]); let sumX=0,sumY=0,sumXY=0,sumXX=0; for(let i=0;i<n;i++){sumX+=i;sumY+=values[i];sumXY+=i*values[i];sumXX+=i*i;} const denom=(n*sumXX - sumX*sumX); const m = denom!==0 ? (n*sumXY - sumX*sumY)/denom : 0; const b=(sumY - m*sumX)/n; const arr=[]; for(let k=0;k<6;k++){const x=n+k; arr.push(Math.max(0, Math.round(m*x + b)));} return arr; })()], borderColor: '#ffaa00', backgroundColor: 'rgba(255,170,0,0.15)', borderDash: [6,4], tension: 0.3 }
                        ] }} options={{ plugins: { legend: { display: true, labels: { color: '#e6f8f4' } } }, scales: { x: { ticks: { color: '#e6f8f4' } }, y: { ticks: { color: '#e6f8f4' } } } }} />
                        <div className="mt-2" style={{ fontSize: 12, opacity: 0.8 }}>Forecasted hourly event counts for the next 6 hours using a simple linear regression over observed event volume. The dashed line shows the forecast. This predicts overall event rate, not anomaly probability.</div>
                      </div>
                    </div>
                    <div className="tactical-panel">
                      <div className="panel-header">
                        <div style={{ color: 'var(--accent)' }}>Pattern Deviation (Recent vs Baseline)</div>
                      </div>
                      <div className="p-2">
                        {(() => { const baselineCounts = events.reduce((acc,e)=>{ const k=(e.source||'unknown').toLowerCase(); acc[k]=(acc[k]||0)+1; return acc; },{}); const recentWindow = events.slice(Math.max(0, events.length - Math.min(20, events.length))); const recentCounts = recentWindow.reduce((acc,e)=>{ const k=(e.source||'unknown').toLowerCase(); acc[k]=(acc[k]||0)+1; return acc; },{}); const allSources = Array.from(new Set(Object.keys(baselineCounts).concat(Object.keys(recentCounts)))); const deviationLabels = allSources.map(s => (s||'UNKNOWN').toUpperCase()); const baselineTotal = events.length || 1; const recentTotal = recentWindow.length || 1; const deviationValues = allSources.map(s => { const basePct=(baselineCounts[s]||0)/baselineTotal; const recentPct=(recentCounts[s]||0)/recentTotal; return Number(((recentPct - basePct) * 100).toFixed(1)); }); return (
                          <Bar data={{ labels: deviationLabels, datasets: [{ label: 'Deviation (%)', data: deviationValues, backgroundColor: deviationValues.map(v => v >= 0 ? 'rgba(0,255,198,0.5)' : 'rgba(220,53,69,0.6)') }] }} options={{ plugins: { legend: { display: true, labels: { color: '#e6f8f4' } } }, scales: { x: { ticks: { color: '#e6f8f4' } }, y: { ticks: { color: '#e6f8f4' } } } }} />
                        ); })()}
                        <div className="mt-2" style={{ fontSize: 12, opacity: 0.8 }}>Recent vs baseline source mix: compares the last 20 events to the overall distribution and plots percent deviation by source. Green = above baseline, Red = below baseline.</div>
                      </div>
                    </div>

                    {/* Operational Threat Index */}
                    <div className="tactical-panel">
                      <div className="panel-header">
                        <div style={{ color: 'var(--accent)' }}>Operational Threat Index</div>
                      </div>
                      <div className="p-2" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ fontSize: 28, fontWeight: 700 }}>
                          {threatScore.score} <span style={{ fontSize: 14, opacity: 0.8 }}>/ 10 ({threatScore.level})</span>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          <div>Anomaly Density: {(threatScore.components.anomalyDensity*100).toFixed(1)}%</div>
                          <div>Event Velocity: {(threatScore.components.velocityIndex*100).toFixed(1)}%</div>
                          <div>Source Volatility: {(threatScore.components.volatility*100).toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="p-2" style={{ fontSize: 12, opacity: 0.8 }}>Calculated from anomaly density + event velocity + source volatility.</div>
                    </div>

                    {/* Smart Summary */}
                    <div className="tactical-panel">
                      <div className="panel-header">
                        <div style={{ color: 'var(--accent)' }}>Smart Summary</div>
                      </div>
                      <div className="p-2" style={{ fontSize: 13 }}>
                        {(() => {
                          const hotClusters = sourcesMeta.flatMap(m => m.topClusters.map(([k,c]) => ({ src: m.src, key: k, count: c, conf: m.confidence })));
                          const top = hotClusters.sort((a,b)=>b.count - a.count).slice(0,5);
                          const criticalAnoms = anomalies.filter(a => a.severity >= 7).slice(0,5);
                          return (
                            <>
                              <div style={{ marginBottom: 8 }}>Top Hot Spots:</div>
                              {top.length === 0 ? <div style={{ opacity: 0.8 }}>No clusters detected.</div> : (
                                <ul style={{ margin: 0, paddingLeft: 18 }}>
                                  {top.map((t, i) => (<li key={`${t.src}-${t.key}-${i}`}>{(t.src||'UNK').toUpperCase()} • {t.key} • count={t.count} • conf={t.conf}%</li>))}
                                </ul>
                              )}
                              <div style={{ marginTop: 12, marginBottom: 8 }}>High-Risk Anomalies:</div>
                              {criticalAnoms.length === 0 ? <div style={{ opacity: 0.8 }}>None</div> : (
                                <ul style={{ margin: 0, paddingLeft: 18 }}>
                                  {criticalAnoms.map((a, i) => {
                                    const ev = events.find(e => e.id === a.event_id);
                                    return (<li key={`${a.id}-${i}`}>{a.type} • sev={a.severity} • {(ev?.source||'UNK').toUpperCase()} • ({ev?.latitude},{ev?.longitude})</li>);
                                  })}
                                </ul>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Last 60-Minute Intelligence */}
                    <div className="tactical-panel">
                      <div className="panel-header">
                        <div style={{ color: 'var(--accent)' }}>Last 60-Minute Intelligence</div>
                      </div>
                      <div className="p-2" style={{ fontSize: 13 }}>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {intelSummary.map((line, idx) => (<li key={idx} style={{ marginBottom: 6 }}>{line}</li>))}
                        </ul>
                      </div>
                    </div>

                    <div className="tactical-panel">
                      <div className="panel-header">
                        <div style={{ color: 'var(--accent)' }}>Source Metadata</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          <span>Cluster Res:</span>
                          <select value={clusterResDeg} onChange={(e)=>setClusterResDeg(parseFloat(e.target.value))} className="button-tactical" style={{ padding: '4px 6px' }}>
                            <option value={0.25}>0.25°</option>
                            <option value={0.5}>0.5°</option>
                            <option value={1}>1.0°</option>
                          </select>
                        </div>
                      </div>
                      <div className="p-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                        {sourcesMeta.map(meta => (
                          <div key={meta.src} className="tactical-panel" style={{ background: 'rgba(0,0,0,0.2)' }}>
                            <div className="panel-header" style={{ justifyContent: 'space-between' }}>
                              <div style={{ color: 'var(--accent)' }}>{(meta.src||'UNKNOWN').toUpperCase()}</div>
                              <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, opacity: 0.8 }}>
                                <span>Anomaly Rate: {(meta.anomalyRate*100).toFixed(1)}%</span>
                                <span>Confidence: {meta.confidence}%</span>
                              </div>
                            </div>
                            <div className="p-2" style={{ fontSize: 12 }}>
                              <div style={{ marginBottom: 6 }}>Top Clusters: {meta.topClusters.length>0 ? meta.topClusters.map(([k,c]) => (<span key={k} style={{ marginRight: 8, color: 'var(--accent-muted)' }}>{k} ({c})</span>)) : '—'}</div>
                              <div style={{ maxHeight: 180, overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>
                                {meta.last10.map(ev => (
                                  (() => {
                                    const anom = anomaliesByEvent[ev.id];
                                    const desc = anom ? (anom.description || '') : '';
                                    const m = desc.match(/score=([\-0-9\.]+)/);
                                    let prob = anom ? 0.5 : meta.anomalyRate;
                                    if (anom && typeof anom.severity === 'number') prob = Math.min(1, Math.max(0, anom.severity / 10));
                                    else if (anom && m) { const s = parseFloat(m[1]); if (!isNaN(s)) prob = Math.min(1, Math.max(0, -s)); }
                                    const sev = anom ? (typeof anom.severity === 'number' ? anom.severity : 0) : 0;
                                    return (
                                      <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <div>
                                          <span style={{ color: 'var(--accent-muted)' }}>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                                          <span style={{ marginLeft: 8 }}>ID: {ev.id}</span>
                                        </div>
                                        <div>
                                          <span style={{ marginRight: 8 }}>Prob: {(prob*100).toFixed(0)}%</span>
                                          <span>Severity: {sev}</span>
                                        </div>
                                      </div>
                                    );
                                  })()
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </>
          )}
        />

        <Route
          path="/map"
          element={(
            <div className="flex flex-1" style={{ minHeight: 'calc(100vh - 60px)' }}>
              <div className="w-2/3 p-4">
                <div className="tactical-panel" style={{ height: '80vh', position: 'relative' }}>
                  <div className="panel-header">
                    <div style={{ color: 'var(--accent)' }}>Operational Map</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="button-tactical" onClick={() => setShowHelp(s => !s)}>Help</button>
                      {selectedSources.length > 0 && (
                        <select className="button-tactical" value={filters.source || ''} onChange={(e) => setFilters(f => ({ ...f, source: e.target.value || undefined }))}>
                          <option value="">All</option>
                          {selectedSources.map(s => (
                            <option key={s} value={s}>{(s || 'UNKNOWN').toUpperCase()}</option>
                          ))}
                        </select>
                      )}
                      <button className="button-tactical" onClick={() => setBasemapStyle(s => baseStyles[(baseStyles.indexOf(s)+1)%baseStyles.length])}>{basemapStyle.toUpperCase()}</button>
                      <label className="button-tactical" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={useWebGL} onChange={(e)=>setUseWebGL(e.target.checked)} /> WebGL
                      </label>
                    </div>
                  </div>
                  <div style={{ height: 'calc(100% - 42px)' }}>
                    <MapComponent events={visibleEvents} anomalies={visibleAnomalies} focusEventId={focusEventId} onSelect={handleSelectEvent} basemapStyle={basemapStyle} useWebGL={useWebGL} onPerfUpdate={handlePerfUpdate} />
                  </div>
                  {showHelp && (
                    <div style={{ position: 'absolute', top: 50, right: 20, background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(0,255,198,0.2)', borderRadius: 8, padding: 12, maxWidth: 320 }}>
                      <div style={{ color: 'var(--accent)', marginBottom: 6 }}>What am I seeing?</div>
                      <div style={{ fontSize: 13 }}>
                        <div>Heat layer shows density and hotspots.</div>
                        <div>Red markers indicate anomalies.</div>
                        <div>Ask the Analyst for a briefing.</div>
                      </div>
                      <div className="button-tactical" style={{ marginTop: 8 }} onClick={() => setShowHelp(false)}>Close</div>
                    </div>
                  )}
                </div>
                {selectedEventId && (() => {
                  const ev = events.find(e => e.id === selectedEventId);
                  const anom = anomalies.find(a => a.event_id === selectedEventId);
                  return (
                    <div className="tactical-panel" style={{ marginTop: 12 }}>
                      <div className="panel-header">
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
                        {anom && (
                          <div style={{ marginTop: 8 }}>
                            <div>Type: <span style={{ color: 'var(--accent-muted)' }}>{anom.type}</span></div>
                            <div>Severity: <span style={{ color: 'var(--accent)' }}>{anom.severity}</span></div>
                            <div>Description: <span style={{ opacity: 0.9 }}>{anom.description}</span></div>
                            {(() => { const meta = parseAnomalyMeta(anom); return (
                              <>
                                {meta.algorithm && <div>Algorithm: <span style={{ color: 'var(--accent-muted)' }}>{meta.algorithm}</span></div>}
                                {typeof meta.score === 'number' && <div>Model score: <span style={{ color: 'var(--accent)' }}>{meta.score.toFixed(4)}</span></div>}
                                {meta.rule && <div>Rule: <span style={{ color: 'var(--accent-muted)' }}>{meta.rule}</span></div>}
                                {typeof meta.magnitude === 'number' && <div>Magnitude: <span style={{ color: 'var(--accent)' }}>{meta.magnitude}</span></div>}
                              </>
                            ); })()}
                            <div>Detected: {anom.timestamp ? new Date(anom.timestamp).toLocaleString() : '—'}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="w-1/3 p-4">
                <div className="tactical-panel" style={{ marginBottom: 12 }}>
                  <div className="panel-header">
                    <div style={{ color: 'var(--accent)' }}>Performance</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="button-tactical" onClick={async ()=>{
                        try {
                          const res = await fetch(`${API}/perf/metrics`);
                          const data = await res.json();
                          setBenchData(Array.isArray(data) ? data : []);
                        } catch {}
                      }}>Load Metrics</button>
                      <button className="button-tactical" onClick={async ()=>{
                        const device = navigator.userAgent;
                        const view = document.querySelector('.ol-viewport');
                        const mapZooms = [2,4,6,8,10,12];
                        const results = [];
                        for (let z of mapZooms) {
                          try {
                            const e = new Event('setZoom');
                            window.dispatchEvent(e);
                            results.push({ ts: new Date().toISOString(), fps: perfInfo.fps, events: perfInfo.events, anomalies: perfInfo.anomalies, zoom: z, device });
                            await fetch(`${API}/perf/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fps: perfInfo.fps, events: perfInfo.events, anomalies: perfInfo.anomalies, zoom: z, device }) });
                          } catch {}
                        }
                        setBenchData(results);
                      }}>Run Benchmark</button>
                      <button className="button-tactical" onClick={()=>{
                        const rows = [['ts','fps','events','anomalies','zoom','device'], ...benchData.map(r=>[r.ts, r.fps, r.events, r.anomalies, r.zoom, r.device])];
                        const csv = rows.map(row => row.join(',')).join('\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = 'perf_metrics.csv'; a.click();
                        URL.revokeObjectURL(url);
                      }}>Export CSV</button>
                    </div>
                  </div>
                  <div className="p-2" style={{ fontSize: 13 }}>
                    <div>FPS: <span style={{ color: 'var(--accent)' }}>{perfInfo.fps}</span></div>
                    <div>Events: <span style={{ color: 'var(--accent-muted)' }}>{perfInfo.events}</span></div>
                    <div>Anomalies: <span style={{ color: 'var(--danger)' }}>{perfInfo.anomalies}</span></div>
                    {benchData.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>Recent Metrics</div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {benchData.slice(0,6).map((r, i) => (
                            <li key={i}>{r.ts} • zoom={r.zoom} • fps={r.fps} • events={r.events} • anomalies={r.anomalies}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
                {mapOnboard && (
                  <div className="tactical-panel" style={{ marginBottom: 12 }}>
                    <div className="panel-header">
                      <div style={{ color: 'var(--accent)' }}>Quick Start</div>
                      <div className="button-tactical" onClick={() => { setMapOnboard(false); try { localStorage.setItem('rtaip_onboard_map_done', '1'); } catch {} }}>Got it</div>
                    </div>
                    <div className="p-2" style={{ fontSize: 13 }}>
                      <div>1) Choose a source.</div>
                      <div>2) Use the heat layer to find hotspots.</div>
                      <div>3) Ask the Analyst for a summary.</div>
                      <div>4) Click markers to see details.</div>
                    </div>
                  </div>
                )}
                <ChatPanel apiBase={API} />
                
                <div className="tactical-panel" style={{ marginTop: 12 }}>
                  <div className="panel-header">
                    <div style={{ color: 'var(--accent)' }}>Export Briefing</div>
                  </div>
                  <div className="p-2" style={{ fontSize: 13 }}>
                    <button className="button-tactical" onClick={() => {
                      const lines = [];
                      lines.push(`Operational Threat Index: ${threatScore.score}/10 (${threatScore.level})`);
                      intelSummary.forEach(l => lines.push(l));
                      lines.push('Source counts:');
                      Object.entries(sourceCounts).forEach(([k,v]) => lines.push(`- ${(k||'UNKNOWN').toUpperCase()}: ${v}`));
                      const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url; a.download = `rtaip_briefing_${Date.now()}.txt`; a.click(); URL.revokeObjectURL(url);
                    }}>Export TXT</button>
                    <button className="button-tactical" style={{ marginLeft: 8 }} onClick={() => {
                      const html = `<!doctype html><html><head><meta charset="utf-8"><title>RTAIP Briefing</title><style>body{font-family:sans-serif;padding:24px;background:#0b1b18;color:#e6f8f4}h1{color:#00ffc6}hr{border:0;border-top:1px solid rgba(0,255,198,0.2)}.muted{opacity:.8}</style></head><body><h1>RTAIP Briefing</h1><div class="muted">${new Date().toLocaleString()}</div><hr/><div>Operational Threat Index: ${threatScore.score}/10 (${threatScore.level})</div><div>${intelSummary.map(l=>`<div>${l}</div>`).join('')}</div><div><div class="muted">Source counts</div>${Object.entries(sourceCounts).map(([k,v])=>`<div>${(k||'UNKNOWN').toUpperCase()}: ${v}</div>`).join('')}</div></body></html>`;
                      const w = window.open('', '_blank');
                      if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
                    }}>Export PDF</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        />

        <Route
          path="/replay"
          element={(
            <div className="flex flex-1" style={{ minHeight: 'calc(100vh - 60px)' }}>
              <div className="w-1/4 p-4">
                <div className="tactical-panel">
                  <div className="panel-header">
                    <div style={{ color: 'var(--accent)' }}>Replay Controls</div>
                  </div>
                  <div className="p-3">
                    <ReplayTimeline events={events} onTimeChange={handleTimeChange} />
                  </div>
                </div>
              </div>
              <div className="w-3/4 p-4">
                <div className="tactical-panel" style={{ height: '100%' }}>
                  <div className="panel-header">
                    <div style={{ color: 'var(--accent)' }}>Operational Map</div>
                  </div>
                  <div style={{ height: 'calc(100% - 42px)' }}>
                    <MapComponent events={visibleEvents} anomalies={visibleAnomalies} focusEventId={focusEventId} onSelect={handleSelectEvent} />
                  </div>
                </div>
              </div>
            </div>
          )}
        />
        <Route
          path="/settings"
          element={(
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
          )}
        />
          </Routes>

      )}

      <Routes>
        <Route path="/database" element={(
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
                <button className="button-tactical" disabled={selectedSources.length === 0} onClick={() => { setShowSourceSelect(false); navigate('/'); }}>Continue</button>
              </div>
            </div>
          </div>
        )} />
      </Routes>
      {showAbout && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="tactical-panel" style={{ width: 'min(720px, 92vw)' }}>
            <div className="panel-header" style={{ justifyContent: 'space-between' }}>
              <div style={{ color: 'var(--accent)' }}>About Data Sources</div>
              <button className="button-tactical" onClick={() => setShowAbout(false)}>Close</button>
            </div>
            <div className="p-3" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
              <div className="tactical-panel"><div className="p-2">ADSB • Aircraft transponder signals; flight positions and headings.</div></div>
              <div className="tactical-panel"><div className="p-2">AIS • Maritime vessel positions and identifiers.</div></div>
              <div className="tactical-panel"><div className="p-2">USGS • Seismic events reported by USGS.</div></div>
              <div className="tactical-panel"><div className="p-2">NOAA • Weather alerts and anomalies from NOAA.</div></div>
              <div className="tactical-panel"><div className="p-2">NASA EONET • Curated natural events (fires, storms, volcanoes).</div></div>
              <div className="tactical-panel"><div className="p-2">GDACS • Global disaster alerts and coordination system events.</div></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
