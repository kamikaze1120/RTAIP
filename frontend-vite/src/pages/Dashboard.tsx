import React, { useEffect, useMemo, useState } from 'react';
import StatCard from '../components/StatCard';
import TacticalGrid from '../components/TacticalGrid';
import MapComponent from '../components/MapComponent';
import AlertList from '../components/AlertList';
import SystemStats from '../components/SystemStats';
import { Database, Users, ShieldAlert, Shield } from 'lucide-react';
import { fetchUSGSAllDay, fetchNOAAAlerts, fetchGDACS, fetchBackendEvents, getBackendBase, type RtaEvent, globalThreatScore, topClusters, typeProbabilities, fetchSupabaseEvents, getSupabaseConfig } from '../services/data';
import CommanderPanel from '../components/CommanderPanel';
import ISRAssetsPanel from '../components/ISRAssetsPanel';
import COAComparePanel from '../components/COAComparePanel';
import ReadinessPanel from '../components/ReadinessPanel';

export default function Dashboard() {
  const [events, setEvents] = useState<RtaEvent[]>([]);
  const [alerts, setAlerts] = useState<{ id: string; title: string; source: string; ago: string; severity: 'low'|'medium'|'high' }[]>([]);
  const stats = useMemo(() => ([
    { label: 'CPU load', value: 34 },
    { label: 'Memory', value: 67 },
    { label: 'Network', value: 61, color: 'hsl(35 100% 50% / 0.8)' },
    { label: 'Security', value: 22, color: 'hsl(0 85% 55% / 0.8)' },
    { label: 'Power', value: 12 },
  ]), []);

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

      const genAlerts: { id: string; title: string; source: string; ago: string; severity: 'low'|'medium'|'high' }[] = [];
      const toAgo = (ts: string) => {
        const d = new Date(ts).getTime();
        const mins = Math.max(1, Math.round((Date.now() - d) / 60000));
        return `${mins} min ago`;
      };
      usgs.slice(0, 3).forEach((e, i) => {
        const mag = (e.data as any)?.mag;
        const sev = mag >= 5 ? 'high' : mag >= 3 ? 'medium' : 'low';
        genAlerts.push({ id: `u-${i}`, title: `Seismic ${mag != null ? `M${mag}` : 'activity'} detected`, source: 'USGS', ago: toAgo(e.timestamp), severity: sev });
      });
      noaa.slice(0, 2).forEach((e, i) => {
        const ev = (e.data as any)?.event || 'Weather alert';
        const sev = /warning|watch/i.test(String(ev)) ? 'medium' : 'low';
        genAlerts.push({ id: `n-${i}`, title: ev, source: 'NOAA', ago: toAgo(e.timestamp), severity: sev });
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
        const mag = (e.data as any)?.mag;
        if (mag >= 5) return acc + 1;
      }
      if (src === 'noaa_weather') {
        const ev = (e.data as any)?.event || '';
        if (/warning/i.test(String(ev))) return acc + 1;
      }
      return acc;
    }, 0);
  }, [events]);

  const gts = useMemo(() => globalThreatScore(events), [events]);
  const clusters = useMemo(() => topClusters(events), [events]);
  const probs = useMemo(() => typeProbabilities(events), [events]);
  const lastUpdated = useMemo(() => {
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
  const backendStatus = useMemo(() => (typeof window !== 'undefined' ? window.localStorage.getItem('backendStatus') : null) || 'offline', []);

  const securityLevel = useMemo(() => {
    return highThreats > 3 ? 'ALPHA' : highThreats > 0 ? 'BRAVO' : 'NORMAL';
  }, [highThreats]);

  return (
    <div className="px-6 pt-20 space-y-6">
      <div className="space-y-1">
        <div className="text-xs tracking-widest text-muted-foreground uppercase">Real-Time Tactical Analysis Intelligence Platform</div>
        <div className="text-4xl font-bold">Command <span className="text-primary">Center</span></div>
        <div className="text-sm text-muted-foreground">{backendStatus==='offline'?'Data may be degraded. Confidence reduced.':'Advanced situational awareness and threat monitoring.'}</div>
        <div className="text-[11px] text-muted-foreground">Last updated: {lastUpdated}</div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <StatCard title="Global Threat Score" value={gts} subtitle={`${gts>700?'CRITICAL':gts>450?'HIGH':gts>250?'ELEVATED':'LOW'} • ${trend}`} icon={<ShieldAlert className="w-4 h-4" />} variant={gts>700?'danger':gts>450?'warning':'default'} />
        <StatCard title="Active Sources" value={activeSources} subtitle="Synced" icon={<Database className="w-4 h-4" />} />
        <StatCard title="Events Processed" value={events.length} subtitle="Last 7 days" icon={<Users className="w-4 h-4" />} />
        <StatCard title="Security Level" value={securityLevel} subtitle={securityLevel==='ALPHA'?'Elevated':'Nominal'} icon={<Shield className="w-4 h-4" />} variant={securityLevel==='ALPHA'?'danger':'default'} />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div>
          <div className="text-sm text-primary tracking-widest uppercase mb-2">Tactical Overview</div>
          <div className="clip-corner border border-primary/20 bg-secondary">
            <MapComponent events={events.filter(e => {
              const t = new Date(e.timestamp).getTime();
              const cutoff = Date.now() - 7 * 24 * 3600000;
              return !isNaN(t) && t >= cutoff && e.latitude != null && e.longitude != null;
            })} showPredictions={false} onSelect={() => {}} />
          </div>
        </div>
        <div className="space-y-4">
          <AlertList alerts={alerts} />
          <SystemStats stats={stats} />
          <div className="clip-corner border border-primary/20 p-3">
            <div className="text-xs text-primary tracking-widest uppercase mb-2">Top Emerging Threat Clusters</div>
            <ul className="text-xs space-y-1">
              {clusters.map((c, i) => (
                <li key={i} className="flex items-center justify-between"><span>({c.lat.toFixed(2)}, {c.lon.toFixed(2)})</span><span className="text-muted-foreground">score {Math.round(c.score*100)}</span></li>
              ))}
            </ul>
            <div className="mt-3 text-xs text-muted-foreground">Type probabilities (72h): weather {probs.weather||0}% • seismic {probs.seismic||0}% • disaster {probs.disaster||0}%</div>
          </div>
          <CommanderPanel events={events} />
          <ISRAssetsPanel />
          <COAComparePanel />
          <ReadinessPanel events={events} />
        </div>
      </div>
    </div>
  );
}