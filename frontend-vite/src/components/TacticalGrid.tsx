import React, { useMemo } from 'react';
import type { RtaEvent } from '../services/data';
import { topClusters } from '../services/data';

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
  const usgsClusters = useMemo(() => topClusters(events.filter(e => String(e.source).toLowerCase().includes('usgs'))), [events]);
  const noaaClusters = useMemo(() => topClusters(events.filter(e => String(e.source).toLowerCase().includes('noaa'))), [events]);
  const gdacsClusters = useMemo(() => topClusters(events.filter(e => String(e.source).toLowerCase().includes('gdacs'))), [events]);
  const femaClusters = useMemo(() => topClusters(events.filter(e => String(e.source).toLowerCase().includes('fema'))), [events]);
  return (
    <div className="clip-corner border border-primary/20 bg-secondary">
      <div className="relative h-[420px]">
        <div className="absolute inset-2 border border-primary/20" />
        <div className="absolute inset-0">
          <svg width="100%" height="100%">
            <defs>
              <linearGradient id="bggrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="100%" height="100%" fill="url(#bggrad)" />
            {[10,20,30,40,50,60,70,80,90].map((p) => (
              <line key={`v${p}`} x1={`${p}%`} y1="0" x2={`${p}%`} y2="100%" stroke="rgba(255,255,255,0.08)" />
            ))}
            {[10,20,30,40,50,60,70,80,90].map((p) => (
              <line key={`h${p}`} x1="0" y1={`${p}%`} x2="100%" y2={`${p}%`} stroke="rgba(255,255,255,0.08)" />
            ))}
            <circle cx="50%" cy="55%" r="60" fill="none" stroke="rgba(255,255,255,0.15)" />
            <circle cx="50%" cy="55%" r="30" fill="none" stroke="rgba(255,255,255,0.12)" />
            {pts.map((e, i) => (
              <g key={i}>
                <circle cx={toX(e.longitude as number)} cy={toY(e.latitude as number)} r={4} fill={colorFor(e.source)} />
                <circle cx={toX(e.longitude as number)} cy={toY(e.latitude as number)} r={12} fill={colorFor(e.source).replace('/ 0.9', '/ 0.15')} className="animate-ping" />
                <title>{`${e.source} • ${new Date(e.timestamp).toUTCString()}`}</title>
              </g>
            ))}
            {[usgsClusters, noaaClusters, gdacsClusters, femaClusters].map((list, idx) => {
              const c = idx===0?'hsl(0 85% 55% / 0.22)':idx===1?'hsl(35 100% 50% / 0.22)':idx===2?'hsl(180 100% 50% / 0.22)':'hsl(150 80% 45% / 0.22)';
              const r = idx===0?8:idx===1?6:idx===2?10:5; // percent radii
              return list.map((cl, i) => (
                <circle key={`${idx}-${i}`} cx={toX(cl.lon)} cy={toY(cl.lat)} r={`${r}%`} fill={c} />
              ));
            })}
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