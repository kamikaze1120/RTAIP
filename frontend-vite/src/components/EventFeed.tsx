import React from 'react';
declare const puter: any;
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

export function EventFeed({ events, onSelect, focus }: { events: RtaEvent[]; onSelect?: (event: RtaEvent) => void; focus?: RtaEvent | null }) {
  const seen = new Set<string>();
  const clean = events.filter(e => { const key = `${String(e.source).toLowerCase()}-${e.id}`; if (seen.has(key)) return false; seen.add(key); return true; });

  if (focus) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold text-white">Event Detail</div>
          <div className="flex gap-2">
            <button className="px-3 py-1 text-xs rounded-md bg-blue-600/50 text-white" onClick={() => onSelect?.(focus)}>Unfocus</button>
            <button className="px-3 py-1 text-xs rounded-md bg-green-600/50 text-white" onClick={() => {
              const prompt = `Analyze this emergency event data and provide a summary of the situation and potential impact: ${JSON.stringify(focus, null, 2)}`;
              puter.ai.chat(prompt, { model: 'gemini-3-flash-preview' }).then((response: any) => {
                alert(response);
              });
            }}>Ask Gemini</button>
          </div>
        </div>
        <div className="mt-2 bg-black/20 p-3 rounded-md text-xs whitespace-pre-wrap text-gray-300">{JSON.stringify(focus, null, 2)}</div>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-lg p-2 shadow-lg">
      <div className="border-b border-white/20 px-2 py-1 flex items-center justify-between">
        <div className="text-lg font-bold text-white">Event Feed</div>
      </div>
      <ul className="divide-y divide-white/10 max-h-[420px] overflow-y-auto">
        {clean.map((event) => {
          const icon = iconFor(event.source);
          const summary = summarizeEvent(event);
          const confPct = typeof event.confidence === 'number' ? Math.round(event.confidence * 100) : '—';
          const sevPct = Math.round(eventSeverity(event) * 100);
          return (
            <li key={event.id} className="px-2 py-3">
              <div className="grid grid-cols-[auto_80px] gap-4 items-center">
                <div className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{icon}</span>
                    <span className="text-xs tracking-widest text-gray-400">{(event.source || 'UNKNOWN').toUpperCase()}</span>
                  </div>
                  <div className="text-sm text-gray-300">{summary}</div>
                  <div className="text-xs text-gray-400">Conf: {confPct}% • Severity: {sevPct}%</div>
                </div>
                <div className="flex justify-end">
                  <button className="px-3 py-1 text-xs rounded-md bg-blue-600/50 text-white" onClick={() => onSelect?.(event)}>Focus</button>
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