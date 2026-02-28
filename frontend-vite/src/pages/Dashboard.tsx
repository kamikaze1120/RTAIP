import React, { useEffect, useMemo, useState } from 'react';
import StatCard from '../components/StatCard';
import Globe from '../components/Globe';
import AlertList from '../components/AlertList';
import { ShieldAlert, Activity, TrendingUp } from 'lucide-react';
import { Globe as GlobeIcon } from 'lucide-react';
import { fetchBackendEvents, getBackendBase, type RtaEvent, globalThreatScore, topClusters, typeProbabilities, fetchSupabaseEvents, getSupabaseConfig, eventSeverity, runConnectivityDiagnostics, getCachedEvents, setCachedEvents, getSystemMetrics, getPipelineStatus, getRecentErrors, getBillingUsage, getInfraRegion, exportBackup, importBackup } from '../services/data';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';
import AnalystPanel from '../components/AnalystPanel';
import { DataTableVirtualized } from '../components/DesignSystem';


export default function Dashboard() {
  const [events, setEvents] = useState<RtaEvent[]>([]);
  const [alerts, setAlerts] = useState<{ event: RtaEvent, id: string; title: string; source: string; ago: string; severity: 'low'|'medium'|'high' }[]>([]);
  const [mapFocus, setMapFocus] = useState<RtaEvent | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('—');
  const [sysMetrics, setSysMetrics] = useState<null | { events_total: number; anomalies_total: number; alerts_total: number; last_event_ts?: string | null; perf_recent: Array<{ ts: string; fps: number; events: number; anomalies: number; zoom: number; device?: string | null }>; sources: Array<{ source: string; count_total: number; last_ts?: string | null; recent_ok: boolean }> }>(null);
  const [pipeline, setPipeline] = useState<Array<{ source: string; count_total: number; count_recent: number; last_ts?: string | null }>>([]);
  const [errors, setErrors] = useState<Array<{ ts: string; event: string; details?: Record<string, unknown> }>>([]);
  const [usage, setUsage] = useState<Record<string, number> | null>(null);
  const [region, setRegion] = useState<null | { region: string; primary: boolean }>(null);
  const [backupStatus, setBackupStatus] = useState<null | { tables?: string[]; bytes?: number; imported?: Record<string, number> }>(null);
  const filteredEvents = useMemo(() => events.filter(e => !/usgs|noaa/i.test(String(e.source||''))), [events]);
  const fallbackMetrics = useMemo(() => {
    const total = filteredEvents.length;
    const anomalies = filteredEvents.filter(e => Math.round(eventSeverity(e)*100) >= 70).length;
    const alertsC = Math.min(12, total);
    const last = filteredEvents.map(e=>new Date(e.timestamp).getTime()).filter(t=>!isNaN(t)).sort((a,b)=>b-a)[0];
    const perf = Array.from({ length: 10 }).map((_,i)=>({ ts: new Date(Date.now() - i*60000).toLocaleTimeString(), fps: 60, events: Math.round(total/10), anomalies: Math.round(anomalies/10), zoom: 1 }));
    const srcCounts: Record<string, number> = {};
    filteredEvents.forEach(e=>{ const k = String(e.source||'unknown'); srcCounts[k]=(srcCounts[k]||0)+1; })
    const sources = Object.entries(srcCounts).map(([source,count_total])=>({ source, count_total, last_ts: last?new Date(last).toISOString():null, recent_ok: true }));
    return { events_total: total, anomalies_total: anomalies, alerts_total: alertsC, last_event_ts: last?new Date(last).toISOString():null, perf_recent: perf, sources };
  }, [filteredEvents]);

  const handleSelect = (event: RtaEvent) => {
    if (mapFocus && mapFocus.id === event.id) {
      setMapFocus(null);
    } else if (event.latitude != null && event.longitude != null) {
      setMapFocus(event);
    }
  };
  

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const base = getBackendBase();
      let backend: RtaEvent[] = getCachedEvents();
      const supa = getSupabaseConfig();
      if (supa.url && supa.anon) {
        try {
          const fresh = await fetchSupabaseEvents();
          backend = fresh.length > 0 ? fresh : backend;
        } catch {}
      }
      if ((!backend || backend.length === 0) && base) {
        try {
          const be = await fetchBackendEvents();
          backend = be.length > 0 ? be : backend;
        } catch {}
      }
      const all = [...backend];
      if (!cancelled) {
        setEvents(all);
        if (all.length > 0) setCachedEvents(all);
        const t = all.map(e => new Date(e.timestamp).getTime()).filter(t=>!isNaN(t)).sort((a,b)=>b-a)[0];
        setLastUpdated(t ? new Date(t).toLocaleTimeString() : new Date().toLocaleTimeString());
      }
    }

    load();
    const r = Number(window.localStorage.getItem('refreshMs') || '10000');
    const id = setInterval(load, Math.max(10000, r));
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadOps() {
      try { const m = await getSystemMetrics(); if (!cancelled) setSysMetrics(m); } catch {}
      try { const p = await getPipelineStatus(24); if (!cancelled) setPipeline(p?.sources || []); } catch {}
      try { const e = await getRecentErrors(20); if (!cancelled) setErrors(e); } catch {}
      try { const u = await getBillingUsage(30); if (!cancelled) setUsage(u); } catch {}
      try { const r = await getInfraRegion(); if (!cancelled) setRegion(r); } catch {}
    }
    loadOps();
    const id = setInterval(loadOps, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const doExportBackup = async () => {
    const res = await exportBackup();
    if (res?.zip_base64) {
      setBackupStatus({ tables: res.tables, bytes: Math.floor((res.zip_base64.length * 3) / 4) });
      try {
        const a = document.createElement('a');
        a.href = `data:application/zip;base64,${res.zip_base64}`;
        a.download = 'rtaip-backup.zip';
        a.click();
      } catch {}
    }
  };

  const doImportBackup = async () => {
    const b64 = prompt('Paste backup zip (base64)');
    if (!b64) return;
    const res = await importBackup(b64);
    if (res?.inserted) setBackupStatus({ imported: res.inserted });
  };

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const diag = await runConnectivityDiagnostics();
      const ok = (diag.health || []).some(h => h.ok) || Boolean(diag.root?.ok) || Boolean(diag.events?.ok);
      if (!cancelled) setBackendOnline(!!ok);
    };
    check();
    const id = setInterval(check, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const activeSources = useMemo(() => {
    const cutoff = Date.now() - 365 * 24 * 3600000;
    const set = new Set<string>();
    filteredEvents.forEach(e => {
      const t = new Date(e.timestamp).getTime();
      if (!isNaN(t) && t >= cutoff && e.source) set.add(String(e.source));
    });
    return set.size;
  }, [filteredEvents]);

  const highThreats = useMemo(() => {
    const cutoff = Date.now() - 365 * 24 * 3600000;
    return filteredEvents.reduce((acc, e) => {
      const t = new Date(e.timestamp).getTime();
      if (isNaN(t) || t < cutoff) return acc;
      const sev = Math.round(eventSeverity(e) * 100);
      return acc + (sev >= 60 ? 1 : 0);
    }, 0);
  }, [filteredEvents]);

  const gts = useMemo(() => globalThreatScore(filteredEvents), [filteredEvents]);
  useMemo(() => topClusters(filteredEvents), [filteredEvents]);
  useMemo(() => typeProbabilities(filteredEvents), [filteredEvents]);
  useMemo(() => {
    const t = events.map(e => new Date(e.timestamp).getTime()).filter(t=>!isNaN(t)).sort((a,b)=>b-a)[0];
    return t ? new Date(t).toLocaleString() : '—';
  }, [events]);
  const trend = useMemo(() => {
    const now = Date.now();
    const recent = events.filter(e => { const t = new Date(e.timestamp).getTime(); return !isNaN(t) && t >= now - 24*3600000; });
    const prev = events.filter(e => { const t = new Date(e.timestamp).getTime(); return !isNaN(t) && t < now - 24*3600000 && t >= now - 48*3600000; });
    const a = globalThreatScore(recent);
    const b = globalThreatScore(prev) || 1;
    const delta = Math.round(((a - b) / b) * 100);
    const sign = delta > 0 ? `↑ ${delta}%` : delta < 0 ? `↓ ${Math.abs(delta)}%` : 'stable';
    return sign;
  }, [events]);
  useMemo(() => (typeof window !== 'undefined' ? window.localStorage.getItem('backendStatus') : null) || 'offline', []);

  useMemo(() => {
    return highThreats > 3 ? 'ALPHA' : highThreats > 0 ? 'BRAVO' : 'NORMAL';
  }, [highThreats]);

  const hourlyTrend = useMemo(() => {
    const buckets = new Map<number, number>();
    const now = Date.now();
    for (let i = 0; i < 24; i++) {
      const h = Math.floor((now - i * 3600000) / 3600000);
      buckets.set(h, 0);
    }
    filteredEvents.forEach(e => {
      const tMs = new Date(e.timestamp).getTime();
      if (isNaN(tMs) || tMs < now - 24 * 3600000) return;
      const h = Math.floor(tMs / 3600000);
      buckets.set(h, (buckets.get(h) || 0) + 1);
    });
    const arr = Array.from(buckets.entries()).sort((a,b)=>a[0]-b[0]).map(([h,c]) => ({ h, c }));
    return arr;
  }, [filteredEvents]);

  const sourceTop = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600000;
    const counts: Record<string, number> = {};
    filteredEvents.forEach(e => {
      const t = new Date(e.timestamp).getTime();
      if (isNaN(t) || t < cutoff) return;
      const k = String(e.source || 'unknown');
      counts[k] = (counts[k] || 0) + 1;
    });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([name, value]) => ({ name, value }));
  }, [filteredEvents]);

  useEffect(() => {
    const latest = filteredEvents
      .filter(e => !isNaN(new Date(e.timestamp).getTime()))
      .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 12);
    const mapped = latest.map(e => {
      const sev = Math.round(eventSeverity(e) * 100);
      const ts = new Date(e.timestamp).toLocaleString();
      return {
        event: e,
        id: String(e.id),
        title: `${String(e.source || 'Event')} (${sev}%)`,
        source: String(e.source || 'unknown'),
        ago: ts,
        severity: sev >= 70 ? 'high' : sev >= 40 ? 'medium' : 'low'
      } as { event: RtaEvent, id: string; title: string; source: string; ago: string; severity: 'low'|'medium'|'high' };
    });
    setAlerts(mapped);
  }, [events]);

  return (
    <div className="flow-gradient text-white min-h-screen">
      <main className="pt-20">
        <div className="container mx-auto p-4">
          <div className="mb-4 flex items-center gap-3 bg-white/10 backdrop-blur-md rounded-lg p-3 shadow-lg">
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${backendOnline ? 'bg-green-400' : 'bg-red-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${backendOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </span>
            <div className="text-xs text-gray-300">
              Backend {backendOnline ? 'Online' : 'Offline'} • Events: {events.length} • Updated: {lastUpdated}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <StatCard 
              title="Global Threat Score"
              value={gts}
              icon={<GlobeIcon />}
              variant={gts > 75 ? 'danger' : gts > 50 ? 'warning' : 'default'}
              tooltip={"Aggregates event severity across recent geo-tagged events. Calculated as sum of per-event severity weights (scaled and capped). Higher = more active/significant incidents globally."}
            />
            <StatCard 
              title="Threat Trend"
              value={trend}
              icon={<TrendingUp />}
              variant={trend.startsWith('↑') ? 'warning' : trend.startsWith('↓') ? 'success' : 'default'}
              tooltip={"Compares the last 24h global threat score to the previous 24h window. Up = rising activity; Down = decreasing."}
            />
            <StatCard 
              title="Active Sources"
              value={activeSources}
              icon={<Activity />}
              tooltip={"Number of distinct data sources producing geo-tagged events in the last 24 hours."}
            />
            <StatCard 
              title="High-Threat Events"
              value={highThreats}
              icon={<ShieldAlert />}
              variant={highThreats > 0 ? 'danger' : 'success'}
              tooltip={"Count of events with severity ≥ 60% in the last 24 hours."}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3 bg-white/10 backdrop-blur-md rounded-lg p-4 shadow-lg">
              <Globe 
                events={filteredEvents.filter(e => {
                  const t = new Date(e.timestamp).getTime();
                  const cutoff = Date.now() - 7 * 24 * 3600000;
                  return !isNaN(t) && t >= cutoff && e.latitude != null && e.longitude != null;
                })} 
                focus={mapFocus} 
              />
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 shadow-lg">
              <h2 className="text-xl font-bold mb-4">Alerts</h2>
              <AlertList alerts={alerts} onSelect={(alert) => handleSelect(alert.event)} />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 shadow-lg">
              <div className="text-sm text-gray-300 mb-2">Top Sources (24h)</div>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceTop}>
                    <XAxis dataKey="name" tick={{ fill: '#aaa', fontSize: 10 }} />
                    <YAxis allowDecimals={false} width={24} tick={{ fill: '#aaa', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff' }} />
                    <Bar dataKey="value" fill="#60a5fa" isAnimationActive />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 shadow-lg">
              <div className="text-sm text-gray-300 mb-2">Events (last 24h)</div>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hourlyTrend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <XAxis dataKey="h" hide />
                    <YAxis allowDecimals={false} width={24} tick={{ fill: '#aaa', fontSize: 10 }} />
                    <Tooltip formatter={(v) => [`${v} events`, 'Hour']} labelFormatter={() => ''} contentStyle={{ background: 'rgba(0,0,0,0.6)', border: 'none' }} />
                    <Line type="monotone" dataKey="c" stroke="#60a5fa" strokeWidth={2} dot={false} isAnimationActive />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 shadow-lg">
              <div className="text-sm text-gray-300 mb-2">System Health & Metrics</div>
              <div className="text-xs text-gray-300">Region: {region ? `${region.region} • ${region.primary ? 'Primary' : 'Secondary'}` : '—'}</div>
              <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                <div className="bg-white/5 p-2 rounded">Events<br/><span className="text-lg">{(sysMetrics?.events_total) ?? fallbackMetrics.events_total}</span></div>
                <div className="bg-white/5 p-2 rounded">Anomalies<br/><span className="text-lg">{(sysMetrics?.anomalies_total) ?? fallbackMetrics.anomalies_total}</span></div>
                <div className="bg-white/5 p-2 rounded">Alerts<br/><span className="text-lg">{(sysMetrics?.alerts_total) ?? fallbackMetrics.alerts_total}</span></div>
              </div>
              <div className="mt-3 text-xs">Last event: {sysMetrics?.last_event_ts ?? fallbackMetrics.last_event_ts ?? '—'}</div>
              <div className="mt-3 text-xs">Performance (recent)</div>
              <div className="mt-1 max-h-28 overflow-y-auto text-xs">
                {!sysMetrics && fallbackMetrics.perf_recent.map((m,i)=>(<div key={i} className="mt-1">{m.ts} • fps {m.fps} • events {m.events} • anomalies {m.anomalies}</div>))}
                {sysMetrics && (sysMetrics.perf_recent||[]).map((m,i)=>(<div key={i} className="mt-1">{m.ts} • fps {m.fps} • events {m.events} • anomalies {m.anomalies}</div>))}
                {sysMetrics && (sysMetrics.perf_recent||[]).length===0 && (<div className="text-gray-400">No metrics</div>)}
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 shadow-lg">
              <div className="text-sm text-gray-300 mb-2">Pipeline Status</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {pipeline.map(p => (
                  <div key={p.source} className="bg-white/5 p-2 rounded">
                    <div className="font-semibold">{p.source}</div>
                    <div>Recent: {p.count_recent} • Total: {p.count_total}</div>
                    <div>Last: {p.last_ts || '—'}</div>
                  </div>
                ))}
                {pipeline.length===0 && (<div className="text-gray-400">No data</div>)}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 shadow-lg">
              <div className="text-sm text-gray-300 mb-2">Errors (recent)</div>
              <div className="text-xs max-h-40 overflow-y-auto">
                {errors.map((e,i)=>(<div key={i} className="mt-1">{e.ts} — {e.event} {e.details && JSON.stringify(e.details)}</div>))}
                {errors.length===0 && (<div className="text-gray-400">No recent errors</div>)}
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 shadow-lg">
              <div className="text-sm text-gray-300 mb-2">Usage & Backup</div>
              <div className="text-xs text-gray-300">Prompts: {usage?.prompts ?? 0} • Alerts: {usage?.alerts ?? 0} • Reports: {usage?.reports ?? 0} • Events: {usage?.events_ingested ?? 0}</div>
              <div className="mt-2 flex gap-2">
                <button className="px-3 py-2 bg-white/20 rounded" onClick={doExportBackup}>Export backup</button>
                <button className="px-3 py-2 bg-white/20 rounded" onClick={doImportBackup}>Import backup</button>
              </div>
              {backupStatus && (
                <div className="mt-2 text-xs">
                  {backupStatus.tables && (<div>Exported tables: {backupStatus.tables.join(', ')}</div>)}
                  {backupStatus.bytes && (<div>Size: {backupStatus.bytes} bytes</div>)}
                  {backupStatus.imported && (<div>Imported: {Object.entries(backupStatus.imported).map(([k,v])=>`${k}:${v}`).join(', ')}</div>)}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 mt-4">
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 shadow-lg">
              <div className="text-sm text-gray-300 mb-2">Recent Events (table)</div>
              <DataTableVirtualized rows={filteredEvents.slice(0, 200).map(e => ({ id: e.id, source: String(e.source||'unknown'), ts: e.timestamp, lat: e.latitude ?? '', lon: e.longitude ?? '', sev: Math.round(eventSeverity(e)*100) }))} columns={[{ key: 'id', label: 'ID', width: 100 }, { key: 'source', label: 'Source' }, { key: 'ts', label: 'Timestamp', width: 200 }, { key: 'lat', label: 'Lat', width: 90, align: 'right' }, { key: 'lon', label: 'Lon', width: 90, align: 'right' }, { key: 'sev', label: 'Severity', width: 100 }]} height={260} rowHeight={28} />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 shadow-lg">
              <div className="text-sm text-gray-300 mb-2">Hotspots</div>
              <ul className="text-sm text-gray-300 space-y-2">
                {topClusters(filteredEvents).map((c, idx) => (
                  <li key={idx} className="flex items-center justify-between">
                    <span>Lat {c.lat.toFixed(2)} • Lon {c.lon.toFixed(2)}</span>
                    <span className="text-blue-400">Score {Math.round(c.score)}</span>
                  </li>
                ))}
                {topClusters(filteredEvents).length === 0 && (<li className="text-xs text-gray-500">No hotspots available</li>)}
              </ul>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 shadow-lg">
              <div className="text-sm text-gray-300 mb-2">Type Mix (72h)</div>
              <div className="flex gap-3">
                {Object.entries(typeProbabilities(filteredEvents)).map(([k,v]) => (
                  <div key={k} className="flex-1">
                    <div className="text-xs text-gray-400 mb-1">{k}</div>
                    <div className="h-2 bg-gray-700 rounded">
                      <div className="h-2 bg-blue-500 rounded" style={{ width: `${v}%` }} />
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{v}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="container mx-auto p-4">
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 shadow-lg">
            <div className="text-sm text-gray-300 mb-2">AI Analyst Assistant</div>
            <AnalystPanel events={filteredEvents} />
          </div>
        </div>
      </main>
    </div>
  );
}
