import React from 'react';
import { Info, AlertTriangle } from 'lucide-react';

import { RtaEvent } from '../services/data';

type Alert = { event: RtaEvent, id: string; title: string; source: string; ago: string; severity: 'low'|'medium'|'high' };

export default function AlertList({ alerts, onSelect }: { alerts: Alert[], onSelect: (alert: Alert) => void }) {
  const severityIcon = {
    low: <Info className="text-blue-400" />,
    medium: <AlertTriangle className="text-yellow-400" />,
    high: <AlertTriangle className="text-red-400" />,
  }
  const badge = (sev: Alert['severity']) => sev === 'high'
    ? 'bg-red-500/15 text-red-300 border border-red-500/20'
    : sev === 'medium'
    ? 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/20'
    : 'bg-blue-500/15 text-blue-300 border border-blue-500/20';
  return (
    <div className="bg-white/10 backdrop-blur-xl rounded-lg p-6 shadow-xl">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-300 tracking-widest uppercase">Alert Channel</div>
        <div className="text-xs text-gray-400">{alerts.length} active</div>
      </div>
      <div className="px-2 pb-3 space-y-2">
        {alerts.map(a => (
          <div key={a.id} className="px-3 py-2 rounded-md bg-black/20 flex items-center justify-between gap-3 transition-all hover:bg-black/30 hover:translate-x-[1px] hover:ring-1 hover:ring-white/10">
            <div className="flex items-center gap-3">
              {severityIcon[a.severity]}
              <div className="text-xs font-medium text-gray-200">
                {a.title}
                <div className="text-[11px] text-gray-400">{a.source} • {a.ago}</div>
              </div>
            </div>
            <div className={`px-2 py-1 rounded-md text-[10px] ${badge(a.severity)}`}>{a.severity.toUpperCase()}</div>
            <button onClick={() => onSelect(a)} className="text-xs text-blue-400 hover:text-blue-300">Focus</button>
          </div>
        ))}
      </div>
    </div>
  );
}