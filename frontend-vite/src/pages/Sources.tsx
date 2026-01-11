import React, { useEffect, useState, useMemo } from 'react';
import { type RtaEvent, fetchSupabaseEvents, getSupabaseConfig, fetchGDACS, fetchBackendEvents, getBackendBase } from '../services/data';
import StatCard from '../components/StatCard';
import { Database, Satellite, CloudDrizzle, Users, Shield, Building } from 'lucide-react';
import AlertList from '../components/AlertList';
import { NewHeader } from '../components/NewHeader';

type SourceStat = { label: string; count: number; subtitle?: string; icon: React.ReactNode; variant?: 'default'|'warning'|'danger'|'success' };

const newSources: SourceStat[] = [
  { label: 'ODIN', count: 0, subtitle: 'Worldwide Equipment Guide', icon: <Database className="w-4 h-4" />, variant: 'success' },
  { label: 'DTIC', count: 0, subtitle: 'Defense Technical Information', icon: <Shield className="w-4 h-4" />, variant: 'success' },
  { label: 'USACE', count: 0, subtitle: 'Corps of Engineers Data', icon: <Building className="w-4 h-4" />, variant: 'success' },
  { label: 'PUB LOG', count: 0, subtitle: 'Public Logistics Data', icon: <Satellite className="w-4 h-4" />, variant: 'success' },
  { label: 'NGA Tearline', count: 0, subtitle: 'Geospatial Intelligence', icon: <Users className="w-4 h-4" />, variant: 'success' },
  { label: 'Military Periscope', count: 0, subtitle: 'Global Military Database', icon: <Shield className="w-4 h-4" />, variant: 'default' },
  { label: 'Janes', count: 0, subtitle: 'Defense & Security Intelligence', icon: <Database className="w-4 h-4" />, variant: 'default' },
  { label: 'Global Terrorism DB', count: 0, subtitle: 'Terrorism Attack Data', icon: <CloudDrizzle className="w-4 h-4" />, variant: 'danger' },
];

export default function Sources() {
  const [stats, setStats] = useState<SourceStat[]>(newSources);
  const [alerts, setAlerts] = useState<{ event: RtaEvent, id: string; title: string; source: string; ago: string; severity: 'low'|'medium'|'high' }[]>([]);
  const [events, setEvents] = useState<RtaEvent[]>([]);

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
      const [gdacs] = await Promise.all([
        fetchGDACS(fromISO, toISO),
      ]);
      const all = [...backend, ...gdacs];
      if (!cancelled) setEvents(all);
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
        // Normalize source names
        const sourceName = e.source.toLowerCase();
        for (const s of newSources) {
          if (s.label.toLowerCase() === sourceName) {
            counts.set(s.label, (counts.get(s.label) || 0) + 1);
            break;
          }
        }
      }
    });
    return counts;
  }, [events]);

  useEffect(() => {
    setStats(newSources.map(s => ({ ...s, count: sourceCounts.get(s.label) || 0 })));
  }, [sourceCounts]);

  return (
    <div className="bg-black text-white min-h-screen">
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

        <div className="mt-8">
          <AlertList alerts={alerts} onSelect={() => {}} />
        </div>

        <div className="mt-8 bg-white/10 backdrop-blur-md rounded-lg p-6 shadow-lg">
          <h2 className="text-xl font-bold text-white mb-4">Integration Notes</h2>
          <p className="text-gray-400">
            Sources now include a range of government and military public databases, providing access to unclassified defense information, geospatial intelligence, and logistics data. These channels are critical for maintaining a comprehensive operational picture.
          </p>
        </div>
      </div>
    </div>
  );
}