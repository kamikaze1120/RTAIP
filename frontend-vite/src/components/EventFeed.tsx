import React from 'react';
import type { RtaEvent } from '../services/data';
import { eventSeverity } from '../services/data';

const iconFor = (src?: string) => {
  const s = String(src || '').toLowerCase();
  if (s.includes('usgs')) return '🌋';
  if (s.includes('noaa')) return '⛈️';
  if (s.includes('gdacs')) return '🛰️';
  if (s.includes('census')) return '🧭';
  return '📍';
};

const summarizeEvent = (e: RtaEvent) => {
  const src = String(e.source || 'unknown').toLowerCase();
  const ts = new Date(e.timestamp).toLocaleString() || '—';
  if (src === 'usgs_seismic') {
    const m = (e.data as any)?.mag;
    const place = (e.data as any)?.place;
    const magLine = m != null ? `M${m}` : 'seismic activity';
    return `${magLine}${place ? ` near ${place}` : ''}. ${ts}`;
  }
  if (src === 'noaa_weather') {
    const h = (e.data as any)?.headline; const ev = (e.data as any)?.event;
    return `${ev || 'Weather alert'}${h ? ` — ${h}` : ''}. ${ts}`;
  }
  return `${(e.source || 'Event').toString()} at ${ts}`;
};

export function EventFeed({ events, onSelect }: { events: RtaEvent[]; onSelect?: (id: string) => void }) {
  const seen = new Set<string>();
  const clean = events.filter(e => { const key = `${String(e.source).toLowerCase()}-${e.id}`; if (seen.has(key)) return false; seen.add(key); return true; });
  return (
    <div className="p-2">
      <div className="border-b border-primary/20 px-2 py-1 flex items-center justify-between">
        <div className="text-primary">Event Feed</div>
      </div>
      <ul className="divide-y divide-primary/10 max-h-[420px] overflow-y-auto">
        {clean.map((event) => {
          const icon = iconFor(event.source);
          const summary = summarizeEvent(event);
          const confPct = typeof event.confidence === 'number' ? Math.round(event.confidence * 100) : '—';
          const sevPct = Math.round(eventSeverity(event) * 100);
          return (
            <li key={event.id} className="px-2 py-2">
              <div className="grid grid-cols-[6px_auto_80px] gap-2 items-center">
                <div className="bg-primary/60 rounded" />
                <div className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{icon}</span>
                    <span className="text-xs tracking-widest text-muted-foreground">{(event.source || 'UNKNOWN').toUpperCase()}</span>
                  </div>
                  <div className="text-sm">{summary}</div>
                  <div className="text-xs text-muted-foreground">Conf: {confPct}% • Severity: {sevPct}%</div>
                </div>
                <div className="flex justify-end">
                  <button className="px-2 py-1 text-xs clip-corner-sm bg-primary/20 text-primary border border-primary/30" onClick={() => onSelect?.(event.id)}>Focus</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default EventFeed;