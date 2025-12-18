import React, { useEffect, useMemo, useState } from 'react';
import StatCard from '../components/StatCard';
import TacticalGrid from '../components/TacticalGrid';
import AlertList from '../components/AlertList';
import SystemStats from '../components/SystemStats';
import { Database, Users, ShieldAlert, Shield } from 'lucide-react';
import { fetchUSGSAllDay, fetchNOAAAlerts, fetchGDACS, fetchFEMA, fetchHIFLDHospitals, fetchCensusCounties, type RtaEvent } from '../services/data';

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
    (async () => {
      const now = new Date();
      const fromISO = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const toISO = now.toISOString();
      const [usgs, noaa, gdacs, fema, hifld, census] = await Promise.all([
        fetchUSGSAllDay(),
        fetchNOAAAlerts(),
        fetchGDACS(fromISO, toISO),
        fetchFEMA(),
        fetchHIFLDHospitals(),
        fetchCensusCounties(),
      ]);
      const all = [...usgs, ...noaa, ...gdacs, ...fema, ...hifld, ...census];
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
    })();
    return () => { cancelled = true; };
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

  const securityLevel = useMemo(() => {
    return highThreats > 3 ? 'ALPHA' : highThreats > 0 ? 'BRAVO' : 'NORMAL';
  }, [highThreats]);

  return (
    <div className="px-6 pt-20 space-y-6">
      <div className="space-y-1">
        <div className="text-xs tracking-widest text-muted-foreground uppercase">Real-Time Tactical Analysis Intelligence Platform</div>
        <div className="text-4xl font-bold">Command <span className="text-primary">Center</span></div>
        <div className="text-sm text-muted-foreground">Advanced situational awareness and threat monitoring. All systems synchronized and operational.</div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <StatCard title="Active Sources" value={activeSources} subtitle="Synced" icon={<Database className="w-4 h-4" />} />
        <StatCard title="Personnel" value={47} subtitle="All units deployed" icon={<Users className="w-4 h-4" />} />
        <StatCard title="Active Threats" value={highThreats} subtitle="Under monitoring" icon={<ShieldAlert className="w-4 h-4" />} variant="warning" />
        <StatCard title="Security Level" value={securityLevel} subtitle={securityLevel==='ALPHA'?'Elevated':'Nominal'} icon={<Shield className="w-4 h-4" />} variant={securityLevel==='ALPHA'?'danger':'default'} />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div>
          <div className="text-sm text-primary tracking-widest uppercase mb-2">Tactical Overview</div>
          <TacticalGrid />
        </div>
        <div className="space-y-4">
          <AlertList alerts={alerts} />
          <SystemStats stats={stats} />
        </div>
      </div>
    </div>
  );
}