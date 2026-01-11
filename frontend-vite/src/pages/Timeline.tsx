import React, { useEffect, useMemo, useState } from 'react';
import { fetchBackendEvents, fetchGDACS, type RtaEvent, eventSeverity, fetchSupabaseEvents, getSupabaseConfig } from '../services/data';
import { NewHeader } from '../components/NewHeader';
import EventFeed from '../components/EventFeed';

export default function Timeline() {
  const [events, setEvents] = useState<RtaEvent[]>([]);
  const [autoplay, setAutoplay] = useState(false);
  const [filters, setFilters] = useState({ gdacs: true });
  const [minSev, setMinSev] = useState(0);
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState<RtaEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supa = getSupabaseConfig();
      let all: RtaEvent[] = [];
      if (supa.url && supa.anon) {
        try { all = await fetchSupabaseEvents(); } catch {}
      } else {
        const backend = await fetchBackendEvents();
        all = backend;
      }
      const fallback = (window.localStorage.getItem('useOpenFallback') || 'true') === 'true';
      if (all.length === 0 && fallback) {
        const now = new Date();
        const fromISO = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const toISO = now.toISOString();
        const [gdacs] = await Promise.all([
          fetchGDACS(fromISO, toISO),
        ]);
        all = [...gdacs];
      }
      all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      if (!cancelled) setEvents(all);
    })();
    return () => { cancelled = true; };
  }, []);

  const count = useMemo(() => events.length, [events]);
  const [replayHours, setReplayHours] = useState(12);
  const filtered = useMemo(() => {
    const cutoff = Date.now() - replayHours * 3600000;
    return events.filter(e => {
      const t = new Date(e.timestamp).getTime();
      if (isNaN(t) || t < cutoff) return false;
      const s = String(e.source || '').toLowerCase();
      if (s.includes('gdacs') && !filters.gdacs) return false;
      
      const sev = eventSeverity(e);
      if (Math.round(sev * 100) < minSev) return false;
      if (query && !JSON.stringify(e.data || {}).toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [events, replayHours]);
  

  useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(() => {
      setReplayHours((h) => (h > 1 ? h - 1 : 12));
    }, 1500);
    return () => clearInterval(id);
  }, [autoplay]);

  return (
    <div className="bg-black text-white min-h-screen">
      <NewHeader />
      <div className="container mx-auto px-6 py-24 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4 sticky top-24">
              <div className="text-lg font-bold text-white mb-4">Timeline Controls</div>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center justify-between text-xs text-gray-300 tracking-widest uppercase">
                    <span>Playback Window</span>
                    <span className="text-gray-400">{replayHours}h</span>
                  </label>
                  <input type="range" min="1" max="168" value={replayHours} onChange={(e) => setReplayHours(Number(e.target.value))} className="w-full mt-1" />
                </div>
                <div>
                  <div className="text-xs text-gray-300 tracking-widest uppercase mb-2">Sources</div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <label className="flex items-center gap-1"><input type="checkbox" checked={filters.gdacs} onChange={e => setFilters(f => ({ ...f, gdacs: e.target.checked }))} /> GDACS</label>
                  </div>
                </div>
                <div>
                  <label className="flex items-center justify-between text-xs text-gray-300 tracking-widest uppercase">
                    <span>Min Severity</span>
                    <span className="text-gray-400">{minSev}%</span>
                  </label>
                  <input type="range" min="0" max="100" value={minSev} onChange={(e) => setMinSev(Number(e.target.value))} className="w-full mt-1" />
                </div>
                <div>
                  <label className="text-xs text-gray-300 tracking-widest uppercase">Search</label>
                  <input className="w-full px-2 py-1 bg-black/20 border border-gray-700 rounded-md text-white mt-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Headline or data" />
                </div>
                <div className="pt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} />
                    Autoplay
                    <span className="text-xs text-gray-400">({filtered.length} / {count})</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div className="lg:col-span-3">
            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4">
              {events.length === 0 ? (
                <div className="px-4 pb-4 text-xs text-gray-400">No events available yet. Try again shortly or check backend ingestion.</div>
              ) : (
                <EventFeed events={filtered} onSelect={(e) => setFocus(f => f?.id === e.id ? null : e)} focus={focus} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}