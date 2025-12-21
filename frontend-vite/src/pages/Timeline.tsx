import React, { useEffect, useMemo, useState } from 'react';
import { fetchBackendEvents, fetchUSGSAllDay, fetchNOAAAlerts, fetchGDACS, fetchFEMA, fetchHIFLDHospitals, fetchCensusCounties, type RtaEvent, correlationMatrix } from '../services/data';
import EventFeed from '../components/EventFeed';
import CorrelationMatrix from '../components/CorrelationMatrix';

export default function Timeline() {
  const [events, setEvents] = useState<RtaEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const backend = await fetchBackendEvents();
      let all: RtaEvent[] = backend;
      if (all.length === 0) {
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
    return events.filter(e => { const t = new Date(e.timestamp).getTime(); return !isNaN(t) && t >= cutoff; });
  }, [events, replayHours]);
  const corr = useMemo(() => correlationMatrix(filtered), [filtered]);

  return (
    <div className="px-6 pt-20 space-y-4">
      <div className="space-y-1">
        <div className="text-xs tracking-widest text-muted-foreground uppercase">Chronology</div>
        <div className="text-4xl font-bold">Event <span className="text-primary">Timeline</span></div>
        <div className="text-sm text-muted-foreground">Ordered by most recent. Combined across all sources for operational review.</div>
      </div>
      <div className="clip-corner border border-primary/20">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-primary tracking-widest uppercase">Latest Events</div>
          <div className="text-xs text-muted-foreground">{filtered.length} / {count} shown</div>
        </div>
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-primary tracking-widest uppercase">Playback Window</div>
            <div className="text-xs text-muted-foreground">{replayHours}h</div>
          </div>
          <input type="range" min="1" max="168" value={replayHours} onChange={(e)=>setReplayHours(Number(e.target.value))} className="w-full" />
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