import React, { useEffect, useMemo, useState } from 'react';
import StatCard from '../components/StatCard';
import { Database, Satellite, CloudDrizzle, Users } from 'lucide-react';
import { fetchUSGSAllDay, fetchNOAAAlerts, fetchGDACS, fetchGlobalPopulationByContinent } from '../services/data';
import AlertList from '../components/AlertList';

type SourceStat = { label: string; count: number; subtitle?: string; icon: React.ReactNode; variant?: 'default'|'warning'|'danger'|'success' };

export default function Sources() {
  const [stats, setStats] = useState<SourceStat[]>([
    { label: 'USGS Seismic', count: 0, subtitle: 'Fetching...', icon: <Database className="w-4 h-4" />, variant: 'warning' },
    { label: 'NOAA Weather', count: 0, subtitle: 'Fetching...', icon: <CloudDrizzle className="w-4 h-4" />, variant: 'success' },
    { label: 'GDACS Disasters', count: 0, subtitle: 'Fetching...', icon: <Satellite className="w-4 h-4" />, variant: 'danger' },
    { label: 'Global Population', count: 0, subtitle: 'Fetching...', icon: <Users className="w-4 h-4" />, variant: 'default' },
  ]);
  const [alerts, setAlerts] = useState<{ id: string; title: string; source: string; ago: string; severity: 'low'|'medium'|'high' }[]>([]);
  const [popHover, setPopHover] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const now = new Date();
      const fromISO = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const toISO = now.toISOString();
      const [usgs, noaa, gdacs, pop] = await Promise.all([
        fetchUSGSAllDay(),
        fetchNOAAAlerts(),
        fetchGDACS(fromISO, toISO),
        fetchGlobalPopulationByContinent(),
      ]);
      if (cancelled) return;
      const fmtB = (n: number) => `${(n / 1_000_000_000).toFixed(2)}B`;
      const items: SourceStat[] = [
        { label: 'USGS Seismic', count: usgs.length, subtitle: 'Earthquake feed (24h)', icon: <Database className="w-4 h-4" />, variant: 'warning' },
        { label: 'NOAA Weather', count: noaa.length, subtitle: 'Active alerts', icon: <CloudDrizzle className="w-4 h-4" />, variant: 'success' },
        { label: 'GDACS Disasters', count: gdacs.length, subtitle: 'Global disaster events', icon: <Satellite className="w-4 h-4" />, variant: 'danger' },
        { label: 'Global Population', count: pop.total, subtitle: 'Hover for continent breakdown', icon: <Users className="w-4 h-4" />, variant: 'default' },
      ];
      const breakdown = pop && pop.continents ? [
        `Africa ${fmtB(pop.continents['Africa']||0)}`,
        `Asia ${fmtB(pop.continents['Asia']||0)}`,
        `Europe ${fmtB(pop.continents['Europe']||0)}`,
        `North America ${fmtB(pop.continents['North America']||0)}`,
        `South America ${fmtB(pop.continents['South America']||0)}`,
        `Oceania ${fmtB(pop.continents['Oceania']||0)}`,
        `Antarctica ${fmtB(pop.continents['Antarctica']||0)}`,
      ].join(' • ') : '';
      setPopHover(breakdown);
      setStats(items);

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
      setAlerts(genAlerts);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="px-6 pt-20 space-y-6">
      <div className="space-y-1">
        <div className="text-xs tracking-widest text-muted-foreground uppercase">Data Sources</div>
        <div className="text-4xl font-bold">Sources <span className="text-primary">Registry</span></div>
        <div className="text-sm text-muted-foreground">All inbound channels and datasets. Each source is synchronized and monitored for anomalies.</div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {stats.slice(0,3).map((s) => (
          <StatCard key={s.label} title={s.label} value={s.count} subtitle={s.subtitle} icon={s.icon} variant={s.variant} />
        ))}
        <div className="md:col-span-3" title={popHover}>
          <StatCard title={stats[3].label} value={(stats[3].count as number).toLocaleString()} subtitle={stats[3].subtitle} icon={stats[3].icon} variant={stats[3].variant} align="center" />
        </div>
      </div>

      <div className="clip-corner border border-primary/20">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-primary tracking-widest uppercase">Alert Channel</div>
          <div className="text-xs text-muted-foreground">{alerts.length} active</div>
        </div>
        <div className="px-2 pb-3">
          {alerts.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No alerts yet.</div>
          ) : (
            <AlertList alerts={alerts} />
          )}
        </div>
      </div>

      <div className="clip-corner border border-primary/20 p-4">
        <div className="text-sm text-primary tracking-widest uppercase">Integration Notes</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Sources include seismic, weather, and global population datasets. These channels feed the map, timeline, and analyst brief to maintain situational awareness.
        </div>
      </div>
    </div>
  );
}