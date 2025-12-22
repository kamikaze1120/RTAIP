import React, { useEffect, useMemo, useState } from 'react';
import { fetchBackendEvents, fetchUSGSAllDay, fetchGDACS, fetchFEMA, fetchHIFLDHospitals, fetchCensusCounties, fetchNOAAAlerts, type RtaEvent, correlationMatrix, eventSeverity, fetchSupabaseEvents, getSupabaseConfig } from '../services/data';
import EventFeed from '../components/EventFeed';
import CorrelationMatrix from '../components/CorrelationMatrix';

export default function Timeline() {
  const [events, setEvents] = useState<RtaEvent[]>([]);
  const [autoplay, setAutoplay] = useState(false);
  const [filters, setFilters] = useState({ usgs: true, noaa: true, gdacs: true, hifld: false, census: true });
  const [minSev, setMinSev] = useState(0);
  const [query, setQuery] = useState('');

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
        const [usgs, noaa, gdacs, fema, hifld, census] = await Promise.all([
          fetchUSGSAllDay(),
          fetchNOAAAlerts(),
          fetchGDACS(fromISO, toISO),
          fetchFEMA(),
          fetchHIFLDHospitals(),
          fetchCensusCounties(),
        ]);
        all = [...usgs, ...noaa, ...gdacs, ...fema, ...hifld, ...census];
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
      if (s.includes('usgs') && !filters.usgs) return false;
      if (s.includes('noaa') && !filters.noaa) return false;
      if (s.includes('gdacs') && !filters.gdacs) return false;
      if (s.includes('hifld') && !filters.hifld) return false;
      if (s.includes('census') && !filters.census) return false;
      const sev = eventSeverity(e);
      if (Math.round(sev * 100) < minSev) return false;
      if (query && !JSON.stringify(e.data || {}).toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [events, replayHours]);
  const corr = useMemo(() => correlationMatrix(filtered), [filtered]);

  useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(() => {
      setReplayHours((h) => (h > 1 ? h - 1 : 12));
    }, 1500);
    return () => clearInterval(id);
  }, [autoplay]);

  return (
    <div className="px-6 pt-20 space-y-4">
      <div className="space-y-1">
        <div className="text-xs tracking-widest text-muted-foreground uppercase">Chronology</div>
        <div className="text-4xl font-bold">Operational <span className="text-primary">Timeline</span></div>
        <div className="text-sm text-muted-foreground">Filter sources, set severity and playback window to review regional activity and correlations.</div>
      </div>
      <div className="clip-corner border border-primary/20">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-primary tracking-widest uppercase">Latest Events</div>
          <div className="text-xs text-muted-foreground flex items-center gap-3">
            <span>{filtered.length} / {count} shown</span>
            <label className="flex items-center gap-1"><input type="checkbox" checked={autoplay} onChange={(e)=>setAutoplay(e.target.checked)} /> Autoplay</label>
          </div>
        </div>
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-primary tracking-widest uppercase">Playback Window</div>
            <div className="text-xs text-muted-foreground">{replayHours}h</div>
          </div>
          <input type="range" min="1" max="168" value={replayHours} onChange={(e)=>setReplayHours(Number(e.target.value))} className="w-full" />
          <div className="mt-3 grid md:grid-cols-3 gap-3 text-xs">
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-1"><input type="checkbox" checked={filters.usgs} onChange={e=>setFilters(f=>({ ...f, usgs: e.target.checked }))} /> USGS</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={filters.noaa} onChange={e=>setFilters(f=>({ ...f, noaa: e.target.checked }))} /> NOAA</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={filters.gdacs} onChange={e=>setFilters(f=>({ ...f, gdacs: e.target.checked }))} /> GDACS</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={filters.hifld} onChange={e=>setFilters(f=>({ ...f, hifld: e.target.checked }))} /> HIFLD</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={filters.census} onChange={e=>setFilters(f=>({ ...f, census: e.target.checked }))} /> Census</label>
            </div>
            <div className="flex items-center gap-2">
              <span>Min severity</span>
              <input type="range" min="0" max="100" value={minSev} onChange={(e)=>setMinSev(Number(e.target.value))} />
              <span>{minSev}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span>Search</span>
              <input className="flex-1 px-2 py-1 bg-secondary border border-primary/20 clip-corner-sm" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Headline or data" />
            </div>
          </div>
        </div>
        {events.length === 0 ? (
          <div className="px-4 pb-4 text-xs text-muted-foreground">No events available yet. Try again shortly or check backend ingestion.</div>
        ) : (
          <EventFeed events={filtered} onSelect={() => {}} />
        )}
      </div>
      <div className="clip-corner border border-primary/20 p-4">
        <div className="text-sm text-primary tracking-widest uppercase mb-2">Correlation Snapshot</div>
        <div className="text-xs text-muted-foreground mb-2">Before / During / After analysis: adjust the slider to observe correlation changes across sources.</div>
        <CorrelationMatrix matrix={corr} />
      </div>
    </div>
  );
}