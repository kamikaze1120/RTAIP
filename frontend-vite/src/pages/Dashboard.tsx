import React, { useEffect, useMemo, useState } from 'react';
import StatCard from '../components/StatCard';
import MapComponent from '../components/MapComponent';
import AlertList from '../components/AlertList';
import { ShieldAlert, Activity, TrendingUp, Globe } from 'lucide-react';
import { fetchUSGSAllDay, fetchNOAAAlerts, fetchGDACS, fetchBackendEvents, getBackendBase, type RtaEvent, globalThreatScore, topClusters, typeProbabilities, fetchSupabaseEvents, getSupabaseConfig } from '../services/data';
import { NewHeader } from '../components/NewHeader';


export default function Dashboard() {
  const [events, setEvents] = useState<RtaEvent[]>([]);
  const [alerts, setAlerts] = useState<{ event: RtaEvent, id: string; title: string; source: string; ago: string; severity: 'low'|'medium'|'high' }[]>([]);
  const [mapFocus, setMapFocus] = useState<RtaEvent | null>(null);

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
      const now = new Date();
      const fromISO = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const toISO = now.toISOString();
      const base = getBackendBase();
      let backend: RtaEvent[] = [];
      const supa = getSupabaseConfig();
      if (supa.url && supa.anon) {
        try { backend = await fetchSupabaseEvents(); } catch {}
      } else if (base) {
        try { backend = await fetchBackendEvents(); } catch {}
      }
      const [usgs, noaa, gdacs] = await Promise.all([
        fetchUSGSAllDay(),
        fetchNOAAAlerts(),
        fetchGDACS(fromISO, toISO),
      ]);
      const all = [...backend, ...usgs, ...noaa, ...gdacs];
      if (!cancelled) setEvents(all);

      const genAlerts: { event: RtaEvent, id: string; title: string; source: string; ago: string; severity: 'low'|'medium'|'high' }[] = [];
      const toAgo = (ts: string) => {
        const d = new Date(ts).getTime();
        const mins = Math.max(1, Math.round((Date.now() - d) / 60000));
        return `${mins} min ago`;
      };
      usgs.slice(0, 3).forEach((e, i) => {
        const mag = (e.data as { mag?: number })?.mag || 0;
        const sev = mag >= 5 ? 'high' : mag >= 3 ? 'medium' : 'low';
        genAlerts.push({ event: e, id: `u-${i}`, title: `Seismic ${mag != null ? `M${mag}` : 'activity'} detected`, source: 'USGS', ago: toAgo(e.timestamp), severity: sev });
      });
      noaa.slice(0, 2).forEach((e, i) => {
        const ev = (e.data as { event?: string })?.event || 'Weather alert';
        const sev = /warning|watch/i.test(String(ev)) ? 'medium' : 'low';
        genAlerts.push({ event: e, id: `n-${i}`, title: ev, source: 'NOAA', ago: toAgo(e.timestamp), severity: sev });
      });
      if (!cancelled) setAlerts(genAlerts);
    }

    load();
    const r = Number(window.localStorage.getItem('refreshMs') || '60000');
    const id = setInterval(load, Math.max(30000, r));
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const activeSources = useMemo(() => {
    const by = new Set<string>();
    events.forEach(e => { if (e.source) by.add(e.source); });
    return by.size;
  }, [events]);

  const highThreats = useMemo(() => {
    return events.reduce((acc, e) => {
      const src = String(e.source || '').toLowerCase();
      if (src === 'usgs_seismic') {
        const mag = (e.data as { mag?: number })?.mag || 0;
        if (mag >= 5) return acc + 1;
      }
      if (src === 'noaa_weather') {
        const ev = (e.data as { event?: string })?.event || '';
        if (/warning/i.test(String(ev))) return acc + 1;
      }
      return acc;
    }, 0);
  }, [events]);

  const gts = useMemo(() => globalThreatScore(events), [events]);
  useMemo(() => topClusters(events), [events]);
  useMemo(() => typeProbabilities(events), [events]);
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

  return (
    <div className="bg-black text-white min-h-screen">
      <NewHeader />
      <main className="pt-20">
        <div className="container mx-auto p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <StatCard 
              title="Global Threat Score"
              value={gts}
              icon={<Globe />}
              variant={gts > 75 ? 'danger' : gts > 50 ? 'warning' : 'default'}
            />
            <StatCard 
              title="Threat Trend"
              value={trend}
              icon={<TrendingUp />}
              variant={trend.startsWith('↑') ? 'warning' : trend.startsWith('↓') ? 'success' : 'default'}
            />
            <StatCard 
              title="Active Sources"
              value={activeSources}
              icon={<Activity />}
            />
            <StatCard 
              title="High-Threat Events"
              value={highThreats}
              icon={<ShieldAlert />}
              variant={highThreats > 0 ? 'danger' : 'success'}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3 bg-white/10 backdrop-blur-md rounded-lg p-4 shadow-lg">
              <MapComponent 
                events={events.filter(e => {
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
        </div>
      </main>
    </div>
  );
}
