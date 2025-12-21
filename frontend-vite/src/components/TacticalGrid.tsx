import React from 'react';
import type { RtaEvent } from '../services/data';

export default function TacticalGrid({ events = [] }: { events?: RtaEvent[] }) {
  const pts = events.filter(e => e.latitude != null && e.longitude != null).slice(0, 200);
  const toX = (lon: number) => `${((lon + 180) / 360) * 100}%`;
  const toY = (lat: number) => `${(1 - (lat + 90) / 180) * 100}%`;
  const colorFor = (src: string) => {
    const s = String(src || '').toLowerCase();
    if (s.includes('usgs')) return 'hsl(0 85% 55% / 0.9)';
    if (s.includes('noaa')) return 'hsl(35 100% 50% / 0.9)';
    if (s.includes('gdacs')) return 'hsl(180 100% 50% / 0.9)';
    if (s.includes('fema')) return 'hsl(150 80% 45% / 0.9)';
    return 'hsl(180 100% 50% / 0.6)';
  };
  const counters = {
    usgs: events.filter(e => String(e.source).toLowerCase().includes('usgs')).length,
    noaa: events.filter(e => String(e.source).toLowerCase().includes('noaa')).length,
    gdacs: events.filter(e => String(e.source).toLowerCase().includes('gdacs')).length,
    fema: events.filter(e => String(e.source).toLowerCase().includes('fema')).length,
  };
  return (
    <div className="clip-corner border border-primary/20 bg-background/30">
      <div className="relative h-[420px]">
        <div className="absolute inset-2 border border-primary/20" />
        <div className="absolute inset-0">
          <svg width="100%" height="100%">
            <circle cx="50%" cy="55%" r="60" fill="none" stroke="hsl(180 100% 50% / 0.15)" />
            <circle cx="50%" cy="55%" r="30" fill="none" stroke="hsl(180 100% 50% / 0.12)" />
            {pts.map((e, i) => (
              <g key={i}>
                <circle cx={toX(e.longitude as number)} cy={toY(e.latitude as number)} r={4} fill={colorFor(e.source)} />
                <title>{`${e.source} • ${new Date(e.timestamp).toUTCString()}`}</title>
              </g>
            ))}
          </svg>
        </div>
        <div className="absolute top-2 left-2 text-[11px] text-muted-foreground bg-background/60 px-2 py-1 clip-corner-sm border border-primary/20">
          USGS {counters.usgs} • NOAA {counters.noaa} • GDACS {counters.gdacs} • FEMA {counters.fema}
        </div>
        <div className="absolute bottom-2 right-2 text-[11px] text-muted-foreground bg-background/60 px-2 py-1 clip-corner-sm border border-primary/20">
          <span style={{ color: 'hsl(0 85% 55%)' }}>●</span> USGS
          <span className="ml-2" style={{ color: 'hsl(35 100% 50%)' }}>●</span> NOAA
          <span className="ml-2" style={{ color: 'hsl(180 100% 50%)' }}>●</span> GDACS
          <span className="ml-2" style={{ color: 'hsl(150 80% 45%)' }}>●</span> FEMA
        </div>
      </div>
    </div>
  );
}