import React from 'react';
import { AlertCard, type SeverityLevel } from './DesignSystem';

import { RtaEvent } from '../services/data';

type Alert = { event: RtaEvent, id: string; title: string; source: string; ago: string; severity: 'low'|'medium'|'high' };

export default function AlertList({ alerts, onSelect }: { alerts: Alert[], onSelect: (alert: Alert) => void }) {
  const toLevel = (sev: Alert['severity']): SeverityLevel => sev === 'high' ? 'critical' : sev === 'medium' ? 'warning' : 'info'
  return (
    <div className="bg-white/10 backdrop-blur-xl rounded-lg p-6 shadow-xl">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-300 tracking-widest uppercase">Alert Channel</div>
        <div className="text-xs text-gray-400">{alerts.length} active</div>
      </div>
      <div className="px-2 pb-3 space-y-2">
        {alerts.map(a => (
          <AlertCard key={a.id} title={a.title} subtitle={`${a.source} • ${a.ago}`} level={toLevel(a.severity)} right={<button onClick={() => onSelect(a)} className="text-xs text-blue-400 hover:text-blue-300">Focus</button>} />
        ))}
      </div>
    </div>
  );
}