import React, { useEffect, useState } from 'react';
import { fetchUSGSAllDay, fetchNOAAAlerts, type RtaEvent } from '../services/data';
import MapComponent from '../components/MapComponent';
import EventFeed from '../components/EventFeed';
import AnalystPanel from '../components/AnalystPanel';

export default function MapPage() {
  const [events, setEvents] = useState<RtaEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const usgs = await fetchUSGSAllDay();
      const noaa = await fetchNOAAAlerts();
      const all = [...usgs, ...noaa];
      if (!cancelled) setEvents(all);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="px-6 pt-20">
      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <div className="border border-primary/20 clip-corner">
          <EventFeed events={events} onSelect={() => {}} />
        </div>
        <div className="border border-primary/20 clip-corner">
          <MapComponent events={events} />
          <AnalystPanel events={events} onAsk={() => {}} />
        </div>
      </div>
    </div>
  );
}