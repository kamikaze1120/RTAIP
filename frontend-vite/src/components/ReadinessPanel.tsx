import React, { useMemo } from 'react';
import type { RtaEvent } from '../services/data';
import { globalThreatScore, eventSeverity } from '../services/data';

export default function ReadinessPanel({ events }: { events: RtaEvent[] }) {
  const gts = useMemo(() => globalThreatScore(events), [events]);
  const rate = useMemo(() => {
    const cutoff = Date.now() - 6 * 3600000;
    const recent = events.filter(e => { const t = new Date(e.timestamp).getTime(); return !isNaN(t) && t >= cutoff; });
    return Math.round(recent.length / 6); // events per hour
  }, [events]);
  const readiness = useMemo(() => Math.min(100, Math.round(100 - Math.max(0, gts - 300) / 7)), [gts]);
  const tMinus = useMemo(() => Math.max(0, Math.round(24 - gts / 40)), [gts]);
  const saturation = useMemo(() => {
    const avgSev = events.length ? events.map(eventSeverity).reduce((a,b)=>a+b,0)/events.length : 0;
    return Math.min(100, Math.round((rate * 5 + avgSev * 50)));
  }, [rate, events]);

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 shadow-lg">
      <div className="text-sm text-gray-300 tracking-widest uppercase mb-4">Action Readiness</div>
      <div className="grid grid-cols-3 gap-4 text-xs">
        <Gauge label="Readiness" value={readiness} color={readiness<40?'hsl(0 85% 55%)':readiness<70?'hsl(35 100% 50%)':'hsl(150 80% 45%)'} />
        <Gauge label="T-minus (h)" value={tMinus} color={'hsl(35 100% 50%)'} />
        <Gauge label="Saturation" value={saturation} color={'hsl(0 85% 55%)'} />
      </div>
      <div className="mt-4 text-xs text-gray-400">Events/hr: {rate} • Threat Score: {gts}</div>
    </div>
  );
}

function Gauge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-black/20 rounded-lg p-3">
      <div className="text-gray-400">{label}</div>
      <div className="mt-2 h-2 bg-gray-700 rounded-full relative">
        <div style={{ width: `${Math.min(100, value)}%`, background: color }} className="h-2 rounded-full" />
      </div>
      <div className="mt-1 text-right text-gray-300">{value}</div>
    </div>
  );
}