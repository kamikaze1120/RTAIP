import React, { useEffect, useState } from 'react';
import StatCard from '../components/StatCard';
import { Database, Satellite, ShieldAlert, Hospital, Landmark, CloudDrizzle } from 'lucide-react';
import { fetchUSGSAllDay, fetchNOAAAlerts, fetchGDACS, fetchFEMA, fetchHIFLDHospitals, fetchCensusCounties } from '../services/data';

type SourceStat = { label: string; count: number; subtitle?: string; icon: React.ReactNode; variant?: 'default'|'warning'|'danger'|'success' };

export default function Sources() {
  const [stats, setStats] = useState<SourceStat[]>([]);

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
      if (cancelled) return;
      const items: SourceStat[] = [
        { label: 'USGS Seismic', count: usgs.length, subtitle: 'Earthquake feed (24h)', icon: <Database className="w-4 h-4" />, variant: 'warning' },
        { label: 'NOAA Weather', count: noaa.length, subtitle: 'Active alerts', icon: <CloudDrizzle className="w-4 h-4" />, variant: 'success' },
        { label: 'GDACS Disasters', count: gdacs.length, subtitle: 'Global disaster events', icon: <Satellite className="w-4 h-4" />, variant: 'danger' },
        { label: 'FEMA Declarations', count: fema.length, subtitle: 'US incidents', icon: <ShieldAlert className="w-4 h-4" />, variant: 'warning' },
        { label: 'HIFLD Infrastructure', count: hifld.length, subtitle: 'Hospitals', icon: <Hospital className="w-4 h-4" />, variant: 'default' },
        { label: 'Census Counties', count: census.length, subtitle: 'Population geography', icon: <Landmark className="w-4 h-4" />, variant: 'default' },
      ];
      setStats(items);
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
        {stats.map((s) => (
          <StatCard key={s.label} title={s.label} value={s.count} subtitle={s.subtitle} icon={s.icon} variant={s.variant}
          />
        ))}
      </div>

      <div className="clip-corner border border-primary/20 p-4">
        <div className="text-sm text-primary tracking-widest uppercase">Integration Notes</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Sources include seismic, weather, disaster management, critical infrastructure, and population datasets. These channels feed the map, timeline, and analyst brief to maintain situational awareness.
        </div>
      </div>
    </div>
  );
}