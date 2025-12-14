import React from 'react';
import StatCard from '../components/StatCard';
import TacticalGrid from '../components/TacticalGrid';
import AlertList from '../components/AlertList';
import SystemStats from '../components/SystemStats';
import { Database, Users, ShieldAlert, Shield } from 'lucide-react';

export default function Dashboard() {
  const alerts = [
    { id: 'a1', title: 'Unauthorized access attempt detected in Sector 7', source: 'Perimeter Defense', ago: '28 min ago', severity: 'high' as const },
    { id: 'a2', title: 'Elevated activity levels in monitoring zone Alpha', source: 'Satellite Grid', ago: '5 min ago', severity: 'medium' as const },
    { id: 'a3', title: 'Routine patrol completed successfully', source: 'Unit: delta-4', ago: '12 min ago', severity: 'low' as const },
  ];
  const stats = [
    { label: 'CPU load', value: 34 },
    { label: 'Memory', value: 67 },
    { label: 'Network', value: 88, color: 'hsl(35 100% 50% / 0.8)' },
    { label: 'Security', value: 18, color: 'hsl(0 85% 55% / 0.8)' },
    { label: 'Power', value: 12 },
  ];
  return (
    <div className="px-6 pt-20 space-y-6">
      <div className="space-y-1">
        <div className="text-xs tracking-widest text-muted-foreground uppercase">Real-Time Tactical Analysis Intelligence Platform</div>
        <div className="text-4xl font-bold">Command <span className="text-primary">Center</span></div>
        <div className="text-sm text-muted-foreground">Advanced situational awareness and threat monitoring. All systems synchronized and operational.</div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <StatCard title="Active Sources" value={12} subtitle="3 pending sync" icon={<Database className="w-4 h-4" />} />
        <StatCard title="Personnel" value={47} subtitle="All units deployed" icon={<Users className="w-4 h-4" />} />
        <StatCard title="Active Threats" value={3} subtitle="Under monitoring" icon={<ShieldAlert className="w-4 h-4" />} variant="warning" />
        <StatCard title="Security Level" value={'ALPHA'} subtitle="Elevated" icon={<Shield className="w-4 h-4" />} variant="danger" />
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