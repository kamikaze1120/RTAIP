import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import MapComponent from './components/MapComponent';
import EventFeed from './components/EventFeed';
// Removed Filters import
import AlertBar from './components/AlertBar';
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

function App() {
  const [events, setEvents] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [filters, setFilters] = useState({});
  const [backendOnline, setBackendOnline] = useState(false);
  const [replayIndex, setReplayIndex] = useState(null);
  const [showSplash, setShowSplash] = useState(true);
  const [focusEventId, setFocusEventId] = useState(null);
  // New UI/Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(10 * 60 * 1000);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [accentDim, setAccentDim] = useState(false);
  // API base configurable via environment; defaults to 8000
  const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const healthRes = await fetch(`${API}/health`);
        if (!cancelled) setBackendOnline(healthRes.ok);

        const eventsRes = await fetch(`${API}/events`);
        const eventsData = await eventsRes.json();

        const anomaliesRes = await fetch(`${API}/anomalies`);
        const anomaliesData = await anomaliesRes.json();

        const filteredEvents = eventsData.filter(event => {
          if (filters.source && event.source !== filters.source) return false;
          if (filters.anomaliesOnly) return anomaliesData.some(a => a.event_id === event.id);
          return true;
        });

        if (!cancelled) {
          setEvents(filteredEvents);
          setAnomalies(anomaliesData);
        }

        // Auto-seed if backend is online and DB appears empty
        if (healthRes.ok && eventsData.length === 0) {
          await fetch(`${API}/seed`);
          const eventsRes2 = await fetch(`${API}/events`);
          const eventsData2 = await eventsRes2.json();
          const anomaliesRes2 = await fetch(`${API}/anomalies`);
          const anomaliesData2 = await anomaliesRes2.json();

          const filteredEvents2 = eventsData2.filter(event => {
            if (filters.source && event.source !== filters.source) return false;
            if (filters.anomaliesOnly) return anomaliesData2.some(a => a.event_id === event.id);
            return true;
          });

          if (!cancelled) {
            setEvents(filteredEvents2);
            setAnomalies(anomaliesData2);
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
  }, [filters, refreshInterval, API]);

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

  const handleSelectEvent = (id) => {
    setFocusEventId(id);
    setSelectedEventId(id);
  };

  // Derived UI metrics and source counts
  const sourceCounts = events.reduce((acc, e) => {
    const key = (e.source || 'unknown').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const totalEvents = events.length;
  const totalAnomalies = anomalies.length;
  const lastUpdate = events.length > 0 ? new Date(events[events.length - 1].timestamp).toLocaleString() : '—';

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

  return (
    <div className="app-root">
      {showSplash && <SplashScreen />}

      {/* Tactical top navbar */}
      <div className="tactical-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
        <div style={{ color: 'var(--accent)', fontWeight: 600 }}>RTAIP</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <NavLink to="/" end className={({ isActive }) => `button-tactical ${isActive ? 'active' : ''}`}>Dashboard</NavLink>
          <NavLink to="/map" className={({ isActive }) => `button-tactical ${isActive ? 'active' : ''}`}>Map</NavLink>
          <NavLink to="/replay" className={({ isActive }) => `button-tactical ${isActive ? 'active' : ''}`}>Replay</NavLink>
          <NavLink to="/settings" className={({ isActive }) => `button-tactical ${isActive ? 'active' : ''}`}>Settings</NavLink>
        </div>
      </div>

      <div className="p-2">
        <div className={`health-badge ${backendOnline ? '' : 'offline'}`}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: backendOnline ? 'var(--accent)' : 'var(--danger)' }} />
          Backend: {backendOnline ? 'Online' : 'Offline'}
        </div>
      </div>
      <AlertBar anomalies={visibleAnomalies} />

      <Routes>
        <Route
          path="/"
          element={(
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

                    <div style={{ marginTop: 12 }}>
                      <NavLink to="/map" className="button-tactical">Open Full Map</NavLink>
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
                  </div>
                </div>
              </div>
            </div>
          )}
        />

        <Route
          path="/map"
          element={(
            <div className="flex flex-1" style={{ minHeight: 'calc(100vh - 60px)' }}>
              <div className="w-full p-4">
                <div className="tactical-panel" style={{ height: '80vh' }}>
                  <div className="panel-header">
                    <div style={{ color: 'var(--accent)' }}>Full Map View</div>
                  </div>
                  <div style={{ height: 'calc(100% - 42px)' }}>
                    <MapComponent events={visibleEvents} anomalies={visibleAnomalies} focusEventId={focusEventId} onSelect={handleSelectEvent} />
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
                  </div>
                </div>
              </div>
            </div>
          )}
        />
      </Routes>
    </div>
  );
}

export default App;
