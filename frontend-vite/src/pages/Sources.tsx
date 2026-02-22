import React, { useEffect, useState, useMemo } from 'react';
import { type RtaEvent, fetchSupabaseEvents, getSupabaseConfig, fetchBackendEvents, getBackendBase, getCachedEvents, setCachedEvents } from '../services/data';
import StatCard from '../components/StatCard';
import { Database, Satellite, CloudDrizzle, Users, Shield, Radio } from 'lucide-react';
 
import { NewHeader } from '../components/NewHeader';

type SourceStat = { label: string; count: number; subtitle?: string; icon: React.ReactNode; variant?: 'default'|'warning'|'danger'|'success' };

const newSources: SourceStat[] = [
  { label: 'NASA EONET', count: 0, subtitle: 'NASA event tracker', icon: <Satellite className="w-4 h-4" />, variant: 'success' },
  { label: 'NOAA Alerts', count: 0, subtitle: 'NWS active alerts', icon: <CloudDrizzle className="w-4 h-4" />, variant: 'success' },
  { label: 'ADS-B OpenSky', count: 0, subtitle: 'Aircraft telemetry', icon: <Users className="w-4 h-4" />, variant: 'default' },
  { label: 'AIS Maritime', count: 0, subtitle: 'Ship positions', icon: <Database className="w-4 h-4" />, variant: 'default' },
  { label: 'USGS Earthquakes', count: 0, subtitle: 'Seismic activity', icon: <Shield className="w-4 h-4" />, variant: 'success' },
  { label: 'Public Radio', count: 0, subtitle: 'Radio/spectrum signals', icon: <Radio className="w-4 h-4" />, variant: 'default' },
  { label: 'Reddit Intel', count: 0, subtitle: 'Keyword signals', icon: <Database className="w-4 h-4" />, variant: 'warning' },
];

export default function Sources() {
  const [stats, setStats] = useState<SourceStat[]>(newSources);
  const [events, setEvents] = useState<RtaEvent[]>([]);
  const enabledMap = useMemo(() => {
    try {
      const s = typeof window !== 'undefined' ? window.localStorage.getItem('sources') : null;
      return s ? (JSON.parse(s) as Record<string, boolean>) : {};
    } catch { return {}; }
  }, []);

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
      }
    }

    load();
    const r = Number(window.localStorage.getItem('refreshMs') || '60000');
    const id = setInterval(load, Math.max(30000, r));
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    newSources.forEach(s => counts.set(s.label, 0));
    events.forEach(e => {
      if (e.source) {
        const sourceName = e.source.toLowerCase();
        for (const s of newSources) {
          if (sourceName.includes(s.label.toLowerCase())) {
            counts.set(s.label, (counts.get(s.label) || 0) + 1);
            break;
          }
        }
      }
    });
    return counts;
  }, [events]);

  useEffect(() => {
    const filtered = newSources.filter(s => enabledMap[s.label] !== false);
    setStats(filtered.map(s => ({ ...s, count: sourceCounts.get(s.label) || 0 })));
  }, [sourceCounts, enabledMap]);

  return (
    <div className="flow-gradient text-white min-h-screen">
      <NewHeader />
      <div className="p-4 lg:p-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold">Data Sources</h1>
          <p className="text-gray-400">Live monitoring of integrated data sources and new alerts.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((s) => (
            <StatCard key={s.label} title={s.label} value={s.count} subtitle={s.subtitle} icon={s.icon} variant={s.variant} />
          ))}
        </div>

        

        <div className="mt-8 bg-white/10 backdrop-blur-md rounded-lg p-6 shadow-lg">
          <h2 className="text-xl font-bold text-white mb-4">Integration Notes</h2>
          <div className="text-gray-300 text-sm">Run free data ingestors now:</div>
          <div className="mt-2 flex gap-2">
            <button className="px-3 py-2 bg-white/10 rounded" onClick={async()=>{ const b = getBackendBase(); if (!b) { alert('Backend URL not configured'); return; } try { await fetch(`${b.replace(/\/$/, '')}/connectors/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); alert('Ingestion started. Refresh in ~30s.'); } catch { alert('Failed to trigger ingestion'); } }}>Run All</button>
          </div>
          <p className="text-gray-400 mt-4">
            Connectors use only free/public endpoints: NASA EONET, NOAA NWS alerts, OpenSky ADS-B, AIS stream, USGS earthquakes, public radio directory, and Reddit keyword signals.
          </p>
        </div>
      </div>
    </div>
  );
}