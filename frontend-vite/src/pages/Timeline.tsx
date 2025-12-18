import React, { useEffect, useMemo, useState } from 'react';
import { fetchUSGSAllDay, fetchNOAAAlerts, fetchGDACS, fetchFEMA, fetchHIFLDHospitals, fetchCensusCounties, type RtaEvent } from '../services/data';
import EventFeed from '../components/EventFeed';

export default function Timeline() {
  const [events, setEvents] = useState<RtaEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
      const all = [...usgs, ...noaa, ...gdacs, ...fema, ...hifld, ...census];
      all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      if (!cancelled) setEvents(all);
    })();
    return () => { cancelled = true; };
  }, []);

  const count = useMemo(() => events.length, [events]);

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
          <div className="text-xs text-muted-foreground">{count} total</div>
        </div>
        <EventFeed events={events} onSelect={() => {}} />
      </div>
    </div>
  );
}