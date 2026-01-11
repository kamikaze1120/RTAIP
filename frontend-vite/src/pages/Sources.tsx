import React, { useEffect, useMemo, useState } from 'react';
import StatCard from '../components/StatCard';
import { Database, Satellite, CloudDrizzle, Users, Shield, Building } from 'lucide-react';
import AlertList from '../components/AlertList';

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
  const [alerts, setAlerts] = useState<{ id: string; title: string; source: string; ago: string; severity: 'low'|'medium'|'high' }[]>([]);

  useEffect(() => {
    // TODO: Replace with actual data fetching from new sources
    const mockAlerts = [
      { id: '1', title: 'New equipment added to ODIN', source: 'ODIN', ago: '2h ago', severity: 'low' as 'low', event: {} as any },
      { id: '2', title: 'DTIC report on UAVs published', source: 'DTIC', ago: '5h ago', severity: 'medium' as 'medium', event: {} as any },
      { id: '3', title: 'NGA Tearline update on regional activity', source: 'NGA Tearline', ago: '1d ago', severity: 'high' as 'high', event: {} as any },
    ];
    setAlerts(mockAlerts);
  }, []);

  return (
    <div className="bg-black text-white min-h-screen">
      <div className="container mx-auto px-6 py-8 space-y-8">
        <div className="grid md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <StatCard key={s.label} title={s.label} value={s.count} subtitle={s.subtitle} icon={s.icon} variant={s.variant} />
          ))}
        </div>

        <AlertList alerts={alerts} onSelect={() => {}} />

        <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 shadow-lg">
          <h2 className="text-xl font-bold text-white mb-4">Integration Notes</h2>
          <p className="text-gray-400">
            Sources now include a range of government and military public databases, providing access to unclassified defense information, geospatial intelligence, and logistics data. These channels are critical for maintaining a comprehensive operational picture.
          </p>
        </div>
      </div>
    </div>
  );
}