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
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 shadow-lg">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-300 tracking-widest uppercase">Alert Channel</div>
        <div className="text-xs text-gray-400">{alerts.length} active</div>
      </div>
      <div className="px-2 pb-3 space-y-2">
        {alerts.map(a => (
          <div key={a.id} className="px-3 py-2 rounded-md bg-black/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {severityIcon[a.severity]}
              <div className="text-xs font-medium text-gray-200">
                {a.title}
                <div className="text-[11px] text-gray-400">{a.source} • {a.ago}</div>
              </div>
            </div>
            <button onClick={() => onSelect(a)} className="text-xs text-blue-400 hover:text-blue-300">Focus</button>
          </div>
        ))}
      </div>
    </div>
  );
}